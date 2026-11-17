-- Phase 4 (A3): payments, payment_items, offline_payments, refunds, stripe_webhook_events
--
-- One payments row = one Stripe PaymentIntent; one payment can cover several requests of the
-- SAME household (the Pay screen sums them). Written only by service-role Edge Functions and
-- SECURITY DEFINER functions; clients read their household's rows (staff: their event's rows).
-- No card data is stored: only Stripe object ids.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  -- Reserved first (null), then attached after the PaymentIntent is created with an idempotency
  -- key derived from this row's id, so two racing calls can never create two intents.
  stripe_payment_intent_id text unique
    constraint payments_pi_format check (stripe_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  stripe_charge_id text unique constraint payments_charge_format check (stripe_charge_id ~ '^(ch|py)_[A-Za-z0-9_]+$'),
  connected_account_id uuid not null references public.connected_accounts (id) on delete restrict,
  household_id uuid not null references public.households (id) on delete restrict,
  payer_profile_id uuid references public.profiles (id) on delete set null,
  currency text not null default 'usd' constraint payments_currency check (currency = 'usd'),
  fee_policy text not null constraint payments_fee_policy check (fee_policy in ('absorb', 'pass_on')),
  -- Server-computed. base + platform + passthrough = total, to the cent (checked).
  base_cents integer not null constraint payments_base_positive check (base_cents > 0),
  platform_fee_cents integer not null default 0 constraint payments_platform_fee_nonneg check (platform_fee_cents >= 0),
  processing_fee_passthrough_cents integer not null default 0
    constraint payments_passthrough_nonneg check (processing_fee_passthrough_cents >= 0),
  total_charged_cents integer not null,
  -- Estimate used to size the pass-through; the actual comes from the balance transaction.
  estimated_stripe_fee_cents integer not null constraint payments_est_fee_nonneg check (estimated_stripe_fee_cents >= 0),
  stripe_fee_cents integer constraint payments_fee_nonneg check (stripe_fee_cents >= 0),
  net_to_account_cents integer,
  status text not null default 'requires_payment_method'
    constraint payments_status check (status in
      ('requires_payment_method', 'processing', 'succeeded', 'failed', 'canceled',
       'partially_refunded', 'refunded')),
  -- Hash of the sorted request ids, used to find and reuse an open intent for the same set.
  request_set_key text not null constraint payments_set_key_length check (char_length(request_set_key) between 8 and 64),
  receipt_display_id text unique constraint payments_receipt_format check (receipt_display_id ~ '^RCP-[0-9]{4,}$'),
  succeeded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_total_reconciles check (total_charged_cents = base_cents + platform_fee_cents + processing_fee_passthrough_cents)
);
create index payments_household_id_idx on public.payments (household_id);
create index payments_connected_account_id_idx on public.payments (connected_account_id);
create index payments_payer_profile_id_idx on public.payments (payer_profile_id) where payer_profile_id is not null;
create index payments_request_set_key_idx on public.payments (request_set_key);
create index payments_open_idx on public.payments (updated_at) where status in ('requires_payment_method', 'processing', 'failed');
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- Money fields are frozen at creation; only status/Stripe ids/actual fee fields move.
create function private.guard_payment()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.base_cents is distinct from old.base_cents
     or new.platform_fee_cents is distinct from old.platform_fee_cents
     or new.processing_fee_passthrough_cents is distinct from old.processing_fee_passthrough_cents
     or new.total_charged_cents is distinct from old.total_charged_cents
     or new.household_id is distinct from old.household_id
     or new.connected_account_id is distinct from old.connected_account_id
     or new.fee_policy is distinct from old.fee_policy
     or new.currency is distinct from old.currency
     or new.request_set_key is distinct from old.request_set_key then
    raise exception 'payment_immutable' using errcode = '23514';
  end if;
  if old.stripe_payment_intent_id is not null and new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id then
    raise exception 'payment_immutable' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'requires_payment_method' and new.status in ('processing', 'succeeded', 'failed', 'canceled'))
    or (old.status = 'processing' and new.status in ('requires_payment_method', 'succeeded', 'failed', 'canceled'))
    or (old.status = 'failed' and new.status in ('requires_payment_method', 'processing', 'succeeded', 'canceled'))
    or (old.status = 'succeeded' and new.status in ('partially_refunded', 'refunded'))
    or (old.status = 'partially_refunded' and new.status in ('refunded'))) then
    raise exception 'invalid_status_transition' using errcode = '23514', detail = format('%s -> %s', old.status, new.status);
  end if;
  return new;
end;
$$;
create trigger payments_guard before update on public.payments
  for each row execute function private.guard_payment();

create table public.payment_items (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  payment_request_id uuid not null references public.payment_requests (id) on delete restrict,
  -- The request's base amount; fee allocation follows (largest remainder) so items sum to the payment.
  amount_cents integer not null constraint payment_items_amount_positive check (amount_cents > 0),
  platform_fee_cents integer not null default 0 constraint payment_items_platform_fee_nonneg check (platform_fee_cents >= 0),
  processing_fee_passthrough_cents integer not null default 0
    constraint payment_items_passthrough_nonneg check (processing_fee_passthrough_cents >= 0),
  -- False once the payment is canceled: frees the request for a new payment.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (payment_id, payment_request_id)
);
-- A request can be in at most one active payment (blocks double charging at the data layer).
create unique index payment_items_one_active_per_request on public.payment_items (payment_request_id) where is_active;
create index payment_items_payment_request_id_idx on public.payment_items (payment_request_id);

