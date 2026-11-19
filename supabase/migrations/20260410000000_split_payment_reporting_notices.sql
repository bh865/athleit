-- Split payments, step 2e: reporting and notices.
--  * event_collection_summary / _detail count plan requests by their installments: "collected" never includes scheduled installments;
--    new columns report what is scheduled, how many families are on plans and how many installments are overdue.
--  * Due-soon (3 days) and overdue notices move to the installment (plan requests are excluded from the request-level notices).
--  * Card-expiry warning 7 days before an autopay installment is due (the Edge Function reads the card's expiry from Stripe).

alter table public.payment_request_installments add column card_expiry_warned_at timestamptz;

create or replace function private.send_payment_due_notices()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_total integer := 0;
begin
  -- Plan requests are noticed per INSTALLMENT (send_installment_notices), never here, so nothing fires twice.
  -- Due within 3 days (and not yet overdue).
  for r in
    select q.household_id, q.payment_event_id, e.title, e.team_id, e.club_id, min(q.due_at) as due_at,
           count(*) as n, sum(q.amount_cents) as cents, min(q.id::text)::uuid as first_request
    from public.payment_requests q join public.payment_events e on e.id = q.payment_event_id
    where q.status = 'unpaid' and q.plan_count is null and e.status = 'published' and q.due_soon_notified_at is null
      and q.due_at > now() and q.due_at <= now() + interval '3 days'
    group by q.household_id, q.payment_event_id, e.title, e.team_id, e.club_id
  loop
    update public.payment_requests set due_soon_notified_at = now()
      where household_id = r.household_id and payment_event_id = r.payment_event_id and status = 'unpaid'
        and due_soon_notified_at is null and due_at > now() and due_at <= now() + interval '3 days';
    perform private.notify_payment(r.household_id, 'due_soon', r.title,
      case when r.n = 1 then format('%s due %s', private.money_text(r.cents), to_char(r.due_at, 'Mon FMDD'))
           else format('%s requests · %s due %s', r.n, private.money_text(r.cents), to_char(r.due_at, 'Mon FMDD')) end,
      jsonb_build_object('payment_event_id', r.payment_event_id, 'team_id', r.team_id, 'club_id', r.club_id,
                         'request_id', case when r.n = 1 then r.first_request end, 'count', r.n),
      'pay:soon:' || r.payment_event_id || ':' || r.household_id);
    v_total := v_total + r.n;
  end loop;

  -- Overdue.
  for r in
    select q.household_id, q.payment_event_id, e.title, e.team_id, e.club_id, min(q.due_at) as due_at,
           count(*) as n, sum(q.amount_cents) as cents, min(q.id::text)::uuid as first_request
    from public.payment_requests q join public.payment_events e on e.id = q.payment_event_id
    where q.status = 'unpaid' and q.plan_count is null and e.status = 'published' and q.overdue_notified_at is null and q.due_at <= now()
    group by q.household_id, q.payment_event_id, e.title, e.team_id, e.club_id
  loop
    update public.payment_requests set overdue_notified_at = now()
      where household_id = r.household_id and payment_event_id = r.payment_event_id and status = 'unpaid'
        and overdue_notified_at is null and due_at <= now();
    perform private.notify_payment(r.household_id, 'overdue', r.title,
      case when r.n = 1 then format('Overdue: %s was due %s', private.money_text(r.cents), to_char(r.due_at, 'Mon FMDD'))
           else format('%s overdue requests · %s', r.n, private.money_text(r.cents)) end,
      jsonb_build_object('payment_event_id', r.payment_event_id, 'team_id', r.team_id, 'club_id', r.club_id,
                         'request_id', case when r.n = 1 then r.first_request end, 'count', r.n),
      'pay:late:' || r.payment_event_id || ':' || r.household_id);
    v_total := v_total + r.n;
  end loop;
  return v_total;
end;
$$;

create function private.send_installment_notices()
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
      and r.status in ('unpaid', 'partially_paid') and e.status = 'published'
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
      and r.status in ('unpaid', 'partially_paid') and e.status = 'published'
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
select cron.schedule('payments-installment-notices', '12 * * * *', 'select private.send_installment_notices()');

-- Autopay installments due within 7 days whose saved card has not been checked yet (the Edge Function reads the expiry from Stripe).
create function public.svc_cards_to_check(p_now timestamptz default now())
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('installment_id', n.id, 'due_at', n.due_at, 'payment_method', m.stripe_payment_method_id,
      'stripe_account_id', a.stripe_account_id)), '[]'::jsonb)
  from public.payment_request_installments n
  join public.payment_requests r on r.id = n.request_id
  join public.payment_events e on e.id = r.payment_event_id
  join public.connected_accounts a on a.id = e.connected_account_id
  join public.payer_payment_methods m on m.household_id = r.household_id and m.connected_account_id = e.connected_account_id
  where n.status in ('scheduled', 'due') and n.card_expiry_warned_at is null and r.autopay and r.status in ('unpaid', 'partially_paid')
    and e.status = 'published' and m.stripe_payment_method_id is not null
    and n.due_at > p_now and n.due_at <= p_now + interval '7 days';
