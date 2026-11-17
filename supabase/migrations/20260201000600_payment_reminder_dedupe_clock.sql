-- Phase 4 (A7): reminder dedupe key uses the wall clock, not the transaction time
--
-- A reminder is already limited to once per request per 24 hours by last_reminded_at; the dedupe key only
-- guards against delivering the same notification twice, so it must differ between separate reminder
-- runs (a run inside a long transaction used to reuse the key and silently drop the second reminder).

create or replace function public.send_payment_reminders(p_event_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  e public.payment_events;
  v_count integer := 0;
  r record;
begin
  select * into e from public.payment_events where id = p_event_id for update;
  if not found or not private.is_issuer_staff(e.team_id, e.club_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if e.status <> 'published' then raise exception 'event_not_open' using errcode = '23514'; end if;

  for r in
    select q.household_id, count(*) as n, min(q.id::text)::uuid as first_request, sum(q.amount_cents) as cents
    from public.payment_requests q
    where q.payment_event_id = p_event_id and q.status = 'unpaid'
      and (q.last_reminded_at is null or q.last_reminded_at <= now() - interval '24 hours')
    group by q.household_id
  loop
    update public.payment_requests set last_reminded_at = now()
    where payment_event_id = p_event_id and household_id = r.household_id and status = 'unpaid'
      and (last_reminded_at is null or last_reminded_at <= now() - interval '24 hours');
    v_count := v_count + r.n;
    perform private.notify_payment(r.household_id, 'reminder', e.title,
      format('Reminder: %s due %s', private.money_text(r.cents), to_char(e.due_at, 'Mon FMDD')),
      jsonb_build_object('payment_event_id', p_event_id, 'team_id', e.team_id, 'club_id', e.club_id,
                         'request_id', case when r.n = 1 then r.first_request end, 'count', r.n),
      'pay:rem:' || p_event_id || ':' || r.household_id || ':' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSUS'));
  end loop;
  if v_count > 0 then
    perform private.write_audit('payment_event.remind', 'payment_events', p_event_id, e.team_id, e.club_id, null,
      jsonb_build_object('requests_reminded', v_count));
  end if;
  return v_count;
end;
$$;
