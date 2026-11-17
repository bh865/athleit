-- Phase 4 (B1): server-side payment core
--
--  * private.compute_checkout_quote(uid, ids): the quote logic, parameterised by the payer so the
--    service-role reservation can recompute it (never trusting an amount from a client). The public
--    payer_checkout_quote becomes a thin wrapper over it for the signed-in user.
--  * Charge type: DESTINATION charge with on_behalf_of (docs/payments-architecture.md). The platform pays
--    Stripe's fee and keeps application_fee_amount, so the application fee = Athleit charge + (absorb: the
--    estimated Stripe fee | pass_on: the service fee). Athleit bears the variance between estimated and actual.
--  * payments.application_fee_cents, refunds breakdown columns, api_rate_limits.
--  * svc_* functions: service-role only (Edge Functions). Every one is idempotent.

alter table public.payments add column application_fee_cents integer not null default 0
  constraint payments_application_fee_range check (application_fee_cents >= 0);
alter table public.refunds
  add column base_cents integer not null default 0 constraint refunds_base_nonneg check (base_cents >= 0),
  add column athleit_charge_cents integer not null default 0 constraint refunds_charge_nonneg check (athleit_charge_cents >= 0),
  add column service_fee_cents integer not null default 0 constraint refunds_service_nonneg check (service_fee_cents >= 0);

-- A payment may succeed after we canceled it locally (race with a cancelled event): record the money.
-- Fee terms and application_fee_cents are frozen with the rest of the money fields.
create or replace function private.guard_payment()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.base_cents is distinct from old.base_cents
     or new.platform_fee_cents is distinct from old.platform_fee_cents
     or new.processing_fee_passthrough_cents is distinct from old.processing_fee_passthrough_cents
     or new.total_charged_cents is distinct from old.total_charged_cents
     or new.application_fee_cents is distinct from old.application_fee_cents
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
    or (old.status = 'canceled' and new.status = 'succeeded')
    or (old.status = 'succeeded' and new.status in ('partially_refunded', 'refunded'))
    or (old.status = 'partially_refunded' and new.status in ('refunded'))) then
    raise exception 'invalid_status_transition' using errcode = '23514', detail = format('%s -> %s', old.status, new.status);
  end if;
  return new;
end;
$$;

