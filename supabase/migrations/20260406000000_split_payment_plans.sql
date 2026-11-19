-- Split payments (installment plans), step 1: schema, schedule generator, state machines.
--
-- A family can pay a payment request in 2 to 6 installments when the event allows it. This migration adds:
--   * plan terms on payment_events (which sizes, cadence), frozen at publish like the other money terms;
--   * payment_request_installments, one row per installment, with its own state machine;
--   * a request status roll-up (unpaid -> processing -> partially_paid -> paid) derived from its installments;
--   * payment_items.installment_id, and the one-live-payment-per-request/installment rule;
--   * the pure schedule generator (mirrored in packages/core/src/payment-plans.ts and held to the same vectors),
--     the server-side list of sizes a family may choose NOW, and svc_create_plan (service role).
-- Charging, quoting with a plan, autopay, dunning and refunds across installments follow in later steps.
--
-- Rules: amounts are integer cents; the base is split evenly and the remainder cents go on the FIRST installment;
-- installment 1 is due at checkout, the rest every cadence step (weekly 7 days, biweekly 14 days, monthly = same time of
-- day, calendar month later, clamped to month end), computed in UTC from the checkout instant (so DST never shifts a
-- due instant); the last installment must be due on or before the event's due date; every installment must be at least
-- 50 cents (Stripe's USD minimum). A request with plan_count 1 (or null) has no installment rows and behaves as before.

-- Plan terms on the event ------------------------------------------------------------------
create function private.valid_plan_options(p_options integer[])
returns boolean language sql immutable set search_path = ''
as $$
  select p_options is not null
     and cardinality(p_options) between 1 and 6
     and p_options <@ array[1, 2, 3, 4, 5, 6]
     and cardinality(p_options) = (select count(distinct x) from unnest(p_options) x);
$$;

alter table public.payment_events
  add column plan_options integer[] not null default array[1]
    constraint payment_events_plan_options check (private.valid_plan_options(plan_options)),
  add column plan_cadence text not null default 'monthly'
    constraint payment_events_plan_cadence check (plan_cadence in ('weekly', 'biweekly', 'monthly')),
  -- Reserved for an optional deposit (first installment fixed or percent). No UI yet: must stay null.
  add column plan_deposit_kind text constraint payment_events_plan_deposit_kind check (plan_deposit_kind in ('fixed', 'percent')),
  add column plan_deposit_value integer constraint payment_events_plan_deposit_value check (plan_deposit_value > 0),
  add constraint payment_events_plan_deposit_pair check ((plan_deposit_kind is null) = (plan_deposit_value is null)),
  add constraint payment_events_plan_deposit_unused check (plan_deposit_kind is null);

-- Money-defining fields are frozen once an event leaves draft; plan terms join them.
create or replace function private.guard_payment_event()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.status <> 'draft' and (
       new.amount_cents is distinct from old.amount_cents
       or new.currency is distinct from old.currency
       or new.fee_policy is distinct from old.fee_policy
       or new.fee_config is distinct from old.fee_config
       or new.audience is distinct from old.audience
       or new.audience_player_ids is distinct from old.audience_player_ids
       or new.team_id is distinct from old.team_id
       or new.club_id is distinct from old.club_id
       or new.connected_account_id is distinct from old.connected_account_id
       or new.plan_options is distinct from old.plan_options
       or new.plan_cadence is distinct from old.plan_cadence
       or new.plan_deposit_kind is distinct from old.plan_deposit_kind
       or new.plan_deposit_value is distinct from old.plan_deposit_value) then
    raise exception 'payment_event_locked' using errcode = '23514',
      detail = 'Amount, audience, fee and plan terms cannot change after publishing.';
  end if;
  if old.status in ('cancelled') and new.status <> old.status then
    raise exception 'invalid_status_transition' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Staff set the plan terms of a DRAFT event (a sibling of update_payment_event, which keeps its signature).
create function public.set_payment_event_plan(p_event_id uuid, p_options integer[], p_cadence text)
returns void language plpgsql security definer set search_path = ''
as $$
declare e public.payment_events;
begin
  select * into e from public.payment_events where id = p_event_id for update;
  if not found or not private.is_issuer_staff(e.team_id, e.club_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if e.status <> 'draft' then
    raise exception 'not_draft' using errcode = '23514', detail = 'Plan terms can only change while the event is a draft.';
  end if;
  if not private.valid_plan_options(p_options) then raise exception 'invalid_plan_options' using errcode = '22023'; end if;
  if p_cadence not in ('weekly', 'biweekly', 'monthly') then raise exception 'invalid_plan_cadence' using errcode = '22023'; end if;
  update public.payment_events set plan_options = (select array_agg(x order by x) from unnest(p_options) x), plan_cadence = p_cadence
    where id = p_event_id;
  perform private.write_audit('payment_event.plan', 'payment_events', p_event_id, e.team_id, e.club_id,
    jsonb_build_object('plan_options', e.plan_options, 'plan_cadence', e.plan_cadence),
    jsonb_build_object('plan_options', p_options, 'plan_cadence', p_cadence));
end;
$$;

-- The schedule generator (pure and deterministic) ---------------------------------------------
-- `k` cadence steps after p_start. Monthly clamps to the end of the target month (Jan 31 -> Feb 28 -> Mar 31) because each
-- date is computed from the START, never from the previous installment.
create function private.plan_due_at(p_start timestamptz, p_cadence text, p_k integer)
returns timestamptz language sql immutable set search_path = ''
as $$
  select case p_cadence
    when 'weekly' then p_start + p_k * interval '7 days'
    when 'biweekly' then p_start + p_k * interval '14 days'
    when 'monthly' then ((p_start at time zone 'UTC') + p_k * interval '1 month') at time zone 'UTC'
  end;
$$;

-- Installment amounts and due instants. n = 1 returns the single full-amount installment due at checkout.
create function private.generate_plan(p_amount integer, p_n integer, p_cadence text, p_start timestamptz)
returns table (sequence integer, amount_cents integer, due_at timestamptz)
language plpgsql immutable set search_path = ''
as $$
begin
  if p_n is null or p_n not between 1 and 6 then raise exception 'invalid_plan_size' using errcode = '22023'; end if;
  if p_amount is null or p_amount < 50 * p_n then raise exception 'invalid_plan_amount' using errcode = '22023'; end if;
  if p_cadence not in ('weekly', 'biweekly', 'monthly') then raise exception 'invalid_plan_cadence' using errcode = '22023'; end if;
  return query
    select s::integer,
           (p_amount / p_n + case when s = 1 then p_amount % p_n else 0 end)::integer,
           private.plan_due_at(p_start, p_cadence, s - 1)
    from generate_series(1, p_n) s;
end;
$$;

-- Can a plan of this size fit? Size 1 always can. Otherwise every installment is >= 50c and the LAST one is due on or
-- before the event due date (spacing is the cadence, never under 7 days).
create function private.plan_fits(p_amount integer, p_n integer, p_cadence text, p_start timestamptz, p_due timestamptz)
returns boolean language sql immutable set search_path = ''
as $$
  select p_n = 1 or (
    p_n between 2 and 6 and p_amount / p_n >= 50
    and private.plan_due_at(p_start, p_cadence, p_n - 1) <= p_due);
$$;

-- The sizes a family may choose at p_start: the event's options that fit. If none fit, pay in full (1) so a family
-- is never locked out of paying.
create function private.available_plan_sizes(p_options integer[], p_amount integer, p_cadence text, p_start timestamptz, p_due timestamptz)
returns integer[] language sql immutable set search_path = ''
as $$
  select coalesce(
    nullif(array(select n from unnest(p_options) n where private.plan_fits(p_amount, n, p_cadence, p_start, p_due) order by n), '{}'),
    array[1]);
$$;

-- Installments ---------------------------------------------------------------------------------
alter table public.payment_requests
  add column plan_count smallint constraint payment_requests_plan_count check (plan_count between 1 and 6);

create table public.payment_request_installments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.payment_requests (id) on delete restrict,
  sequence smallint not null constraint installments_sequence check (sequence between 1 and 6),
  amount_cents integer not null constraint installments_amount check (amount_cents >= 50),
  due_at timestamptz not null,
  status text not null default 'scheduled'
    constraint installments_status check (status in
      ('scheduled', 'due', 'processing', 'paid', 'paid_offline', 'failed', 'waived', 'cancelled', 'refunded', 'partially_refunded')),
  attempt_count smallint not null default 0 constraint installments_attempts check (attempt_count >= 0),
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  paid_at timestamptz,
  waived_by uuid references public.profiles (id) on delete set null,
  waived_at timestamptz,
  note text constraint installments_note_length check (char_length(note) <= 300),
  -- Reminder bookkeeping per installment: manual reminders at most once per 24h; the cron notices once each.
  last_reminded_at timestamptz,
  due_soon_notified_at timestamptz,
  overdue_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, sequence),
  -- Lets payment_items carry (installment, request) and prove they belong together.
  unique (id, request_id)
);
create index installments_request_id_idx on public.payment_request_installments (request_id);
create index installments_open_due_idx on public.payment_request_installments (due_at) where status in ('scheduled', 'due', 'failed');
create index installments_waived_by_idx on public.payment_request_installments (waived_by) where waived_by is not null;
create trigger installments_set_updated_at before update on public.payment_request_installments
  for each row execute function public.set_updated_at();

