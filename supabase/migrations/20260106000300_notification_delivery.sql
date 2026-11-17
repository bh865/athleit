-- Phase 3 Part C: delivery plumbing.
--  * claim_notifications(): the worker atomically claims due rows (FOR UPDATE SKIP LOCKED)
--  * a statement-level trigger kicks the Edge Function through pg_net right after rows land
--  * a pg_cron sweep every minute re-kicks for pending/failed/stuck rows (safety net)
--  * push_devices remember which thread is open so the active thread suppresses push
--  * admin-only failure listing (no payload bodies, no tokens)
-- The function URL and its (public) anon key live in Vault, never in this file; until they are
-- set, kicks are a no-op and nothing is lost: the rows simply wait.

create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.push_devices
  add column active_thread_id uuid references public.threads (id) on delete set null,
  add column active_at timestamptz;
create index push_devices_active_thread_idx on public.push_devices (active_thread_id)
  where active_thread_id is not null;

-- The app calls this when a conversation opens (thread id) and closes (null), and heartbeats
-- while it stays open. Only the caller's own device can be updated.
create function public.set_active_thread(p_token text, p_thread_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_thread_id is not null and not private.can_read_thread(p_thread_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.push_devices
    set active_thread_id = p_thread_id, active_at = case when p_thread_id is null then null else now() end
    where profile_id = auth.uid() and token = p_token and revoked_at is null;
end;
$$;

-- Claim up to p_limit due rows for delivery. Claimed rows get a 5 minute lease (deliver_after in
-- the future, status 'sending'); a worker that dies simply lets the lease expire and the row is
-- picked up again. Service role only.
create function public.claim_notifications(p_limit integer default 50)
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
    set status = 'sending', deliver_after = now() + interval '5 minutes'
  from due where o.id = due.id
  returning o.id, o.profile_id, o.category, o.channel, o.payload, o.attempts;
$$;

-- Admin view of failures: metadata only. Team admins see failures for their own team.
create function public.get_notification_failures(p_team_id uuid)
returns table (id uuid, category text, channel text, status text, attempts integer, last_error text,
               created_at timestamptz, deliver_after timestamptz)
language sql stable security definer set search_path = ''
as $$
  select o.id, o.category, o.channel, o.status, o.attempts, o.last_error, o.created_at, o.deliver_after
  from public.notification_outbox o
  where private.has_team_role(p_team_id, array['admin']::public.team_role[])
    and o.channel in ('push', 'email')
    and o.status in ('failed', 'skipped')
    and o.payload ->> 'team_id' = p_team_id::text
  order by o.created_at desc
  limit 200;
$$;

-- Fire-and-forget call to the Edge Function. No-op until the Vault secrets exist.
create function private.kick_delivery()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_function_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'notify_anon_key';
  if v_url is null or v_key is null then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000);
exception when others then
  -- Never let a failed kick block the message that triggered it; the cron sweep retries.
  null;
end;
$$;

create function private.kick_after_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.kick_delivery();
  return null;
end;
$$;
create trigger notification_outbox_kick
  after insert on public.notification_outbox
  referencing new table as new_rows
  for each statement execute function private.kick_after_insert();

-- Safety net: every minute, kick if anything is due (pending, failed with elapsed backoff, or a
-- lease that expired because a worker died).
create function private.sweep_notifications()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.notification_outbox o
             where o.channel in ('push', 'email') and o.status in ('pending', 'failed', 'sending')
               and o.deliver_after <= now() and o.attempts < 5) then
    perform private.kick_delivery();
  end if;
end;
$$;

select cron.schedule('notification-sweep', '* * * * *', 'select private.sweep_notifications()');

revoke execute on function
  private.kick_delivery(), private.kick_after_insert(), private.sweep_notifications()
  from public, anon, authenticated;
revoke execute on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
revoke execute on function public.set_active_thread(text, uuid), public.get_notification_failures(uuid)
  from public, anon, authenticated;
grant execute on function public.set_active_thread(text, uuid), public.get_notification_failures(uuid)
  to authenticated;