$$;

create function public.svc_warn_card_expiring(p_installment_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare i record;
begin
  select n.id, n.sequence, r.id as request_id, r.household_id, r.plan_count, e.id as event_id, e.title, n.card_expiry_warned_at
    into i from public.payment_request_installments n join public.payment_requests r on r.id = n.request_id
    join public.payment_events e on e.id = r.payment_event_id where n.id = p_installment_id for update of n;
  if not found or i.card_expiry_warned_at is not null then return 'noop'; end if;
  update public.payment_request_installments set card_expiry_warned_at = now() where id = p_installment_id;
  perform private.notify_payment(i.household_id, 'card_expiring', i.title,
    format('Your saved card expires before installment %s of %s is due. Update it to keep automatic payments going.', i.sequence, i.plan_count),
    jsonb_build_object('payment_event_id', i.event_id, 'request_id', i.request_id, 'installment_id', i.id), 'pay:card-exp:' || i.id);
  return 'applied';
end;
$$;
revoke execute on function private.send_installment_notices(), public.svc_cards_to_check(timestamptz), public.svc_warn_card_expiring(uuid)
  from public, anon, authenticated;
grant execute on function private.send_installment_notices(), public.svc_cards_to_check(timestamptz), public.svc_warn_card_expiring(uuid) to service_role;

-- Reporting ------------------------------------------------------------------------------------------------------------
-- A "unit" is a plain request, or one installment of a plan request. Collected counts settled units only.
drop function public.event_collection_summary(uuid);
create function public.event_collection_summary(p_event_id uuid)
returns table (expected_cents bigint, collected_cents bigint, outstanding_cents bigint, refunded_cents bigint,
               waived_cents bigint, total_requests integer, paid_count integer, unpaid_count integer,
               processing_count integer, waived_count integer, refunded_count integer, disputed_count integer,
               progress_percent integer, due_at timestamptz, status text,
               scheduled_cents bigint, plans_count integer, partially_paid_count integer, overdue_installments integer)
language sql stable security definer set search_path = ''
as $$
  with q as (
    select r.* from public.payment_requests r
    where r.payment_event_id = p_event_id and private.is_event_staff(p_event_id)),
  units as (
    select q.id as request_id, q.amount_cents as amount, q.status as st, null::timestamptz as due, false as is_inst from q where q.plan_count is null
    union all
    select i.request_id, i.amount_cents, i.status, i.due_at, true from public.payment_request_installments i join q on q.id = i.request_id
  ),
  agg as (
    select coalesce(sum(amount) filter (where st not in ('cancelled', 'waived')), 0) as expected,
           coalesce(sum(amount) filter (where st in ('paid', 'paid_offline', 'partially_refunded')), 0) as collected,
           coalesce(sum(amount) filter (where st in ('unpaid', 'processing', 'scheduled', 'due', 'failed')), 0) as outstanding,
           coalesce(sum(amount) filter (where st = 'scheduled' and is_inst), 0) as scheduled,
           coalesce(sum(amount) filter (where st = 'waived'), 0) as waived,
           count(*) filter (where is_inst and st in ('due', 'failed') and due <= now()) as overdue_n
    from units),
  rq as (
    select count(*) filter (where status <> 'cancelled') as total,
           count(*) filter (where status in ('paid', 'paid_offline', 'partially_refunded')) as paid_n,
           count(*) filter (where status = 'unpaid') as unpaid_n,
           count(*) filter (where status = 'processing') as processing_n,
           count(*) filter (where status = 'partially_paid') as partial_n,
           count(*) filter (where status = 'waived') as waived_n,
           count(*) filter (where status = 'refunded') as refunded_n,
           count(*) filter (where disputed) as disputed_n,
           count(*) filter (where plan_count is not null and status not in ('cancelled', 'waived')) as plans_n
    from q)
  select agg.expected, agg.collected, agg.outstanding,
         (select coalesce(sum(f.amount_cents), 0) from public.refunds f
            join public.payment_items i on i.id = f.payment_item_id
            join public.payment_requests rq2 on rq2.id = i.payment_request_id
          where rq2.payment_event_id = p_event_id and f.status = 'succeeded' and private.is_event_staff(p_event_id)),
         agg.waived, rq.total::integer, rq.paid_n::integer, rq.unpaid_n::integer, rq.processing_n::integer,
         rq.waived_n::integer, rq.refunded_n::integer, rq.disputed_n::integer,
         case when agg.expected = 0 then 0 else least(100, (agg.collected * 100 / agg.expected))::integer end,
         ev.due_at, ev.status,
         agg.scheduled, rq.plans_n::integer, rq.partial_n::integer, agg.overdue_n::integer
  from agg cross join rq
  cross join public.payment_events ev
  where ev.id = p_event_id and private.is_event_staff(p_event_id);
$$;

drop function public.event_collection_detail(uuid);
create function public.event_collection_detail(p_event_id uuid)
returns table (request_id uuid, display_id text, player_name text, household_name text, amount_cents integer,
               status text, due_at timestamptz, paid_at timestamptz, paid_via text, receipt_display_id text,
               last_reminded_at timestamptz, disputed boolean,
               plan_count integer, installments_paid integer, paid_cents bigint, next_due_at timestamptz, overdue boolean, autopay boolean)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.display_id, p.first_name || ' ' || p.last_name, h.name, r.amount_cents, r.status, r.due_at,
         r.paid_at,
         case when r.status = 'paid_offline' then 'offline'
              when r.status in ('paid', 'partially_paid', 'partially_refunded', 'refunded') then 'card' end,
         (select pay.receipt_display_id from public.payment_items i
            join public.payments pay on pay.id = i.payment_id
          where i.payment_request_id = r.id and pay.receipt_display_id is not null
          order by pay.succeeded_at desc nulls last limit 1),
         r.last_reminded_at, r.disputed,
         r.plan_count::integer,
         (select count(*)::integer from public.payment_request_installments n where n.request_id = r.id and n.status in ('paid', 'paid_offline', 'partially_refunded', 'refunded')),
         coalesce((select sum(n.amount_cents) from public.payment_request_installments n where n.request_id = r.id and n.status in ('paid', 'paid_offline', 'partially_refunded')), 0)::bigint,
         (select min(n.due_at) from public.payment_request_installments n where n.request_id = r.id and n.status in ('scheduled', 'due', 'failed')),
         exists (select 1 from public.payment_request_installments n where n.request_id = r.id and n.status in ('due', 'failed') and n.due_at <= now()),
         r.autopay
  from public.payment_requests r
  join public.players p on p.id = r.player_id
  join public.households h on h.id = r.household_id
  where r.payment_event_id = p_event_id and private.is_event_staff(p_event_id)
  order by p.last_name, p.first_name, r.display_id;
$$;
revoke execute on function public.event_collection_summary(uuid), public.event_collection_detail(uuid) from public, anon, authenticated;
grant execute on function public.event_collection_summary(uuid), public.event_collection_detail(uuid) to authenticated;
