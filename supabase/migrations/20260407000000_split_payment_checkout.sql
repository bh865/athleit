-- Split payments, step 2a: quoting, reserving, settling and charging installments.
--
--  * Consent and saved cards: payment_plan_consents (what the family agreed to, when, from where) and payer_payment_methods
--    (Stripe customer / payment method IDS on the connected account: no card data; brand and last4 are read from Stripe).
--  * Quotes: payer_plan_quote (what a plan of size n costs, shown before the family commits) and compute_installment_quote
--    (the charge for one or several installments; several in one checkout = fee computed ONCE on the summed base, allocated
--    by largest remainder, exactly like whole requests).
--  * Reserving: svc_reserve_plan (create the plan + consent + reserve installment 1 in ONE transaction),
--    svc_reserve_installments (pay later installments: manually, early, the whole remaining balance, or by the charger).
--  * Settling: svc_payment_succeeded / svc_payment_status / svc_release_payment learn installments; the request status is
--    derived by the roll-up trigger from step 1.
--  * Charging: svc_claim_due_installments (cron), failure bookkeeping and dunning (retry after 3 days, then 5 more, then overdue
--    and staff are told; a missed installment never cancels anything).

alter table public.payments add column off_session boolean not null default false;
alter table public.payment_requests
  add column autopay boolean not null default false,
  add column autopay_by uuid references public.profiles (id) on delete set null;
create index payment_requests_autopay_by_idx on public.payment_requests (autopay_by) where autopay_by is not null;

create table public.payment_plan_consents (
  request_id uuid primary key references public.payment_requests (id) on delete restrict,
  profile_id uuid references public.profiles (id) on delete set null,
  plan_count smallint not null,
  autopay boolean not null,
  consent_version text not null,
  ip text constraint plan_consents_ip_length check (char_length(ip) <= 64),
  user_agent text constraint plan_consents_ua_length check (char_length(user_agent) <= 300),
  consented_at timestamptz not null default now()
);
create index payment_plan_consents_profile_idx on public.payment_plan_consents (profile_id) where profile_id is not null;

-- Stripe ids only. One row per household and connected account (the Customer lives on the connected account).
create table public.payer_payment_methods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  connected_account_id uuid not null references public.connected_accounts (id) on delete restrict,
  stripe_customer_id text not null constraint ppm_customer_format check (stripe_customer_id ~ '^cus_[A-Za-z0-9_]+$'),
  stripe_payment_method_id text constraint ppm_pm_format check (stripe_payment_method_id ~ '^pm_[A-Za-z0-9_]+$'),
  saved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, connected_account_id)
);
create index payer_payment_methods_account_idx on public.payer_payment_methods (connected_account_id);
create index payer_payment_methods_saved_by_idx on public.payer_payment_methods (saved_by) where saved_by is not null;
create trigger payer_payment_methods_set_updated_at before update on public.payer_payment_methods
  for each row execute function public.set_updated_at();
-- Service role only: no policies, no grants.
alter table public.payment_plan_consents enable row level security;
alter table public.payer_payment_methods enable row level security;
revoke all on public.payment_plan_consents, public.payer_payment_methods from anon, authenticated;

-- A plan request is paid by installments only; a plain request never has installment rows.
create function private.guard_item_plan_kind()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.installment_id is null and exists (
       select 1 from public.payment_requests r where r.id = new.payment_request_id and r.plan_count is not null) then
    raise exception 'plan_request_use_installments' using errcode = '23514',
      detail = 'This request is on a payment plan: pay its installments.';
  end if;
  return new;
end;
$$;
create trigger payment_items_plan_kind before insert on public.payment_items
  for each row execute function private.guard_item_plan_kind();

-- plan_count may only be cleared while the request has no installment rows (kept for a future reset path).
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
  if new.plan_count is distinct from old.plan_count and old.plan_count is not null
     and not (new.plan_count is null and not exists (select 1 from public.payment_request_installments i where i.request_id = old.id)) then
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

-- Quotes ---------------------------------------------------------------------------------------------------------------
-- What a plan of size n costs: every installment is its own transaction with its own fee breakdown on the event's frozen
-- config, plus the extra versus paying in full. Display only: nothing here is a charge.
create function private.plan_quote(p_request_id uuid, p_n integer, p_start timestamptz)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.payment_requests;
  e public.payment_events;
  v_rows jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_charge bigint := 0;
  v_full bigint;
  g record;
  b record;