-- State machine + immutability, even for the service role. Amount, sequence and owner never change; due_at moves only
-- while an installment is still open (a staff restructure).
create function private.guard_installment()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.request_id is distinct from old.request_id or new.sequence is distinct from old.sequence
     or new.amount_cents is distinct from old.amount_cents then
    raise exception 'installment_immutable' using errcode = '23514';
  end if;
  if new.due_at is distinct from old.due_at and old.status not in ('scheduled', 'due', 'failed') then
    raise exception 'installment_immutable' using errcode = '23514', detail = 'Only an open installment can be rescheduled.';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'scheduled' and new.status in ('due', 'processing', 'paid', 'paid_offline', 'waived', 'cancelled'))
    or (old.status = 'due' and new.status in ('scheduled', 'processing', 'paid', 'paid_offline', 'waived', 'cancelled'))
    or (old.status = 'processing' and new.status in ('scheduled', 'due', 'paid', 'failed', 'cancelled'))
    or (old.status = 'failed' and new.status in ('due', 'processing', 'paid', 'paid_offline', 'waived', 'cancelled'))
    or (old.status = 'paid' and new.status in ('partially_refunded', 'refunded'))
    or (old.status = 'partially_refunded' and new.status = 'refunded')) then
    raise exception 'invalid_status_transition' using errcode = '23514', detail = format('%s -> %s', old.status, new.status);
  end if;
  return new;