create function private.compute_checkout_quote(p_uid uuid, p_request_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := p_uid;
  v_ids uuid[];
  v_found integer;
  v_households integer;
  v_accounts integer;
  v_policies integer;
  v_configs integer;
  v_all_guardian boolean;
  v_all_payable boolean;
  v_fee jsonb;
  v_policy text;
  v_cfg jsonb;
  v_account uuid;
  v_household uuid;
  v_charges boolean;
  b record;
  v_ordered record;
  v_weights bigint[];
  v_plat bigint[];
  v_pass bigint[];
  v_lines jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_i integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_request_ids) x where x is not null;
  if v_ids is null or cardinality(v_ids) not between 1 and 25 then
    raise exception 'invalid_request_set' using errcode = '22023';
  end if;

  select count(*), count(distinct r.household_id), count(distinct e.connected_account_id),
         count(distinct e.fee_policy), count(distinct e.fee_config),
         bool_and(exists (select 1 from public.household_members hm where hm.household_id = r.household_id and hm.profile_id = p_uid and hm.relationship = 'guardian')),
         bool_and(r.status = 'unpaid' and e.status = 'published'
                  and not exists (select 1 from public.payment_items i where i.payment_request_id = r.id and i.is_active)),
         min(e.fee_policy), (array_agg(e.fee_config))[1], (array_agg(e.connected_account_id))[1],
         (array_agg(r.household_id))[1]
  into v_found, v_households, v_accounts, v_policies, v_configs, v_all_guardian, v_all_payable,
       v_policy, v_cfg, v_account, v_household
  from public.payment_requests r
  join public.payment_events e on e.id = r.payment_event_id
  where r.id = any (v_ids);

  -- Unknown ids and other families' requests look identical: not_authorized.
  if v_found <> cardinality(v_ids) or not v_all_guardian then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_households > 1 then raise exception 'mixed_household' using errcode = '23514'; end if;
  if v_accounts > 1 or v_policies > 1 or v_configs > 1 then
    raise exception 'mixed_checkout' using errcode = '23514',
      detail = 'Requests with different payees or fee terms must be paid separately.';
  end if;
  if not v_all_payable then raise exception 'request_not_payable' using errcode = '23514'; end if;
  select ca.charges_enabled into v_charges from public.connected_accounts ca where ca.id = v_account;
  if not coalesce(v_charges, false) then raise exception 'account_not_ready' using errcode = '23514'; end if;

  select sum(r.amount_cents) as base, array_agg(r.amount_cents order by r.id) as weights
    into v_ordered from public.payment_requests r where r.id = any (v_ids);
  select * into b from private.fee_breakdown(v_ordered.base, v_policy, v_cfg);
  v_weights := v_ordered.weights;
  v_plat := private.allocate_cents(b.platform_fee_cents, v_weights);
  v_pass := private.allocate_cents(b.processing_fee_cents, v_weights);

  for v_ordered in
    select r.id, r.display_id, r.amount_cents, e.title
    from public.payment_requests r join public.payment_events e on e.id = r.payment_event_id
    where r.id = any (v_ids) order by r.id
  loop
    v_i := v_i + 1;
    v_lines := v_lines || jsonb_build_object('kind', 'item', 'request_id', v_ordered.id,
      'display_id', v_ordered.display_id, 'label', v_ordered.title, 'amount_cents', v_ordered.amount_cents);
    v_items := v_items || jsonb_build_object('request_id', v_ordered.id, 'amount_cents', v_ordered.amount_cents,
      'platform_fee_cents', v_plat[v_i], 'processing_fee_passthrough_cents', v_pass[v_i]);
  end loop;
  if b.platform_fee_cents > 0 then
    v_lines := v_lines || jsonb_build_object('kind', 'athleit_charge', 'label', 'Athleit charge', 'amount_cents', b.platform_fee_cents);
  end if;
  if b.processing_fee_cents > 0 then
    v_lines := v_lines || jsonb_build_object('kind', 'service_fee', 'label', 'Service fee', 'amount_cents', b.processing_fee_cents);
  end if;

  return jsonb_build_object(
    'currency', 'usd', 'fee_policy', v_policy, 'connected_account_id', v_account, 'household_id', v_household,
    'request_set_key', md5(array_to_string(v_ids, ',')),
    'lines', v_lines, 'items', v_items,
    'base_cents', b.base_cents, 'platform_fee_cents', b.platform_fee_cents,
    'processing_fee_cents', b.processing_fee_cents, 'total_cents', b.total_cents,
    'estimated_stripe_fee_cents', b.estimated_stripe_fee_cents, 'estimated_net_cents', b.estimated_net_cents,
    -- Destination charge: the platform pays Stripe's fee and keeps the application fee. To make the TEAM bear
    -- Stripe's fee under absorb (and nothing under pass_on) the application fee also covers the estimated fee.
    'application_fee_cents', b.platform_fee_cents + case when v_policy = 'absorb' then b.estimated_stripe_fee_cents else b.processing_fee_cents end,
    'description', case when cardinality(v_ids) = 1 then (select e.title || ' · ' || r.display_id from public.payment_requests r join public.payment_events e on e.id = r.payment_event_id where r.id = v_ids[1])
                        else cardinality(v_ids)::text || ' payment requests · ' || (select string_agg(r.display_id, ', ' order by r.display_id) from public.payment_requests r where r.id = any (v_ids)) end,
    'display_ids', (select jsonb_agg(r.display_id order by r.display_id) from public.payment_requests r where r.id = any (v_ids)),
    'stripe_account_id', (select ca.stripe_account_id from public.connected_accounts ca where ca.id = v_account));
