-- Phase 3 (5/6): notification preferences, push devices, notification outbox
--
-- Outbox channel 'in_app' is the in-app notification centre / Realtime toast feed: rows are
-- written already 'sent' and are the only outbox rows a client can read (their own).
-- 'sms_reserved' and 'payments_reserved' exist so the model does not change later; nothing
-- implements them and clients cannot enable them.

create table public.notification_preferences (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  channel text not null constraint notification_preferences_channel_check
    check (channel in ('push', 'email', 'sms_reserved')),
  category text not null constraint notification_preferences_category_check
    check (category in ('messages', 'announcements', 'schedule', 'payments_reserved')),
  enabled boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'UTC' constraint notification_preferences_tz_length check (char_length(timezone) <= 64),
  -- Show a message preview on the lock screen / in email. Off by default; never used for
  -- threads that include a minor.
  include_preview boolean not null default false,
  primary key (profile_id, channel, category),
  constraint notification_preferences_quiet_pair check ((quiet_hours_start is null) = (quiet_hours_end is null))
);

create function private.validate_notification_preference()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'invalid_timezone' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger notification_preferences_validate
  before insert or update of timezone on public.notification_preferences
  for each row execute function private.validate_notification_preference();

-- Defaults: push and email on for messages, announcements and schedule; no quiet hours;
-- previews off. Reserved channels/categories get no rows (and are treated as off).
create function private.seed_notification_preferences(p_profile_id uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into public.notification_preferences (profile_id, channel, category)
  select p_profile_id, ch, cat
  from unnest(array['push', 'email']) ch, unnest(array['messages', 'announcements', 'schedule']) cat
  on conflict do nothing;
$$;

create function private.seed_preferences_trigger()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.seed_notification_preferences(new.id);
  return new;
end;
$$;
create trigger profiles_seed_notification_preferences
  after insert on public.profiles
  for each row execute function private.seed_preferences_trigger();

select private.seed_notification_preferences(id) from public.profiles;

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null constraint push_devices_platform_check check (platform in ('ios', 'android', 'web')),
  -- Expo push token (ios/android) or the Web Push endpoint URL (web).
  token text not null constraint push_devices_token_length check (char_length(token) between 10 and 2000),
  -- Web Push keys ({"p256dh": ..., "auth": ...}); null for Expo tokens.
  subscription jsonb,
  device_label text constraint push_devices_label_length check (char_length(device_label) <= 100),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (platform, token)
);
create index push_devices_active_idx on public.push_devices (profile_id) where revoked_at is null;

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  category text not null constraint notification_outbox_category_check
    check (category in ('messages', 'announcements', 'schedule', 'payments_reserved')),
  channel text not null constraint notification_outbox_channel_check
    check (channel in ('push', 'email', 'sms_reserved', 'in_app')),
  payload jsonb not null default '{}' constraint notification_outbox_payload_size check (pg_column_size(payload) <= 8192),
  status text not null default 'pending' constraint notification_outbox_status_check
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text constraint notification_outbox_error_length check (char_length(last_error) <= 500),
  deliver_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  dedupe_key text not null unique constraint notification_outbox_dedupe_length check (char_length(dedupe_key) <= 300)
);
-- The delivery worker's queue scan and the in-app feed.
create index notification_outbox_queue_idx on public.notification_outbox (deliver_after)
  where status in ('pending', 'failed');
create index notification_outbox_inapp_idx on public.notification_outbox (profile_id, created_at desc)
  where channel = 'in_app';

alter table public.notification_preferences enable row level security;
alter table public.push_devices enable row level security;
alter table public.notification_outbox enable row level security;
revoke all on public.notification_preferences, public.push_devices, public.notification_outbox from anon, authenticated;
grant select, insert on public.notification_preferences to authenticated;
grant update (enabled, quiet_hours_start, quiet_hours_end, timezone, include_preview)
  on public.notification_preferences to authenticated;
grant select on public.push_devices, public.notification_outbox to authenticated;

create policy "Read own preferences" on public.notification_preferences
  for select to authenticated using (profile_id = (select auth.uid()));
create policy "Create own preferences (implemented channels and categories only)" on public.notification_preferences
  for insert to authenticated
  with check (profile_id = (select auth.uid()) and channel in ('push', 'email')
              and category in ('messages', 'announcements', 'schedule'));
create policy "Change own preferences" on public.notification_preferences
  for update to authenticated
  using (profile_id = (select auth.uid()) and channel in ('push', 'email'))
  with check (profile_id = (select auth.uid()) and channel in ('push', 'email'));

create policy "Read own devices" on public.push_devices
  for select to authenticated using (profile_id = (select auth.uid()));
create policy "Read own in-app notifications" on public.notification_outbox
  for select to authenticated using (profile_id = (select auth.uid()) and channel = 'in_app');

-- Register (or take over) a device. A token seen under another account (shared device after
-- logout/login) moves to the caller and is un-revoked.
create function public.register_push_device(
  p_platform text, p_token text, p_subscription jsonb default null, p_label text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_platform not in ('ios', 'android', 'web') then raise exception 'invalid_platform' using errcode = '23514'; end if;
  if p_token is null or char_length(p_token) not between 10 and 2000 then
    raise exception 'invalid_token' using errcode = '23514';
  end if;
  if p_platform = 'web' and (p_subscription is null or p_token !~ '^https://') then
    raise exception 'invalid_web_subscription' using errcode = '23514';
  end if;
  if p_platform <> 'web' and p_token !~ '^Expo(nent)?PushToken\[.+\]$' then
    raise exception 'invalid_expo_token' using errcode = '23514';
  end if;
  insert into public.push_devices (profile_id, platform, token, subscription, device_label)
    values (v_uid, p_platform, p_token, p_subscription, left(p_label, 100))
    on conflict (platform, token) do update
      set profile_id = excluded.profile_id, subscription = excluded.subscription,
          device_label = coalesce(excluded.device_label, public.push_devices.device_label),
          last_seen_at = now(), revoked_at = null
    returning id into v_id;
  return v_id;
end;
$$;

-- Sign out this device: revoke by id (device list) or by token (logout).
create function public.revoke_push_device(p_device_id uuid default null, p_token text default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  update public.push_devices set revoked_at = now()
    where profile_id = auth.uid() and revoked_at is null
      and ((p_device_id is not null and id = p_device_id) or (p_token is not null and token = p_token));
end;
$$;

create function public.mark_notifications_read(p_ids uuid[] default null)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_rows int;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  update public.notification_outbox set read_at = now()
    where profile_id = auth.uid() and channel = 'in_app' and read_at is null
      and (p_ids is null or id = any (p_ids));
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke execute on function
  private.validate_notification_preference(), private.seed_notification_preferences(uuid),
  private.seed_preferences_trigger() from public, anon, authenticated;
revoke execute on function
  public.register_push_device(text, text, jsonb, text), public.revoke_push_device(uuid, text),
  public.mark_notifications_read(uuid[]) from public, anon, authenticated;
grant execute on function
  public.register_push_device(text, text, jsonb, text), public.revoke_push_device(uuid, text),
  public.mark_notifications_read(uuid[]) to authenticated;