end;
$$;
create trigger installments_guard before update on public.payment_request_installments
  for each row execute function private.guard_installment();

-- Request transitions gain partially_paid.
create or replace function private.guard_payment_request()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.amount_cents is distinct from old.amount_cents
     or new.player_id is distinct from old.player_id
     or new.household_id is distinct from old.household_id
     or new.payment_event_id is distinct from old.payment_event_id
     or new.display_id is distinct from old.display_id then
    raise exception 'payment_request_immutable' using errcode = '23514';
  end if;
  if new.plan_count is distinct from old.plan_count and old.plan_count is not null then
    raise exception 'payment_request_immutable' using errcode = '23514', detail = 'A plan cannot change size once chosen.';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'unpaid' and new.status in ('processing', 'partially_paid', 'paid', 'paid_offline', 'waived', 'cancelled'))
    or (old.status = 'processing' and new.status in ('unpaid', 'partially_paid', 'paid', 'cancelled'))
    or (old.status = 'partially_paid' and new.status in ('paid', 'waived', 'cancelled', 'partially_refunded', 'refunded'))
    or (old.status = 'paid' and new.status in ('partially_refunded', 'refunded'))
    or (old.status = 'partially_refunded' and new.status in ('refunded'))) then
    raise exception 'invalid_status_transition' using errcode = '23514',
      detail = format('%s -> %s', old.status, new.status);
  end if;
  return new;
