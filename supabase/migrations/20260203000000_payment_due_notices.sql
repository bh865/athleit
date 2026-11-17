-- Phase 4 (C1): automatic payment notices (pg_cron, hourly)
--
-- "Due in 3 days" and "overdue" notices, each sent ONCE per request (due_soon_notified_at / overdue_notified_at) and
-- batched to ONE notification per household per event, through the existing outbox (category 'payments', which
-- respects preferences, mutes and quiet hours). Only unpaid requests of published events are notified.

create function private.send_payment_due_notices()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_total integer := 0;
begin
  -- Due within 3 days (and not yet overdue).
  for r in
    select q.household_id, q.payment_event_id, e.title, e.team_id, e.club_id, min(q.due_at) as due_at,
           count(*) as n, sum(q.amount_cents) as cents, min(q.id::text)::uuid as first_request
    from public.payment_requests q join public.payment_events e on e.id = q.payment_event_id
    where q.status = 'unpaid' and e.status = 'published' and q.due_soon_notified_at is null
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
    where q.status = 'unpaid' and e.status = 'published' and q.overdue_notified_at is null and q.due_at <= now()
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

revoke execute on function private.send_payment_due_notices() from public, anon, authenticated;
grant execute on function private.send_payment_due_notices() to service_role;
select cron.schedule('payments-due-notices', '7 * * * *', 'select private.send_payment_due_notices()');
