-- A worker that dies mid-delivery leaves its row 'sending'. When the lease expires and the row is
-- re-claimed, count that as an attempt so a row that keeps crashing the worker cannot loop forever.
create or replace function public.claim_notifications(p_limit integer default 50)
returns table (id uuid, profile_id uuid, category text, channel text, payload jsonb, attempts integer)
language sql security definer set search_path = ''
as $$
  with due as (
    select o.id from public.notification_outbox o
    where o.channel in ('push', 'email')
      and o.status in ('pending', 'failed', 'sending')
      and o.deliver_after <= now()
      and o.attempts < 5
    order by o.deliver_after
    limit greatest(1, least(p_limit, 200))
    for update skip locked)
  update public.notification_outbox o
    set status = 'sending',
        deliver_after = now() + interval '5 minutes',
        attempts = o.attempts + case when o.status = 'sending' then 1 else 0 end
  from due where o.id = due.id
  returning o.id, o.profile_id, o.category, o.channel, o.payload, o.attempts;
$$;
