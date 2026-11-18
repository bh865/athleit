-- The in-app feed (toasts, badge, alerts) must get one row per message: only push and email
-- collapse bursts. Passing the message id as p_event_key keys the in_app row to that message.
drop function if exists private.enqueue_notification(uuid, text, jsonb, text, uuid, text, boolean);
create or replace function private.enqueue_notification(
  p_profile_id uuid, p_category text, p_payload jsonb, p_dedupe_base text,
  p_thread_id uuid default null, p_preview text default null, p_sensitive boolean default false,
  p_event_key text default null)
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
    values (p_profile_id, p_category, 'in_app', v_payload - 'preview', 'sent', now(), coalesce('ev:' || p_event_key || ':' || p_profile_id, p_dedupe_base) || ':in_app')
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

create or replace function private.notify_new_message()
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
    perform private.enqueue_notification(r.profile_id, v_category, v_payload, v_base, t.id, new.body, v_sensitive, new.id::text);
  end loop;
  return null;
end;
$$;

revoke execute on function private.enqueue_notification(uuid, text, jsonb, text, uuid, text, boolean, text), private.notify_new_message() from public, anon, authenticated;
