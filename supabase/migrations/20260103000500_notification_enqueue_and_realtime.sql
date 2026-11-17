-- Phase 3 (6/6): enqueue_notification, message trigger, schedule-change hook, Realtime
--
-- Delivery (Edge Function / pg_net / pg_cron) is Part C; this migration only decides WHO gets
-- WHAT and WHEN, and writes it to notification_outbox.

-- Quiet hours: if p_now falls inside [start, end) in the user's timezone (a window may cross
-- midnight), return the end of the window; otherwise p_now. Deferred, never dropped.
create function private.quiet_hours_deliver_after(
  p_now timestamptz, p_start time, p_end time, p_tz text)
returns timestamptz language plpgsql stable set search_path = ''
as $$
declare
  v_local timestamp;
  v_t time;
  v_in boolean;
  v_end_local timestamp;
begin
  if p_start is null or p_end is null or p_start = p_end then return p_now; end if;
  v_local := p_now at time zone coalesce(p_tz, 'UTC');
  v_t := v_local::time;
  v_in := case when p_start < p_end then v_t >= p_start and v_t < p_end else v_t >= p_start or v_t < p_end end;
  if not v_in then return p_now; end if;
  v_end_local := v_local::date + p_end;
  if p_start > p_end and v_t >= p_start then v_end_local := v_end_local + interval '1 day'; end if;
  return v_end_local at time zone coalesce(p_tz, 'UTC');
end;
$$;

-- Write the outbox rows for ONE recipient of ONE event. Applies, in order: thread mute,
-- per-channel/category preferences, quiet hours (deliver_after), push-device presence (email is
-- the fallback when there is no active push device), and dedupe_key (bursts collapse).
-- Previews are included only if the recipient opted in AND the thread is not sensitive (minors).
create function private.enqueue_notification(
  p_profile_id uuid, p_category text, p_payload jsonb, p_dedupe_base text,
  p_thread_id uuid default null, p_preview text default null, p_sensitive boolean default false)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_push public.notification_preferences;
  v_email public.notification_preferences;
  v_has_device boolean;
  v_payload jsonb;
begin
  if p_thread_id is not null and exists (
      select 1 from public.thread_participants tp
      where tp.thread_id = p_thread_id and tp.profile_id = p_profile_id and tp.muted_until > now()) then
    return;
  end if;

  select * into v_push from public.notification_preferences
    where profile_id = p_profile_id and channel = 'push' and category = p_category;
  select * into v_email from public.notification_preferences
    where profile_id = p_profile_id and channel = 'email' and category = p_category;
  -- No row = the default (enabled) for the implemented categories.
  if v_push.profile_id is null then v_push.enabled := p_category <> 'payments_reserved'; v_push.timezone := 'UTC'; end if;
  if v_email.profile_id is null then v_email.enabled := p_category <> 'payments_reserved'; v_email.timezone := 'UTC'; end if;

  v_payload := p_payload;
  if p_preview is not null and not p_sensitive and (v_push.include_preview or v_email.include_preview) then
    v_payload := v_payload || jsonb_build_object('preview', left(p_preview, 140));
  end if;
  v_payload := v_payload || jsonb_build_object('sensitive', p_sensitive);

  -- In-app feed (toasts, badges, notification centre): immediate, ignores quiet hours.
  insert into public.notification_outbox (profile_id, category, channel, payload, status, sent_at, dedupe_key)
    values (p_profile_id, p_category, 'in_app', v_payload - 'preview', 'sent', now(), p_dedupe_base || ':in_app')
    on conflict (dedupe_key) do nothing;

  select exists (select 1 from public.push_devices d
                 where d.profile_id = p_profile_id and d.revoked_at is null) into v_has_device;

  if v_push.enabled and v_has_device then
    insert into public.notification_outbox (profile_id, category, channel, payload, deliver_after, dedupe_key)
      values (p_profile_id, p_category, 'push',
              case when v_push.include_preview then v_payload else v_payload - 'preview' end,
              private.quiet_hours_deliver_after(now(), v_push.quiet_hours_start, v_push.quiet_hours_end, v_push.timezone),
              p_dedupe_base || ':push')
      on conflict (dedupe_key) do nothing;
  elsif v_email.enabled and not v_has_device then
    insert into public.notification_outbox (profile_id, category, channel, payload, deliver_after, dedupe_key)
      values (p_profile_id, p_category, 'email',
              case when v_email.include_preview then v_payload else v_payload - 'preview' end,
              private.quiet_hours_deliver_after(now(), v_email.quiet_hours_start, v_email.quiet_hours_end, v_email.timezone),
              p_dedupe_base || ':email')
      on conflict (dedupe_key) do nothing;
  end if;