begin
  select * into r from public.payment_requests where id = p_request_id;
  select * into e from public.payment_events where id = r.payment_event_id;
  select * into b from private.fee_breakdown(r.amount_cents, e.fee_policy, e.fee_config);
  v_full := b.total_cents;
  for g in select * from private.generate_plan(r.amount_cents, p_n, e.plan_cadence, p_start) loop
    select * into b from private.fee_breakdown(g.amount_cents, e.fee_policy, e.fee_config);
    v_rows := v_rows || jsonb_build_object('sequence', g.sequence, 'due_at', g.due_at, 'base_cents', g.amount_cents,
      'platform_fee_cents', b.platform_fee_cents, 'processing_fee_cents', b.processing_fee_cents, 'total_cents', b.total_cents);
    v_total := v_total + b.total_cents;
    v_charge := v_charge + b.platform_fee_cents;
  end loop;
  return jsonb_build_object('plan_size', p_n, 'cadence', e.plan_cadence, 'fee_policy', e.fee_policy,
    'installments', v_rows, 'total_cents', v_total, 'full_pay_total_cents', v_full, 'extra_cents', v_total - v_full,
    'athleit_charge_cents', v_charge, 'charge_now_cents', (v_rows -> 0 ->> 'total_cents')::bigint);
end;
$$;

-- For the signed-in guardian: the sizes the SERVER offers right now, each with its schedule and fee impact.
create function public.payer_plan_quote(p_request_id uuid)
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
  if r.status <> 'unpaid' or e.status <> 'published' then
    return jsonb_build_object('sizes', '[1]'::jsonb, 'plans', '{}'::jsonb, 'cadence', e.plan_cadence);
  end if;
  v_sizes := private.available_plan_sizes(e.plan_options, r.amount_cents, e.plan_cadence, v_now, r.due_at);
  return jsonb_build_object('sizes', to_jsonb(v_sizes), 'cadence', e.plan_cadence, 'current_plan', r.plan_count,
    'plans', coalesce((select jsonb_object_agg(n::text, private.plan_quote(p_request_id, n, v_now)) from unnest(v_sizes) n where n > 1), '{}'::jsonb));
end;
$$;

-- The charge for one or more installments of ONE household / account / fee terms. p_uid must be a guardian of the household.
create function private.compute_installment_quote(p_uid uuid, p_installment_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ids uuid[];
  v_found integer;
  v_households integer;
  v_accounts integer;
  v_policies integer;
  v_configs integer;
  v_all_guardian boolean;
  v_all_payable boolean;
  v_policy text;
  v_cfg jsonb;
  v_account uuid;
  v_household uuid;
  v_charges boolean;
  b record;
  v_tot record;
  v_plat bigint[];
  v_pass bigint[];
  v_items jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_i integer := 0;
  it record;
begin
  if p_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_installment_ids) x where x is not null;
  if v_ids is null or cardinality(v_ids) not between 1 and 25 then raise exception 'invalid_request_set' using errcode = '22023'; end if;

  select count(*), count(distinct r.household_id), count(distinct e.connected_account_id), count(distinct e.fee_policy), count(distinct e.fee_config),
         bool_and(exists (select 1 from public.household_members hm where hm.household_id = r.household_id and hm.profile_id = p_uid and hm.relationship = 'guardian')),
         bool_and(i.status in ('scheduled', 'due', 'failed') and r.status in ('unpaid', 'partially_paid') and e.status = 'published'
                  and not exists (select 1 from public.payment_items pi where pi.installment_id = i.id and pi.is_active)),
         min(e.fee_policy), (array_agg(e.fee_config))[1], (array_agg(e.connected_account_id))[1], (array_agg(r.household_id))[1]
    into v_found, v_households, v_accounts, v_policies, v_configs, v_all_guardian, v_all_payable, v_policy, v_cfg, v_account, v_household
    from public.payment_request_installments i
    join public.payment_requests r on r.id = i.request_id
    join public.payment_events e on e.id = r.payment_event_id
   where i.id = any (v_ids);
  if v_found <> cardinality(v_ids) or not v_all_guardian then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_households > 1 then raise exception 'mixed_household' using errcode = '23514'; end if;
  if v_accounts > 1 or v_policies > 1 or v_configs > 1 then
    raise exception 'mixed_checkout' using errcode = '23514', detail = 'Requests with different payees or fee terms must be paid separately.';
  end if;
  if not v_all_payable then raise exception 'request_not_payable' using errcode = '23514'; end if;
  select ca.charges_enabled into v_charges from public.connected_accounts ca where ca.id = v_account;
  if not coalesce(v_charges, false) then raise exception 'account_not_ready' using errcode = '23514'; end if;

  select sum(i.amount_cents) as base, array_agg(i.amount_cents order by i.id) as weights into v_tot
    from public.payment_request_installments i where i.id = any (v_ids);
  select * into b from private.fee_breakdown(v_tot.base, v_policy, v_cfg);
  v_plat := private.allocate_cents(b.platform_fee_cents, v_tot.weights);
  v_pass := private.allocate_cents(b.processing_fee_cents, v_tot.weights);

  for it in
    select i.id, i.sequence, i.amount_cents, r.id as request_id, r.display_id, r.plan_count, e.title
      from public.payment_request_installments i join public.payment_requests r on r.id = i.request_id
      join public.payment_events e on e.id = r.payment_event_id where i.id = any (v_ids) order by i.id
  loop
    v_i := v_i + 1;
    v_lines := v_lines || jsonb_build_object('kind', 'item', 'request_id', it.request_id, 'installment_id', it.id, 'display_id', it.display_id,
      'label', format('%s · installment %s of %s', it.title, it.sequence, it.plan_count), 'amount_cents', it.amount_cents);
    v_items := v_items || jsonb_build_object('request_id', it.request_id, 'installment_id', it.id, 'amount_cents', it.amount_cents,
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
    'request_set_key', md5('i:' || array_to_string(v_ids, ',')), 'lines', v_lines, 'items', v_items,
    'base_cents', b.base_cents, 'platform_fee_cents', b.platform_fee_cents, 'processing_fee_cents', b.processing_fee_cents,
    'total_cents', b.total_cents, 'estimated_stripe_fee_cents', b.estimated_stripe_fee_cents, 'estimated_net_cents', b.estimated_net_cents,
    'application_fee_cents', b.platform_fee_cents,
    'description', (select case when cardinality(v_ids) = 1
        then (select e.title || ' · ' || r.display_id || ' · installment ' || i.sequence || ' of ' || r.plan_count
              from public.payment_request_installments i join public.payment_requests r on r.id = i.request_id
              join public.payment_events e on e.id = r.payment_event_id where i.id = v_ids[1])
        else cardinality(v_ids)::text || ' installments' end),
    'display_ids', (select jsonb_agg(distinct r.display_id) from public.payment_request_installments i join public.payment_requests r on r.id = i.request_id where i.id = any (v_ids)),
    'stripe_account_id', (select ca.stripe_account_id from public.connected_accounts ca where ca.id = v_account));
