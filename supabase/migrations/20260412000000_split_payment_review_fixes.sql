-- Split payments: fixes from the code review of feat/split-payments.
--  * cancel_open_payment frees installments (it left them 'processing', so the family could not pay again for a while).
--  * A refund on one installment no longer freezes the rest: a plan request that is partially_refunded can still be paid and charged.
--  * A cancelled/waived plan request with a paid installment is refundable on declined/withdrawn registrations.
--  * plan_deadline casts the event start in UTC, not the session time zone.
--  * Removing a player from the roster (delete) still cancels what they owe; setting them 'inactive' no longer does (a paused
--    spot is not a decision to stop collecting).
--  * Card-expiry checks are rate-limited with card_checked_at (one Stripe read per installment per day).

alter table public.payment_request_installments add column card_checked_at timestamptz;

create or replace function private.plan_deadline(r public.payment_requests, e public.payment_events)
returns timestamptz language sql stable security definer set search_path = ''
as $$
  select case when e.kind = 'registration' then
    coalesce((select case when re.require_full_balance = 'event_start' and re.starts_on is not null
                          then least(e.due_at, (re.starts_on::timestamp at time zone 'UTC')) else e.due_at end
              from public.registration_events re where re.id = e.registration_event_id), e.due_at)
    else r.due_at end;
$$;

drop trigger team_players_cancel_installments on public.team_players;

create function public.svc_mark_card_checked(p_installment_id uuid)
returns void language sql security definer set search_path = ''
as $$ update public.payment_request_installments set card_checked_at = now() where id = p_installment_id; $$;
revoke execute on function public.svc_mark_card_checked(uuid) from public, anon, authenticated;
grant execute on function public.svc_mark_card_checked(uuid) to service_role;

create or replace function public.cancel_open_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v public.payments;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v from public.payments where id = p_payment_id for update;
  if not found or not exists (
      select 1 from public.household_members hm
      where hm.household_id = v.household_id and hm.profile_id = (select auth.uid()) and hm.relationship = 'guardian') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  -- Only payments where no card has been confirmed. Money in flight or already taken is never touched here.
  if v.status not in ('requires_payment_method', 'failed') then
    raise exception 'payment_not_open' using errcode = '23514';
  end if;
  update public.payments set status = 'canceled' where id = v.id;
  -- Whole-request items free their request; installment items free their installments (the request status follows by roll-up).
  update public.payment_requests set status = 'unpaid'
  where status = 'processing' and id in (select payment_request_id from public.payment_items where payment_id = v.id and installment_id is null);
  update public.payment_request_installments set status = case when due_at <= now() then 'due' else 'scheduled' end
  where status = 'processing' and id in (select installment_id from public.payment_items where payment_id = v.id and installment_id is not null);
  perform private.write_audit('payment.cancel_open', 'payments', v.id, null, null,
    jsonb_build_object('status', v.status), jsonb_build_object('status', 'canceled'));