create function private.guard_payment_item()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.payment_id is distinct from old.payment_id or new.payment_request_id is distinct from old.payment_request_id
     or new.amount_cents is distinct from old.amount_cents
     or new.platform_fee_cents is distinct from old.platform_fee_cents
     or new.processing_fee_passthrough_cents is distinct from old.processing_fee_passthrough_cents
     or (old.is_active = false and new.is_active) then
    raise exception 'payment_item_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger payment_items_guard before update on public.payment_items
  for each row execute function private.guard_payment_item();

-- A canceled payment releases its requests' items.
create function private.release_items_on_cancel()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.payment_items set is_active = false where payment_id = new.id and is_active;
  return null;
end;
$$;
create trigger payments_release_items after update of status on public.payments
  for each row when (new.status = 'canceled' and old.status is distinct from 'canceled')
  execute function private.release_items_on_cancel();

create table public.offline_payments (
  id uuid primary key default gen_random_uuid(),
  payment_request_id uuid not null unique references public.payment_requests (id) on delete restrict,
  method text not null constraint offline_payments_method check (method in ('cash', 'check', 'other')),
  note text constraint offline_payments_note_length check (char_length(note) <= 300),
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index offline_payments_recorded_by_idx on public.offline_payments (recorded_by) where recorded_by is not null;

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  payment_item_id uuid references public.payment_items (id) on delete restrict,
  -- Reserved first (null), attached after the Stripe call; the webhook finalizes the status.
  stripe_refund_id text unique constraint refunds_stripe_id_format check (stripe_refund_id ~ '^(re|pyr)_[A-Za-z0-9_]+$'),
  amount_cents integer not null constraint refunds_amount_positive check (amount_cents > 0),
  reason text constraint refunds_reason_length check (char_length(reason) <= 300),
  requested_by uuid references public.profiles (id) on delete set null,
  status text not null default 'pending'
    constraint refunds_status check (status in ('pending', 'succeeded', 'failed', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_payment_id_idx on public.refunds (payment_id);
create index refunds_payment_item_id_idx on public.refunds (payment_item_id) where payment_item_id is not null;
create index refunds_requested_by_idx on public.refunds (requested_by) where requested_by is not null;
create trigger refunds_set_updated_at before update on public.refunds
  for each row execute function public.set_updated_at();

-- The webhook ledger: a unique stripe_event_id makes a replayed delivery a no-op. The stored
-- payload is minimal on purpose (type, object id, account): never card or personal data.
create table public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique constraint stripe_webhook_events_id_format check (stripe_event_id ~ '^evt_[A-Za-z0-9_]+$'),
  type text not null constraint stripe_webhook_events_type_length check (char_length(type) <= 100),
  livemode boolean not null default false,
  stripe_account_id text,
  payload jsonb not null default '{}' constraint stripe_webhook_events_payload_size check (pg_column_size(payload) <= 4096),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  error text constraint stripe_webhook_events_error_length check (char_length(error) <= 500)
);
create index stripe_webhook_events_unprocessed_idx on public.stripe_webhook_events (received_at) where processed_at is null;

-- Helpers --------------------------------------------------------------------
-- Staff of the event(s) behind a payment (every item of a payment is the same household, but
-- the events may differ; any issuer staff of one of them may see that payment).
create function private.is_payment_staff(p_payment_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.payment_items i
    join public.payment_requests r on r.id = i.payment_request_id
    where i.payment_id = p_payment_id and private.is_event_staff(r.payment_event_id));
$$;

create function private.can_read_payment(p_payment_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.payments p
                 where p.id = p_payment_id and private.is_household_guardian(p.household_id))
      or private.is_payment_staff(p_payment_id);
$$;

-- RLS ------------------------------------------------------------------------
alter table public.payments enable row level security;
alter table public.payment_items enable row level security;
alter table public.offline_payments enable row level security;
alter table public.refunds enable row level security;
alter table public.stripe_webhook_events enable row level security;
revoke all on public.payments, public.payment_items, public.offline_payments, public.refunds, public.stripe_webhook_events
  from anon, authenticated;
grant select on public.payments, public.payment_items, public.offline_payments, public.refunds to authenticated;
-- stripe_webhook_events: no grants, no policies. Service role only.

create policy "Household guardians and issuer staff read payments" on public.payments
  for select to authenticated using (private.can_read_payment(id));
create policy "Household guardians and issuer staff read payment items" on public.payment_items
  for select to authenticated using (private.can_read_payment(payment_id));
create policy "Issuer staff read offline payments" on public.offline_payments
  for select to authenticated using (exists (
    select 1 from public.payment_requests r where r.id = payment_request_id and private.is_event_staff(r.payment_event_id)));
create policy "Household guardians and issuer staff read refunds" on public.refunds
  for select to authenticated using (private.can_read_payment(payment_id));

revoke execute on function private.guard_payment(), private.guard_payment_item(), private.release_items_on_cancel(),
  private.is_payment_staff(uuid), private.can_read_payment(uuid) from public, anon, authenticated;
grant execute on function private.is_payment_staff(uuid), private.can_read_payment(uuid) to authenticated;