end;
$$;

-- The signed-in payer's quote (unchanged contract).
create or replace function public.payer_checkout_quote(p_request_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return private.compute_checkout_quote(auth.uid(), p_request_ids);
end;
$$;

-- Rate limiting (Edge Functions): fixed windows, written only by svc_rate_limit.
create table public.api_rate_limits (
  bucket text not null constraint api_rate_limits_bucket_length check (char_length(bucket) <= 200),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;

create function public.svc_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.api_rate_limits (bucket, window_start, hits) values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = public.api_rate_limits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

-- Webhook ledger --------------------------------------------------------------
-- 'new' = first delivery, 'retry' = seen but not finished (process again), 'duplicate' = done (no-op).
create function public.svc_ledger_event(p_event_id text, p_type text, p_livemode boolean, p_account text, p_payload jsonb)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_done timestamptz; v_new boolean;
begin
  insert into public.stripe_webhook_events (stripe_event_id, type, livemode, stripe_account_id, payload)
  values (p_event_id, left(p_type, 100), p_livemode, p_account, p_payload)
  on conflict (stripe_event_id) do nothing returning true into v_new;
  if v_new then return 'new'; end if;
  select processed_at into v_done from public.stripe_webhook_events where stripe_event_id = p_event_id for update;
  if v_done is not null then return 'duplicate'; end if;
  update public.stripe_webhook_events set attempts = attempts + 1 where stripe_event_id = p_event_id;
  return 'retry';
end;
$$;

-- p_error null = processed; otherwise recorded for retry. p_final marks a poisoned event as done.
create function public.svc_finish_event(p_event_id text, p_error text default null, p_final boolean default false)
returns void language sql security definer set search_path = ''
as $$
  update public.stripe_webhook_events
  set processed_at = case when p_error is null or p_final then now() else null end, error = left(p_error, 500)
  where stripe_event_id = p_event_id;
$$;

-- Payments: find (and lock) a payment by PaymentIntent id, falling back to our own id from metadata
-- (a webhook can beat the attach of the intent id).
create function private.lock_payment(p_pi text, p_payment_id uuid)
returns public.payments language plpgsql security definer set search_path = ''
as $$
declare v public.payments;
begin
  select * into v from public.payments where stripe_payment_intent_id = p_pi for update;
  if not found and p_payment_id is not null then
    select * into v from public.payments where id = p_payment_id and stripe_payment_intent_id is null for update;
    if found then update public.payments set stripe_payment_intent_id = p_pi where id = v.id returning * into v; end if;
  end if;
  if v.id is null then return null; end if;
  return v;
end;
$$;

-- Reserve a payment for a set of requests (create-payment-intent step 1). Serialises on the request rows,
-- reuses an open payment for the same set, otherwise recomputes the quote server-side and records it.
create function public.svc_reserve_payment(p_uid uuid, p_request_ids uuid[])
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
  v_key text;
  v_pay public.payments;
  q jsonb;
  v_acct uuid;
begin
  select array_agg(distinct x order by x) into v_ids from unnest(p_request_ids) x where x is not null;
  if v_ids is null or cardinality(v_ids) not between 1 and 25 then raise exception 'invalid_request_set' using errcode = '22023'; end if;
  perform 1 from public.payment_requests where id = any (v_ids) order by id for update;
  if (select count(*) from public.payment_requests r
      join public.household_members hm on hm.household_id = r.household_id and hm.profile_id = p_uid and hm.relationship = 'guardian'
      where r.id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_key := md5(array_to_string(v_ids, ','));
  select * into v_pay from public.payments
    where request_set_key = v_key and status in ('requires_payment_method', 'processing', 'failed')
    order by created_at desc limit 1;
  if found then
    return jsonb_build_object('reused', true, 'payment_id', v_pay.id, 'stripe_payment_intent_id', v_pay.stripe_payment_intent_id,
      'status', v_pay.status, 'total_cents', v_pay.total_charged_cents,
      'stripe_account_id', (select stripe_account_id from public.connected_accounts where id = v_pay.connected_account_id));
  end if;
  q := private.compute_checkout_quote(p_uid, v_ids);
  v_acct := (q ->> 'connected_account_id')::uuid;
  insert into public.payments (connected_account_id, household_id, payer_profile_id, fee_policy, base_cents, platform_fee_cents,
      processing_fee_passthrough_cents, total_charged_cents, application_fee_cents, estimated_stripe_fee_cents, request_set_key)
  values (v_acct, (q ->> 'household_id')::uuid, p_uid, q ->> 'fee_policy', (q ->> 'base_cents')::int, (q ->> 'platform_fee_cents')::int,
      (q ->> 'processing_fee_cents')::int, (q ->> 'total_cents')::int, (q ->> 'application_fee_cents')::int,
      (q ->> 'estimated_stripe_fee_cents')::int, v_key)
  returning * into v_pay;
  insert into public.payment_items (payment_id, payment_request_id, amount_cents, platform_fee_cents, processing_fee_passthrough_cents)
  select v_pay.id, (i ->> 'request_id')::uuid, (i ->> 'amount_cents')::int, (i ->> 'platform_fee_cents')::int,
         (i ->> 'processing_fee_passthrough_cents')::int
  from jsonb_array_elements(q -> 'items') i;
  update public.payment_requests set status = 'processing' where id = any (v_ids) and status = 'unpaid';
  return jsonb_build_object('reused', false, 'payment_id', v_pay.id, 'stripe_payment_intent_id', null, 'status', v_pay.status,
    'total_cents', v_pay.total_charged_cents, 'application_fee_cents', v_pay.application_fee_cents, 'currency', 'usd',
    'description', q ->> 'description', 'display_ids', q -> 'display_ids', 'request_set_key', v_key,
    'stripe_account_id', q ->> 'stripe_account_id');
end;
$$;

create function public.svc_attach_payment_intent(p_payment_id uuid, p_pi text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.payments set stripe_payment_intent_id = p_pi
  where id = p_payment_id and (stripe_payment_intent_id is null or stripe_payment_intent_id = p_pi);
  if not found then raise exception 'payment_intent_conflict' using errcode = '23505'; end if;
end;
$$;

-- Creating the intent at Stripe failed: give the requests back.
create function public.svc_release_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v public.payments;
begin
  select * into v from public.payments where id = p_payment_id for update;
  if not found or v.stripe_payment_intent_id is not null or v.status <> 'requires_payment_method' then return; end if;
  update public.payments set status = 'canceled' where id = v.id;
  update public.payment_requests set status = 'unpaid'
  where status = 'processing' and id in (select payment_request_id from public.payment_items where payment_id = v.id);
end;
$$;

revoke execute on function private.compute_checkout_quote(uuid, uuid[]), private.lock_payment(text, uuid), private.guard_payment() from public, anon, authenticated;
revoke execute on function public.payer_checkout_quote(uuid[]) from public, anon, authenticated;
grant execute on function public.payer_checkout_quote(uuid[]) to authenticated;
revoke execute on function public.svc_rate_limit(text, integer, integer), public.svc_ledger_event(text, text, boolean, text, jsonb),
  public.svc_finish_event(text, text, boolean), public.svc_reserve_payment(uuid, uuid[]),
  public.svc_attach_payment_intent(uuid, text), public.svc_release_payment(uuid) from public, anon, authenticated;
grant execute on function public.svc_rate_limit(text, integer, integer), public.svc_ledger_event(text, text, boolean, text, jsonb),
  public.svc_finish_event(text, text, boolean), public.svc_reserve_payment(uuid, uuid[]),
  public.svc_attach_payment_intent(uuid, text), public.svc_release_payment(uuid) to service_role;
grant usage on schema private to service_role;