end;
$$;
create or replace function private.compute_installment_quote(p_uid uuid, p_installment_ids uuid[])
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
         bool_and(i.status in ('scheduled', 'due', 'failed') and r.status in ('unpaid', 'partially_paid', 'partially_refunded') and e.status = 'published'
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
create or replace function public.svc_claim_due_installments(p_now timestamptz default now(), p_limit integer default 25)
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
      and r.status in ('unpaid', 'partially_paid', 'partially_refunded')
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
create or replace function private.send_installment_notices()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  i record;
  v_total integer := 0;
begin
  -- Due within 3 days (not yet due). Autopay plans are told the card will be charged.
  for i in
    select n.id, n.sequence, n.amount_cents, n.due_at, r.id as request_id, r.household_id, r.plan_count, r.autopay, e.id as event_id, e.title
    from public.payment_request_installments n
    join public.payment_requests r on r.id = n.request_id join public.payment_events e on e.id = r.payment_event_id
    where n.status = 'scheduled' and n.due_soon_notified_at is null and n.due_at > now() and n.due_at <= now() + interval '3 days'
      and r.status in ('unpaid', 'partially_paid', 'partially_refunded') and e.status = 'published'
    for update of n skip locked
  loop
    update public.payment_request_installments set due_soon_notified_at = now() where id = i.id;
    perform private.notify_payment(i.household_id, 'installment_due_soon', i.title,
      format('Installment %s of %s (%s) %s %s', i.sequence, i.plan_count, private.money_text(i.amount_cents),
             case when i.autopay then 'will be charged to your saved card on' else 'is due' end, to_char(i.due_at at time zone 'UTC', 'Mon FMDD')),
      jsonb_build_object('payment_event_id', i.event_id, 'request_id', i.request_id, 'installment_id', i.id), 'pay:inst-soon:' || i.id);
    v_total := v_total + 1;
  end loop;

  -- Overdue: the date has passed and it is still open. Autopay installments are overdue only once the automatic attempts are used up
  -- (the dunning in installment_charge_failed notifies at that point and sets overdue_notified_at, so this never fires twice).
  for i in
    select n.id, n.sequence, n.due_at, r.id as request_id, r.household_id, r.plan_count, e.id as event_id, e.title, e.team_id, e.club_id
    from public.payment_request_installments n
    join public.payment_requests r on r.id = n.request_id join public.payment_events e on e.id = r.payment_event_id
    where n.status in ('due', 'failed') and n.overdue_notified_at is null and n.due_at <= now()
      and (not r.autopay or n.attempt_count >= 3)
      and r.status in ('unpaid', 'partially_paid', 'partially_refunded') and e.status = 'published'
    for update of n skip locked
  loop
    update public.payment_request_installments set overdue_notified_at = now() where id = i.id;
    perform private.notify_payment(i.household_id, 'installment_overdue', i.title,
      format('Installment %s of %s was due %s. Please pay it now.', i.sequence, i.plan_count, to_char(i.due_at at time zone 'UTC', 'Mon FMDD')),
      jsonb_build_object('payment_event_id', i.event_id, 'request_id', i.request_id, 'installment_id', i.id), 'pay:inst-late:' || i.id);
    perform private.notify_issuer_admins(i.team_id, i.club_id, 'installment_overdue', i.title,
      format('Installment %s of a payment plan is overdue.', i.sequence),
      jsonb_build_object('payment_event_id', i.event_id, 'request_id', i.request_id), 'pay:inst-late-staff:' || i.id);
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;
create or replace function public.svc_cards_to_check(p_now timestamptz default now())
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('installment_id', n.id, 'due_at', n.due_at, 'payment_method', m.stripe_payment_method_id,
      'stripe_account_id', a.stripe_account_id)), '[]'::jsonb)
  from public.payment_request_installments n
  join public.payment_requests r on r.id = n.request_id
  join public.payment_events e on e.id = r.payment_event_id
  join public.connected_accounts a on a.id = e.connected_account_id
  join public.payer_payment_methods m on m.household_id = r.household_id and m.connected_account_id = e.connected_account_id
  where n.status in ('scheduled', 'due') and n.card_expiry_warned_at is null and (n.card_checked_at is null or n.card_checked_at < p_now - interval '1 day') and r.autopay and r.status in ('unpaid', 'partially_paid', 'partially_refunded')
    and e.status = 'published' and m.stripe_payment_method_id is not null
    and n.due_at > p_now and n.due_at <= p_now + interval '7 days';
$$;
create or replace function public.registration_payment_status(p_registration_id uuid)
returns table (payment_request_id uuid, request_display_id text, request_status text, amount_cents integer, refundable boolean)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.display_id, q.status, q.amount_cents,
         (q.status in ('paid', 'partially_refunded')
          or (q.plan_count is not null and q.status in ('cancelled', 'waived')
              and exists (select 1 from public.payment_request_installments i where i.request_id = q.id and i.status in ('paid', 'partially_refunded'))))
         and r.status in ('declined', 'withdrawn')
  from public.registrations r
  join public.payment_requests q on q.id = r.payment_request_id
  where r.id = p_registration_id and (select auth.uid()) is not null and private.can_view_registration(r.id);
$$;