end;
$$;

-- New message -> one notification set per eligible recipient (never the sender).
create function private.notify_new_message()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  t public.threads;
  v_sender text;
  v_sensitive boolean;
  v_category text;
  v_payload jsonb;
  v_base text;
  r record;
begin
  if new.sender_profile_id is null then return null; end if;
  select * into t from public.threads where id = new.thread_id;
  select display_name into v_sender from public.profiles where id = new.sender_profile_id;
  v_category := case when t.type = 'announcement' then 'announcements' else 'messages' end;
  v_sensitive := t.type <> 'announcement' and exists (
    select 1 from public.thread_participants tp
    where tp.thread_id = t.id and tp.left_at is null and private.is_minor(tp.profile_id));
  v_payload := jsonb_build_object(
    'kind', 'message', 'thread_id', t.id, 'message_id', new.id, 'team_id', t.team_id,
    'thread_type', t.type, 'title', coalesce(t.title, v_sender, 'New message'), 'sender_name', v_sender);

  for r in
    select distinct x.profile_id from (
      select tm.profile_id from public.team_memberships tm
        where t.type = 'announcement' and tm.team_id = t.team_id and tm.status = 'active'
      union all
      select tp.profile_id from public.thread_participants tp
        where t.type <> 'announcement' and tp.thread_id = t.id and tp.left_at is null
          and private.is_member_of(t.team_id, tp.profile_id)
    ) x where x.profile_id <> new.sender_profile_id
  loop
    v_base := case when t.type = 'announcement'
      then 'ann:' || new.id || ':' || r.profile_id
      else 'msg:' || t.id || ':' || r.profile_id || ':' || floor(extract(epoch from now()) / 30)::bigint end;
    perform private.enqueue_notification(r.profile_id, v_category, v_payload, v_base, t.id, new.body, v_sensitive);
  end loop;
  return null;
end;
$$;
create trigger messages_notify after insert on public.messages
  for each row execute function private.notify_new_message();

-- Hook for Phase 2 schedule events (new event, changed time/location, cancellation): the events
-- table is not in this branch, so the trigger that calls this is added with that schema.
create function private.notify_schedule_change(
  p_team_id uuid, p_kind text, p_event_id uuid, p_title text, p_version text default '1')
returns void language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  if p_kind not in ('created', 'time_changed', 'location_changed', 'cancelled') then
    raise exception 'invalid_schedule_kind' using errcode = '23514';
  end if;
  for r in select distinct tm.profile_id from public.team_memberships tm
           where tm.team_id = p_team_id and tm.status = 'active'
             and tm.profile_id is distinct from auth.uid()
  loop
    perform private.enqueue_notification(r.profile_id, 'schedule',
      jsonb_build_object('kind', 'schedule', 'change', p_kind, 'event_id', p_event_id,
                         'team_id', p_team_id, 'title', left(p_title, 100)),
      'sch:' || p_kind || ':' || p_event_id || ':' || p_version || ':' || r.profile_id);
  end loop;
end;
$$;

-- Realtime ---------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['messages', 'message_reads', 'message_reactions', 'thread_participants', 'notification_outbox'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Private channels: topic 'thread:<thread uuid>' carries typing (Broadcast) and presence.
-- Only people who can read the thread may join, receive or send.
create function private.can_use_thread_channel(p_topic text)
returns boolean language sql stable set search_path = ''
as $$
  select p_topic ~* '^thread:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and private.can_read_thread(substr(p_topic, 8)::uuid);
$$;

create policy "Thread members receive thread broadcast and presence" on realtime.messages
  for select to authenticated
  using (extension in ('broadcast', 'presence') and private.can_use_thread_channel((select realtime.topic())));
create policy "Thread members send thread broadcast and presence" on realtime.messages
  for insert to authenticated
  with check (extension in ('broadcast', 'presence') and private.can_use_thread_channel((select realtime.topic())));

revoke execute on function
  private.quiet_hours_deliver_after(timestamptz, time, time, text),
  private.enqueue_notification(uuid, text, jsonb, text, uuid, text, boolean),
  private.notify_new_message(), private.notify_schedule_change(uuid, text, uuid, text, text),
  private.can_use_thread_channel(text) from public, anon, authenticated;
grant execute on function private.can_use_thread_channel(text) to authenticated;