end;
$$;
alter table public.payment_requests drop constraint payment_requests_status;
alter table public.payment_requests add constraint payment_requests_status check (status in
  ('unpaid', 'processing', 'partially_paid', 'paid', 'paid_offline', 'partially_refunded', 'refunded', 'waived', 'cancelled'));

-- The request status is DERIVED from its installments, so the two can never disagree.
--   any (partially_)refunded  -> refunded when every installment is refunded/cancelled/waived, else partially_refunded
--   nothing open left         -> paid (all paid/offline), waived (any waived), cancelled (any cancelled)
--   some paid                 -> partially_paid        some processing -> processing        otherwise unpaid
create function private.rollup_request_from_installments()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_req uuid := coalesce(new.request_id, old.request_id);
  c record;
  v_new text;
  v_cur text;
begin
  select count(*) as total,
         count(*) filter (where status in ('paid', 'paid_offline')) as settled,
         count(*) filter (where status in ('paid')) as paid,
         count(*) filter (where status in ('refunded', 'partially_refunded')) as refunded,
         count(*) filter (where status = 'partially_refunded') as part_refunded,
         count(*) filter (where status = 'waived') as waived,
         count(*) filter (where status = 'cancelled') as cancelled,
         count(*) filter (where status = 'processing') as processing,
         count(*) filter (where status in ('scheduled', 'due', 'processing', 'failed')) as open
    into c from public.payment_request_installments where request_id = v_req;
  select status into v_cur from public.payment_requests where id = v_req for update;
  v_new := case
    when c.refunded > 0 then
      case when c.part_refunded = 0 and c.open = 0 and c.settled = 0 then 'refunded' else 'partially_refunded' end
    when c.open = 0 and c.waived > 0 then 'waived'
    when c.open = 0 and c.cancelled > 0 then 'cancelled'
    when c.open = 0 then case when c.paid > 0 then 'paid' else 'paid_offline' end
    when c.settled > 0 then 'partially_paid'
    when c.processing > 0 then 'processing'
    else 'unpaid' end;
  if v_new is distinct from v_cur then
    update public.payment_requests
      set status = v_new,
          paid_at = case when v_new in ('paid', 'paid_offline') then coalesce(paid_at, now()) else paid_at end
      where id = v_req;
  end if;
  return null;
end;
$$;
create trigger installments_rollup after insert or update of status on public.payment_request_installments
  for each row execute function private.rollup_request_from_installments();

-- payment_items: an item is for a request, or for one installment of it ------------------------------
alter table public.payment_items add column installment_id uuid;
alter table public.payment_items
  add constraint payment_items_installment_fk foreign key (installment_id, payment_request_id)
    references public.payment_request_installments (id, request_id) on delete restrict;
drop index public.payment_items_one_active_per_request;
-- A plain request is in at most one live payment; an installment is in at most one live payment, and a plan request
-- never also has a whole-request item live (checked in the reserve function).
create unique index payment_items_one_active_per_request on public.payment_items (payment_request_id)
  where is_active and installment_id is null;
create unique index payment_items_one_active_per_installment on public.payment_items (installment_id)
  where is_active and installment_id is not null;
create index payment_items_installment_id_idx on public.payment_items (installment_id) where installment_id is not null;

create or replace function private.guard_payment_item()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.payment_id is distinct from old.payment_id or new.payment_request_id is distinct from old.payment_request_id
     or new.installment_id is distinct from old.installment_id
     or new.amount_cents is distinct from old.amount_cents
     or new.platform_fee_cents is distinct from old.platform_fee_cents
     or new.processing_fee_passthrough_cents is distinct from old.processing_fee_passthrough_cents
     or (old.is_active = false and new.is_active
         and not exists (select 1 from public.payments p where p.id = new.payment_id and p.status = 'succeeded')) then
    raise exception 'payment_item_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Access: the same people who read the request read its installments. No client writes. -------------