end;
$$;

create function public.payer_installment_quote(p_installment_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return private.compute_installment_quote(auth.uid(), p_installment_ids);
end;
$$;

-- Reserving -------------------------------------------------------------------------------------------------------------
-- Reserve one payment for installments (reusing an open one for the same set). p_off_session marks a charge made by the
-- scheduler with a saved card. Same return shape as svc_reserve_payment, plus installment_ids.
create function public.svc_reserve_installments(p_uid uuid, p_installment_ids uuid[], p_off_session boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
  v_key text;
  v_pay public.payments;
  q jsonb;
begin
  select array_agg(distinct x order by x) into v_ids from unnest(p_installment_ids) x where x is not null;
  if v_ids is null or cardinality(v_ids) not between 1 and 25 then raise exception 'invalid_request_set' using errcode = '22023'; end if;
  perform 1 from public.payment_request_installments where id = any (v_ids) order by id for update;
  v_key := md5('i:' || array_to_string(v_ids, ','));
  select * into v_pay from public.payments where request_set_key = v_key and status in ('requires_payment_method', 'processing', 'failed')
    order by created_at desc limit 1;
  if found then
    if exists (select 1 from public.payment_items pi join public.payment_request_installments i on i.id = pi.installment_id
               join public.payment_requests r on r.id = i.request_id join public.payment_events e on e.id = r.payment_event_id
               where pi.payment_id = v_pay.id and (i.status not in ('scheduled', 'due', 'processing', 'failed') or e.status <> 'published'))
       or not coalesce((select charges_enabled from public.connected_accounts where id = v_pay.connected_account_id), false) then
      raise exception 'request_not_payable' using errcode = '23514';
    end if;
    if (select count(*) from public.payment_items pi join public.payment_requests r on r.id = pi.payment_request_id
        join public.household_members hm on hm.household_id = r.household_id and hm.profile_id = p_uid and hm.relationship = 'guardian'
        where pi.payment_id = v_pay.id) <> cardinality(v_ids) then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
    return jsonb_build_object('reused', true, 'payment_id', v_pay.id, 'stripe_payment_intent_id', v_pay.stripe_payment_intent_id,
      'status', v_pay.status, 'total_cents', v_pay.total_charged_cents, 'application_fee_cents', v_pay.application_fee_cents,
      'currency', 'usd', 'request_set_key', v_key, 'installment_ids', to_jsonb(v_ids), 'off_session', v_pay.off_session,
      'display_ids', (select jsonb_agg(distinct r.display_id) from public.payment_items pi join public.payment_requests r on r.id = pi.payment_request_id where pi.payment_id = v_pay.id),
      'description', (select case when count(*) = 1 then max(e.title) || ' · ' || max(r.display_id) || ' · installment ' || max(i.sequence) || ' of ' || max(r.plan_count)
                                  else count(*)::text || ' installments' end
                      from public.payment_items pi join public.payment_request_installments i on i.id = pi.installment_id
                      join public.payment_requests r on r.id = i.request_id join public.payment_events e on e.id = r.payment_event_id where pi.payment_id = v_pay.id),
      'stripe_account_id', (select stripe_account_id from public.connected_accounts where id = v_pay.connected_account_id));
  end if;
  q := private.compute_installment_quote(p_uid, v_ids);
  insert into public.payments (connected_account_id, household_id, payer_profile_id, fee_policy, base_cents, platform_fee_cents,
      processing_fee_passthrough_cents, total_charged_cents, application_fee_cents, estimated_stripe_fee_cents, request_set_key, off_session)
  values ((q ->> 'connected_account_id')::uuid, (q ->> 'household_id')::uuid, p_uid, q ->> 'fee_policy', (q ->> 'base_cents')::int,
      (q ->> 'platform_fee_cents')::int, (q ->> 'processing_fee_cents')::int, (q ->> 'total_cents')::int, (q ->> 'application_fee_cents')::int,
      (q ->> 'estimated_stripe_fee_cents')::int, v_key, p_off_session)
  returning * into v_pay;
  insert into public.payment_items (payment_id, payment_request_id, installment_id, amount_cents, platform_fee_cents, processing_fee_passthrough_cents)
  select v_pay.id, (i ->> 'request_id')::uuid, (i ->> 'installment_id')::uuid, (i ->> 'amount_cents')::int, (i ->> 'platform_fee_cents')::int,
         (i ->> 'processing_fee_passthrough_cents')::int from jsonb_array_elements(q -> 'items') i;
  update public.payment_request_installments set status = 'processing', last_attempt_at = case when p_off_session then now() else last_attempt_at end
    where id = any (v_ids) and status in ('scheduled', 'due', 'failed');
  return jsonb_build_object('reused', false, 'payment_id', v_pay.id, 'stripe_payment_intent_id', null, 'status', v_pay.status,
    'total_cents', v_pay.total_charged_cents, 'application_fee_cents', v_pay.application_fee_cents, 'currency', 'usd',
    'description', q ->> 'description', 'display_ids', q -> 'display_ids', 'request_set_key', v_key, 'installment_ids', to_jsonb(v_ids),
    'off_session', p_off_session, 'stripe_account_id', q ->> 'stripe_account_id');
end;
$$;

-- Start a plan: create it, record the consent and reserve installment 1, in one transaction. Returns the reservation plus the plan.
create function public.svc_reserve_plan(
  p_uid uuid, p_request_id uuid, p_n integer, p_autopay boolean, p_consent_version text, p_ip text default null, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  r public.payment_requests;
  v_first uuid;
  v_res jsonb;
begin
  select * into r from public.payment_requests where id = p_request_id for update;
  if not found or not exists (select 1 from public.household_members hm where hm.household_id = r.household_id
       and hm.profile_id = p_uid and hm.relationship = 'guardian') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  -- Retrying the same plan is fine. A plan, once chosen, stays: paying its installments together costs exactly what paying in full
  -- costs (one fee on the summed base), so a family that changes its mind loses nothing.
  if r.plan_count is not null and r.plan_count <> p_n then
    raise exception 'plan_locked' using errcode = '23514', detail = 'This request already has a plan.';
  end if;
  if (select plan_count from public.payment_requests where id = r.id) is null then
    perform public.svc_create_plan(r.id, p_n);
  end if;
  insert into public.payment_plan_consents (request_id, profile_id, plan_count, autopay, consent_version, ip, user_agent)
    values (r.id, p_uid, p_n, coalesce(p_autopay, false), p_consent_version, left(p_ip, 64), left(p_user_agent, 300))
    on conflict (request_id) do update set profile_id = excluded.profile_id, autopay = excluded.autopay,
      consent_version = excluded.consent_version, ip = excluded.ip, user_agent = excluded.user_agent, consented_at = now();
  update public.payment_requests set autopay = coalesce(p_autopay, false), autopay_by = case when p_autopay then p_uid end where id = r.id;
  select id into v_first from public.payment_request_installments where request_id = r.id and sequence = 1;
  v_res := public.svc_reserve_installments(p_uid, array[v_first]);
  return v_res || jsonb_build_object('plan_count', p_n, 'autopay', coalesce(p_autopay, false), 'setup_future_usage', coalesce(p_autopay, false));
end;
$$;

-- A family opts out of (or back into) autopay for the rest of a plan. Manual payment always remains available.
create function public.set_plan_autopay(p_request_id uuid, p_autopay boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.payment_requests;
begin
  select * into r from public.payment_requests where id = p_request_id for update;
  if not found or not private.is_household_guardian(r.household_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if r.plan_count is null then raise exception 'not_a_plan' using errcode = '23514'; end if;
  update public.payment_requests set autopay = p_autopay, autopay_by = case when p_autopay then auth.uid() end where id = p_request_id;
  perform private.write_audit('payment_request.autopay', 'payment_requests', p_request_id,
    (select e.team_id from public.payment_events e where e.id = r.payment_event_id),
    (select e.club_id from public.payment_events e where e.id = r.payment_event_id),
    jsonb_build_object('autopay', r.autopay), jsonb_build_object('autopay', p_autopay));
end;
$$;

-- Saved card (Stripe ids). The Customer is created once per household and connected account by the Edge Function.
create function public.svc_save_payment_method(p_household_id uuid, p_connected_account_id uuid, p_customer text, p_payment_method text, p_uid uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into public.payer_payment_methods (household_id, connected_account_id, stripe_customer_id, stripe_payment_method_id, saved_by)
  values (p_household_id, p_connected_account_id, p_customer, p_payment_method, p_uid)
  on conflict (household_id, connected_account_id) do update
    set stripe_customer_id = excluded.stripe_customer_id,
        stripe_payment_method_id = coalesce(excluded.stripe_payment_method_id, public.payer_payment_methods.stripe_payment_method_id),
        saved_by = excluded.saved_by;
$$;

create function public.svc_get_customer(p_household_id uuid, p_connected_account_id uuid)
returns text language sql stable security definer set search_path = ''
as $$ select stripe_customer_id from public.payer_payment_methods where household_id = p_household_id and connected_account_id = p_connected_account_id; $$;

-- Settling --------------------------------------------------------------------------------------------------------------
-- "Installment 2 of 4" for a receipt line.
create function private.payment_installment_label(p_payment_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select case when count(*) = 0 then null else string_agg(format('installment %s of %s', i.sequence, r.plan_count), ', ' order by r.display_id, i.sequence) end
  from public.payment_items pi join public.payment_request_installments i on i.id = pi.installment_id
  join public.payment_requests r on r.id = i.request_id where pi.payment_id = p_payment_id;
$$;

create or replace function public.svc_payment_succeeded(
  p_pi text, p_payment_id uuid default null, p_charge text default null, p_stripe_fee integer default null,
  p_amount integer default null, p_currency text default null, p_destination text default null, p_application_fee integer default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v public.payments;
  v_issuer record;
  v_was text;
  v_acct text;
  v_label text;
  r record;
begin
  v := private.lock_payment(p_pi, p_payment_id);
  if v.id is null then return 'unknown_payment'; end if;
  select stripe_account_id into v_acct from public.connected_accounts where id = v.connected_account_id;
  if (p_amount is not null and p_amount <> v.total_charged_cents)
     or (p_currency is not null and lower(p_currency) <> 'usd')
     or (p_destination is not null and p_destination <> v_acct)
     or (p_application_fee is not null and p_application_fee <> v.application_fee_cents) then
    raise exception 'payment_mismatch' using errcode = '23514';
  end if;
  if v.status in ('succeeded', 'partially_refunded', 'refunded') then
    update public.payments set stripe_charge_id = coalesce(stripe_charge_id, p_charge),
      stripe_fee_cents = coalesce(stripe_fee_cents, p_stripe_fee),
      net_to_account_cents = total_charged_cents - application_fee_cents - coalesce(stripe_fee_cents, p_stripe_fee, estimated_stripe_fee_cents)
    where id = v.id;
    return 'noop';
  end if;
  v_was := v.status;
  update public.payments set status = 'succeeded', succeeded_at = now(),
    stripe_charge_id = coalesce(stripe_charge_id, p_charge), stripe_fee_cents = coalesce(p_stripe_fee, stripe_fee_cents),
    net_to_account_cents = total_charged_cents - application_fee_cents - coalesce(p_stripe_fee, estimated_stripe_fee_cents),
    receipt_display_id = coalesce(receipt_display_id, private.next_receipt_display_id())
  where id = v.id returning * into v;
  if v_was = 'canceled' then
    update public.payment_items i set is_active = true where i.payment_id = v.id and not i.is_active
      and not exists (select 1 from public.payment_items o where o.is_active
        and ((i.installment_id is null and o.payment_request_id = i.payment_request_id and o.installment_id is null) or o.installment_id = i.installment_id));
  end if;

  -- Whole-request items settle the request; installment items settle the installment (the request status follows by roll-up).
  update public.payment_requests set status = 'paid', paid_at = now()
  where status in ('unpaid', 'processing') and id in (select payment_request_id from public.payment_items where payment_id = v.id and installment_id is null);
  update public.payment_request_installments set status = 'paid', paid_at = now(), next_retry_at = null
  where status in ('scheduled', 'due', 'processing', 'failed') and id in (select installment_id from public.payment_items where payment_id = v.id and installment_id is not null);

  select * into v_issuer from private.payment_issuer(v.id);
  -- Anything settled on a request / installment that is already closed cannot become paid: flag it for a staff refund.
  for r in
    select q.id, q.display_id, q.status from public.payment_requests q
    join public.payment_items i on i.payment_request_id = q.id and i.installment_id is null
    where i.payment_id = v.id and q.status in ('cancelled', 'waived', 'paid_offline')
    union all
    select q.id, q.display_id, ins.status from public.payment_request_installments ins
    join public.payment_requests q on q.id = ins.request_id
    join public.payment_items i on i.installment_id = ins.id
    where i.payment_id = v.id and ins.status in ('cancelled', 'waived', 'paid_offline')
  loop
    insert into public.audit_log (action, target_type, target_id, team_id, club_id, after)
    values ('payment.succeeded_on_closed_request', 'payment_requests', r.id, v_issuer.team_id, v_issuer.club_id,
            jsonb_build_object('payment_id', v.id, 'display_id', r.display_id, 'request_status', r.status, 'previous_payment_status', v_was));
    perform private.notify_issuer_admins(v_issuer.team_id, v_issuer.club_id, 'payment_needs_refund', coalesce(v_issuer.title, 'Payment'),
      format('A payment arrived for %s, which was already closed. Refund it from Payments.', r.display_id),
      jsonb_build_object('payment_id', v.id, 'payment_event_id', v_issuer.event_id), 'pay:closed:' || v.id || ':' || r.id);
  end loop;

  v_label := private.payment_installment_label(v.id);
  perform private.notify_payment(v.household_id, 'receipt', coalesce(v_issuer.title, 'Payment'),
    format('Paid %s%s · receipt %s', private.money_text(v.total_charged_cents), coalesce(' (' || v_label || ')', ''), v.receipt_display_id),
    jsonb_build_object('payment_id', v.id, 'payment_event_id', v_issuer.event_id), 'pay:rcp:' || v.id);
  perform private.notify_issuer_admins(v_issuer.team_id, v_issuer.club_id, 'payment_received', coalesce(v_issuer.title, 'Payment'),
    format('%s received%s', private.money_text(v.base_cents), coalesce(' (' || v_label || ')', '')),
    jsonb_build_object('payment_id', v.id, 'payment_event_id', v_issuer.event_id), 'pay:got:' || v.id);
  -- A plan that has just been fully paid.
  for r in
    select distinct q.id from public.payment_requests q join public.payment_items i on i.payment_request_id = q.id
    where i.payment_id = v.id and i.installment_id is not null and q.status = 'paid' and q.plan_count is not null
  loop
    perform private.notify_payment(v.household_id, 'plan_completed', coalesce(v_issuer.title, 'Payment'),
      'Your payment plan is complete. Thank you!', jsonb_build_object('payment_event_id', v_issuer.event_id, 'request_id', r.id), 'pay:plan-done:' || r.id);
  end loop;
  return 'applied';
end;
$$;

-- Dunning: retry after 3 days, then 5 more, then the installment is overdue and staff are told. Nothing is ever cancelled.
create function private.installment_charge_failed(p_payment_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  p public.payments;
  v_issuer record;
  i record;
  v_attempts integer;
  v_retry timestamptz;
begin
  select * into p from public.payments where id = p_payment_id;
  select * into v_issuer from private.payment_issuer(p_payment_id);
  for i in select ins.* from public.payment_request_installments ins join public.payment_items pi on pi.installment_id = ins.id
           where pi.payment_id = p_payment_id and ins.status in ('processing', 'failed') for update of ins
  loop
    v_attempts := i.attempt_count + 1;
    v_retry := case v_attempts when 1 then now() + interval '3 days' when 2 then now() + interval '5 days' else null end;
    update public.payment_request_installments set status = 'failed', attempt_count = v_attempts, last_attempt_at = now(), next_retry_at = v_retry
      where id = i.id;
    if v_retry is not null then
      perform private.notify_payment(p.household_id, 'installment_failed', coalesce(v_issuer.title, 'Payment'),
        format('We could not charge installment %s. We will try again on %s, or you can pay now.', i.sequence, to_char(v_retry at time zone 'UTC', 'Mon DD')),
        jsonb_build_object('payment_event_id', v_issuer.event_id, 'request_id', i.request_id, 'installment_id', i.id), 'pay:inst-fail:' || i.id || ':' || v_attempts);
    else
      perform private.notify_payment(p.household_id, 'installment_final', coalesce(v_issuer.title, 'Payment'),
        format('Installment %s could not be charged. Please pay it now.', i.sequence),
        jsonb_build_object('payment_event_id', v_issuer.event_id, 'request_id', i.request_id, 'installment_id', i.id), 'pay:inst-final:' || i.id);
      if i.overdue_notified_at is null then
        update public.payment_request_installments set overdue_notified_at = now() where id = i.id;
        perform private.notify_issuer_admins(v_issuer.team_id, v_issuer.club_id, 'installment_overdue', coalesce(v_issuer.title, 'Payment'),
          format('Installment %s of a payment plan is overdue after repeated failed charges.', i.sequence),
          jsonb_build_object('payment_event_id', v_issuer.event_id, 'request_id', i.request_id), 'pay:inst-overdue:' || i.id);
      end if;
    end if;
  end loop;
end;
$$;

-- A reserved off-session charge that never reached a PaymentIntent, or whose intent was declined / needs authentication.
create function public.svc_installment_charge_failed(p_payment_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare v public.payments;
begin
  select * into v from public.payments where id = p_payment_id for update;
  if not found or v.status not in ('requires_payment_method', 'processing', 'failed') then return 'noop'; end if;
  perform private.installment_charge_failed(v.id);
  -- Free the installments for the retry or a manual payment: the intent (if any) is canceled by the caller.
  update public.payments set status = 'canceled' where id = v.id;
  return 'applied';
end;
$$;

create or replace function public.svc_payment_status(p_pi text, p_status text, p_payment_id uuid default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare v public.payments;
begin
  if p_status not in ('processing', 'failed', 'canceled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  v := private.lock_payment(p_pi, p_payment_id);
  if v.id is null then return 'unknown_payment'; end if;

  if p_status = 'processing' then
    if v.status not in ('requires_payment_method', 'failed') then return 'noop'; end if;
    update public.payments set status = 'processing' where id = v.id;
    update public.payment_requests set status = 'processing'
      where status = 'unpaid' and id in (select payment_request_id from public.payment_items where payment_id = v.id and is_active and installment_id is null);
    update public.payment_request_installments set status = 'processing'
      where status in ('scheduled', 'due', 'failed') and id in (select installment_id from public.payment_items where payment_id = v.id and is_active and installment_id is not null);
    return 'applied';
  elsif p_status = 'failed' then
    if v.status not in ('requires_payment_method', 'processing') then return 'noop'; end if;
    update public.payments set status = 'failed' where id = v.id;
    update public.payment_requests set status = 'unpaid'
      where status = 'processing' and id in (select payment_request_id from public.payment_items where payment_id = v.id and installment_id is null);
    if v.off_session then
      -- The scheduler's attempt is over: record it (dunning), free the installments for the retry or a manual payment,
      -- and cancel the payment (reconcile voids a still-open intent at Stripe).
      perform private.installment_charge_failed(v.id);
      update public.payments set status = 'canceled' where id = v.id;
    else
      -- An interactive attempt (the family is still at checkout): back to open, no dunning clock.
      update public.payment_request_installments set status = 'failed'
        where status = 'processing' and id in (select installment_id from public.payment_items where payment_id = v.id and installment_id is not null);
    end if;
    return 'applied';
  else
    if v.status not in ('requires_payment_method', 'processing', 'failed') then return 'noop'; end if;
    update public.payments set status = 'canceled' where id = v.id;
    update public.payment_requests q set status = case when e.status = 'cancelled' then 'cancelled' else 'unpaid' end
      from public.payment_events e
      where e.id = q.payment_event_id and q.status = 'processing'
        and q.id in (select payment_request_id from public.payment_items where payment_id = v.id and installment_id is null);
    update public.payment_requests q set status = 'cancelled'
      from public.payment_events e
      where e.id = q.payment_event_id and q.status = 'unpaid' and e.status = 'cancelled'
        and q.id in (select payment_request_id from public.payment_items where payment_id = v.id and installment_id is null);
    update public.payment_request_installments set status = case when due_at <= now() then 'due' else 'scheduled' end
      where status in ('processing') and id in (select installment_id from public.payment_items where payment_id = v.id and installment_id is not null);
    return 'applied';
  end if;
end;
$$;

create or replace function public.svc_release_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v public.payments;
begin
  select * into v from public.payments where id = p_payment_id for update;
  if not found or v.stripe_payment_intent_id is not null or v.status <> 'requires_payment_method' then return; end if;
  update public.payments set status = 'canceled' where id = v.id;
  update public.payment_requests set status = 'unpaid'
  where status = 'processing' and id in (select payment_request_id from public.payment_items where payment_id = v.id and installment_id is null);
  update public.payment_request_installments set status = case when due_at <= now() then 'due' else 'scheduled' end
  where status = 'processing' and id in (select installment_id from public.payment_items where payment_id = v.id and installment_id is not null);
end;
$$;

-- Charging --------------------------------------------------------------------------------------------------------------
-- The scheduler's work list. Marks scheduled installments whose date has come as due, then returns installments to charge
-- off-session: autopay on, a saved card, no dispute anywhere in the household, no live payment, and either the first attempt
-- or a failed one whose retry time has come (at most 3 attempts). FOR UPDATE SKIP LOCKED keeps two runs from taking the same row;
-- the unique live-payment index and the idempotency key on the Stripe call keep a double charge impossible even if they did.
create function public.svc_claim_due_installments(p_now timestamptz default now(), p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_out jsonb;
begin
  update public.payment_request_installments set status = 'due' where status = 'scheduled' and due_at <= p_now;
  select coalesce(jsonb_agg(jsonb_build_object('installment_id', c.id, 'request_id', c.request_id, 'payer', c.autopay_by,
      'household_id', c.household_id, 'customer', c.cus, 'payment_method', c.pm, 'attempt', c.attempt_count)), '[]'::jsonb) into v_out
  from (
    select i.id, i.request_id, r.autopay_by, r.household_id, m.stripe_customer_id as cus, m.stripe_payment_method_id as pm, i.attempt_count
    from public.payment_request_installments i
    join public.payment_requests r on r.id = i.request_id
    join public.payment_events e on e.id = r.payment_event_id
    join public.payer_payment_methods m on m.household_id = r.household_id and m.connected_account_id = e.connected_account_id
    where r.autopay and r.autopay_by is not null and m.stripe_payment_method_id is not null and e.status = 'published'
      and r.status in ('unpaid', 'partially_paid')
      and not exists (select 1 from public.payment_requests d where d.household_id = r.household_id and d.disputed)
      and not exists (select 1 from public.payment_items pi where pi.installment_id = i.id and pi.is_active)
      and ((i.status = 'due' and i.attempt_count = 0)
           or (i.status = 'failed' and i.attempt_count < 3 and i.next_retry_at is not null and i.next_retry_at <= p_now))
    order by i.due_at, i.id
    limit least(greatest(p_limit, 1), 100)
    for update of i skip locked
  ) c;
  return v_out;
end;
$$;

revoke execute on function private.guard_item_plan_kind(), private.plan_quote(uuid, integer, timestamptz),
  private.compute_installment_quote(uuid, uuid[]), private.payment_installment_label(uuid), private.installment_charge_failed(uuid)
  from public, anon, authenticated;
revoke execute on function public.payer_plan_quote(uuid), public.payer_installment_quote(uuid[]), public.set_plan_autopay(uuid, boolean),
  public.svc_reserve_installments(uuid, uuid[], boolean), public.svc_reserve_plan(uuid, uuid, integer, boolean, text, text, text),
  public.svc_save_payment_method(uuid, uuid, text, text, uuid), public.svc_get_customer(uuid, uuid),
  public.svc_installment_charge_failed(uuid), public.svc_claim_due_installments(timestamptz, integer),
  public.svc_payment_succeeded(text, uuid, text, integer, integer, text, text, integer),
  public.svc_payment_status(text, text, uuid), public.svc_release_payment(uuid) from public, anon, authenticated;
grant execute on function public.payer_plan_quote(uuid), public.payer_installment_quote(uuid[]), public.set_plan_autopay(uuid, boolean) to authenticated;
grant execute on function public.svc_reserve_installments(uuid, uuid[], boolean), public.svc_reserve_plan(uuid, uuid, integer, boolean, text, text, text),
  public.svc_save_payment_method(uuid, uuid, text, text, uuid), public.svc_get_customer(uuid, uuid),
  public.svc_installment_charge_failed(uuid), public.svc_claim_due_installments(timestamptz, integer),
  public.svc_payment_succeeded(text, uuid, text, integer, integer, text, text, integer),
  public.svc_payment_status(text, text, uuid), public.svc_release_payment(uuid) to service_role;
grant execute on function private.plan_quote(uuid, integer, timestamptz), private.compute_installment_quote(uuid, uuid[]) to service_role;