alter table public.payment_request_installments enable row level security;
revoke all on public.payment_request_installments from anon, authenticated;
grant select on public.payment_request_installments to authenticated;
create policy "Issuer staff and the billed household read installments" on public.payment_request_installments
  for select to authenticated
  using (exists (select 1 from public.payment_requests r
    where r.id = request_id
      and (private.is_household_guardian(r.household_id) or private.is_player_self(r.player_id)
           or private.is_event_staff(r.payment_event_id))));

-- What a guardian may choose for a request RIGHT NOW (the UI only displays this). Never trusts a client amount.
create function public.payer_plan_options(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.payment_requests;
  e public.payment_events;
  v_sizes integer[];
  v_now timestamptz := now();
begin
  select * into r from public.payment_requests where id = p_request_id;
  if not found or not private.is_household_guardian(r.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into e from public.payment_events where id = r.payment_event_id;
  if r.status <> 'unpaid' or e.status <> 'published' or r.plan_count is not null then
    return jsonb_build_object('sizes', jsonb_build_array(1), 'cadence', e.plan_cadence, 'plans', '{}'::jsonb);
  end if;
  v_sizes := private.available_plan_sizes(e.plan_options, r.amount_cents, e.plan_cadence, v_now, r.due_at);
  return jsonb_build_object('sizes', to_jsonb(v_sizes), 'cadence', e.plan_cadence,
    'plans', (select jsonb_object_agg(n::text, (
        select jsonb_agg(jsonb_build_object('sequence', g.sequence, 'amount_cents', g.amount_cents, 'due_at', g.due_at) order by g.sequence)
        from private.generate_plan(r.amount_cents, n, e.plan_cadence, v_now) g)) from unnest(v_sizes) n where n > 1));
end;
$$;

-- Create the installments of a request when the family confirms a plan (service role; the reserve function calls this in
-- the same transaction as the first payment reservation in the next step). Installment 1 starts 'scheduled'.
create function public.svc_create_plan(p_request_id uuid, p_n integer, p_start timestamptz default now())
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  r public.payment_requests;
  e public.payment_events;
begin
  select * into r from public.payment_requests where id = p_request_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into e from public.payment_events where id = r.payment_event_id;
  if r.status <> 'unpaid' or e.status <> 'published' or r.plan_count is not null then
    raise exception 'request_not_payable' using errcode = '23514';
  end if;
  if p_n is null or p_n < 2 or not (p_n = any (private.available_plan_sizes(e.plan_options, r.amount_cents, e.plan_cadence, p_start, r.due_at))) then
    raise exception 'plan_not_offered' using errcode = '23514';
  end if;
  insert into public.payment_request_installments (request_id, sequence, amount_cents, due_at)
    select p_request_id, g.sequence, g.amount_cents, g.due_at from private.generate_plan(r.amount_cents, p_n, e.plan_cadence, p_start) g;
  update public.payment_requests set plan_count = p_n where id = p_request_id;
  return p_n;
end;
$$;

revoke execute on function private.valid_plan_options(integer[]), private.plan_due_at(timestamptz, text, integer),
  private.generate_plan(integer, integer, text, timestamptz), private.plan_fits(integer, integer, text, timestamptz, timestamptz),
  private.available_plan_sizes(integer[], integer, text, timestamptz, timestamptz),
  private.guard_installment(), private.rollup_request_from_installments() from public, anon, authenticated;
grant execute on function private.valid_plan_options(integer[]), private.plan_due_at(timestamptz, text, integer),
  private.generate_plan(integer, integer, text, timestamptz), private.plan_fits(integer, integer, text, timestamptz, timestamptz),
  private.available_plan_sizes(integer[], integer, text, timestamptz, timestamptz) to authenticated, service_role;
revoke execute on function public.set_payment_event_plan(uuid, integer[], text), public.payer_plan_options(uuid),
  public.svc_create_plan(uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.set_payment_event_plan(uuid, integer[], text), public.payer_plan_options(uuid) to authenticated;
grant execute on function public.svc_create_plan(uuid, integer, timestamptz) to service_role;
