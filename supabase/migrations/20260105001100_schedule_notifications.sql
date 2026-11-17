-- Phase 2 (Part C): schedule notifications and RSVP reminders
--
-- Recipients of every schedule notification: staff of the team, guardians of ACTIVE rostered
-- players, and the login of a rostered 13+ player. Never the person who made the change (auth.uid()).
-- Delivery rules (preferences, quiet hours, device vs email) are the Phase 3 ones in
-- private.enqueue_notification; the in-app feed row is always written, as for messages.
-- Batching: every call writes ONE notification per recipient, however many events it touched
-- ("12 practices added"); the dedupe key is per change, so a retry or a repeated call is a no-op.
-- Only changes to time or place (the ones that bump events.revision) notify; title and notes edits are silent.

create function private.schedule_recipients(p_team_id uuid, p_exclude uuid)
returns table (profile_id uuid)
language sql stable security definer set search_path = ''
as $$
  select distinct x.pid from (
    select tm.profile_id as pid from public.team_memberships tm
      where tm.team_id = p_team_id and tm.status = 'active' and tm.role in ('admin', 'coach', 'manager')
    union
    select hm.profile_id from public.team_players tp
      join public.players p on p.id = tp.player_id
      join public.household_members hm on hm.household_id = p.household_id and hm.relationship = 'guardian'
      where tp.team_id = p_team_id and tp.status = 'active'
    union
    select p.profile_id from public.team_players tp
      join public.players p on p.id = tp.player_id
      where tp.team_id = p_team_id and tp.status = 'active' and p.profile_id is not null
  ) x
  where x.pid is not null and x.pid is distinct from p_exclude;
$$;

-- p_change: created | time_changed | location_changed | cancelled | result | reminder
-- p_detail: cancel reason, result score ("3-2"), or 'both' for a combined time + place change.
create function private.notify_schedule(
  p_team_id uuid, p_change text, p_event_id uuid, p_title text, p_count integer, p_type text,
  p_starts_at timestamptz, p_tz text, p_detail text default null, p_batch text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_noun text := case p_type when 'game' then 'game' when 'practice' then 'practice' else 'event' end;
  v_plural text := case when p_count = 1 then v_noun else v_noun || 's' end;
  v_when text := to_char(p_starts_at at time zone p_tz, 'Dy, Mon FMDD · FMHH12:MI AM');
  v_body text;
  v_payload jsonb;
  r record;
begin
  v_body := case p_change
    when 'created' then case when p_count > 1 then format('%s %s added', p_count, v_plural)
                             else format('New %s: %s', v_noun, v_when) end
    when 'time_changed' then case when p_count > 1 then format('%s %s rescheduled', p_count, v_plural)
                                  when p_detail = 'both' then format('Time and place changed: %s', v_when)
                                  else format('Time changed: %s', v_when) end
    when 'location_changed' then case when p_count > 1 then format('%s %s moved', p_count, v_plural)
                                      else 'Location changed' end
    when 'cancelled' then case when p_count > 1 then format('%s %s cancelled', p_count, v_plural)
                               else format('Cancelled: %s', left(coalesce(p_detail, ''), 80)) end
    when 'result' then format('Final score %s', replace(coalesce(p_detail, ''), '-', '–'))
    when 'reminder' then 'RSVP needed: ' || v_when
    else 'Schedule update' end;
  v_payload := jsonb_build_object('kind', 'schedule', 'change', p_change, 'event_id', p_event_id,
    'team_id', p_team_id, 'title', left(p_title, 100), 'body', v_body, 'count', p_count);
  for r in select * from private.schedule_recipients(p_team_id, auth.uid()) loop
    perform private.enqueue_notification(r.profile_id, 'schedule', v_payload,
      'sch:' || p_change || ':' || coalesce(p_batch, p_event_id::text) || ':' || r.profile_id);
  end loop;
end;
$$;

create or replace function public.create_event(
  p_team_id uuid, p_type text, p_title text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_timezone text, p_location_id uuid default null, p_location_text text default null,
  p_opponent_id uuid default null, p_home_away text default null, p_notes text default null,
  p_arrive_early_minutes integer default null, p_game_format jsonb default null,
  p_recurrence jsonb default null)
returns table (event_id uuid, series_id uuid, occurrences integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_series uuid;
  v_weekdays smallint[];
  v_interval int;
  v_until date;
  v_count int;
  v_start_local timestamp;
  v_starts_on date;
  v_duration interval;
  v_week_start date;
  v_d date;
  v_wd smallint;
  v_w int := 0;
  v_n int := 0;
  v_first uuid;
  v_ev uuid;
  v_dates date[] := '{}';
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.is_team_staff(p_team_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone) then
    raise exception 'invalid_timezone' using errcode = '23514';
  end if;
  if p_ends_at <= p_starts_at then raise exception 'ends_before_start' using errcode = '23514'; end if;

  if p_recurrence is null then
    insert into public.events (team_id, type, title, starts_at, ends_at, timezone, location_id, location_text,
                               opponent_id, home_away, notes, arrive_early_minutes, game_format, created_by)
    values (p_team_id, p_type, btrim(p_title), p_starts_at, p_ends_at, p_timezone, p_location_id,
            nullif(btrim(p_location_text), ''), p_opponent_id, p_home_away, p_notes,
            p_arrive_early_minutes, p_game_format, v_uid)
    returning id into v_id;
    perform private.write_audit('event.create', 'events', v_id, p_team_id, null, null,
      jsonb_build_object('type', p_type, 'title', btrim(p_title), 'starts_at', p_starts_at, 'timezone', p_timezone));
    perform private.notify_schedule(p_team_id, 'created', v_id, btrim(p_title), 1, p_type, p_starts_at, p_timezone,
      null, v_id::text);
    return query select v_id, null::uuid, 1;
    return;
  end if;

  -- Parse and validate the rule.
  if jsonb_typeof(p_recurrence) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_recurrence) k where k not in ('weekdays', 'interval', 'until', 'count')) then
    raise exception 'invalid_recurrence' using errcode = '23514';
  end if;
  select array_agg(distinct x::smallint order by x::smallint) into v_weekdays
    from jsonb_array_elements_text(coalesce(p_recurrence -> 'weekdays', '[]'::jsonb)) x
    where x ~ '^[1-7]$';
  if v_weekdays is null
     or cardinality(v_weekdays) <> (select count(*) from jsonb_array_elements(coalesce(p_recurrence -> 'weekdays', '[]'::jsonb))) then
    raise exception 'invalid_recurrence' using errcode = '23514', detail = 'weekdays must be ISO weekdays 1-7';
  end if;
  v_interval := coalesce((p_recurrence ->> 'interval')::int, 1);
  if v_interval not between 1 and 4 then raise exception 'invalid_recurrence' using errcode = '23514'; end if;
  v_until := (p_recurrence ->> 'until')::date;
  v_count := (p_recurrence ->> 'count')::int;
  if (v_until is null) = (v_count is null) then
    raise exception 'invalid_recurrence' using errcode = '23514', detail = 'give exactly one of until or count';
  end if;
  if v_count is not null and v_count not between 1 and 52 then
    raise exception 'series_cap_exceeded' using errcode = '23514', detail = 'At most 52 occurrences per series.';
  end if;

  v_start_local := p_starts_at at time zone p_timezone;
  v_starts_on := v_start_local::date;
  v_duration := p_ends_at - p_starts_at;
  if v_until is not null and (v_until < v_starts_on or v_until > v_starts_on + 366) then
    raise exception 'series_cap_exceeded' using errcode = '23514', detail = 'A series can run at most 366 days.';
  end if;

  -- Walk week by week from the Monday of the start week.
  v_week_start := v_starts_on - (extract(isodow from v_starts_on)::int - 1);
  <<gen>>
  loop
    foreach v_wd in array v_weekdays loop
      v_d := v_week_start + v_w * 7 + (v_wd - 1);
      if v_d < v_starts_on then continue; end if;
      if v_until is not null and v_d > v_until then exit gen; end if;
      v_n := v_n + 1;
      if v_n > 52 then
        raise exception 'series_cap_exceeded' using errcode = '23514', detail = 'At most 52 occurrences per series.';
      end if;
      v_dates := v_dates || v_d;
      if v_count is not null and v_n = v_count then exit gen; end if;
    end loop;
    v_w := v_w + v_interval;
    if v_w > 60 then exit gen; end if;
  end loop;
  if v_n = 0 then raise exception 'recurrence_empty' using errcode = '23514'; end if;

  insert into public.event_series (team_id, type, weekdays, interval_weeks, starts_on, until_on, occurrence_count,
                                   timezone, local_start_time, duration_minutes, created_by)
  values (p_team_id, p_type, v_weekdays, v_interval, v_starts_on, v_until, v_count, p_timezone,
          v_start_local::time, (extract(epoch from v_duration) / 60)::int, v_uid)
  returning id into v_series;

  foreach v_d in array v_dates loop
    -- local wall-clock time on that date, converted with the zone's rules for THAT date (DST-safe)
    insert into public.events (team_id, type, title, starts_at, ends_at, timezone, location_id, location_text,
                               opponent_id, home_away, notes, arrive_early_minutes, game_format, series_id, created_by)
    values (p_team_id, p_type, btrim(p_title), (v_d + v_start_local::time) at time zone p_timezone,
            ((v_d + v_start_local::time) at time zone p_timezone) + v_duration, p_timezone, p_location_id,
            nullif(btrim(p_location_text), ''), p_opponent_id, p_home_away, p_notes,
            p_arrive_early_minutes, p_game_format, v_series, v_uid)
    returning id into v_ev;
    v_first := coalesce(v_first, v_ev);
  end loop;

  perform private.write_audit('event_series.create', 'event_series', v_series, p_team_id, null, null,
    jsonb_build_object('type', p_type, 'title', btrim(p_title), 'occurrences', v_n, 'first_event_id', v_first,
                       'recurrence', p_recurrence, 'timezone', p_timezone));
  -- ONE notification for the whole series ("12 practices added"), keyed by the series.
  perform private.notify_schedule(p_team_id, 'created', v_first, btrim(p_title), v_n, p_type, p_starts_at, p_timezone,
    null, v_series::text);
  return query select v_first, v_series, v_n;
end;
$$;

create or replace function public.update_event(p_event_id uuid, p_scope text, p_patch jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  e public.events;
  r public.events;
  v_multi boolean;
  v_n int := 0;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_loc_id uuid;
  v_loc_text text;
  v_before jsonb;
  v_keys text[];
  v_time_or_place boolean := false;
  v_time_n int := 0;
  v_loc_n int := 0;
  v_notify_first uuid;
  v_t boolean;
  v_l boolean;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.events where id = p_event_id;
  if e.id is null or not private.is_team_staff(e.team_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_scope not in ('this', 'this_and_following', 'all') then
    raise exception 'invalid_scope' using errcode = '23514';
  end if;
  if e.status = 'cancelled' then raise exception 'event_cancelled' using errcode = '23514'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'invalid_patch' using errcode = '23514';
  end if;
  select array_agg(k) into v_keys from jsonb_object_keys(p_patch) k;
  if exists (select 1 from unnest(v_keys) k where k not in (
      'title', 'notes', 'location_id', 'location_text', 'opponent_id', 'home_away', 'arrive_early_minutes',
      'game_format', 'starts_at', 'ends_at', 'timezone', 'local_start_time', 'duration_minutes')) then
    raise exception 'invalid_patch' using errcode = '23514', detail = 'unknown field in patch';
  end if;
  v_multi := p_scope <> 'this' and e.series_id is not null;
  if v_multi and (p_patch ? 'starts_at' or p_patch ? 'ends_at' or p_patch ? 'timezone') then
    raise exception 'invalid_patch' using errcode = '23514',
      detail = 'Use local_start_time / duration_minutes to change times across a series.';
  end if;
  if p_patch ? 'timezone' and not exists (
      select 1 from pg_catalog.pg_timezone_names z where z.name = p_patch ->> 'timezone') then
    raise exception 'invalid_timezone' using errcode = '23514';
  end if;

  v_before := jsonb_build_object('title', e.title, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'timezone', e.timezone, 'location_id', e.location_id, 'location_text', e.location_text);

  for r in select * from private.event_scope_targets(p_event_id, p_scope) loop
    v_tz := coalesce(p_patch ->> 'timezone', r.timezone);
    v_start := case
      when p_patch ? 'starts_at' then (p_patch ->> 'starts_at')::timestamptz
      when p_patch ? 'local_start_time' then
        ((r.starts_at at time zone r.timezone)::date + (p_patch ->> 'local_start_time')::time) at time zone v_tz
      when p_patch ? 'timezone' then r.starts_at
      else r.starts_at end;
    v_end := case
      when p_patch ? 'ends_at' then (p_patch ->> 'ends_at')::timestamptz
      when p_patch ? 'duration_minutes' then v_start + ((p_patch ->> 'duration_minutes')::int * interval '1 minute')
      else v_start + (r.ends_at - r.starts_at) end;

    v_loc_id := case when p_patch ? 'location_id' then nullif(p_patch ->> 'location_id', '')::uuid else r.location_id end;
    v_loc_text := case when p_patch ? 'location_text' then nullif(btrim(p_patch ->> 'location_text'), '') else r.location_text end;
    if p_patch ? 'location_id' and v_loc_id is not null and not (p_patch ? 'location_text') then v_loc_text := null; end if;
    if p_patch ? 'location_text' and v_loc_text is not null and not (p_patch ? 'location_id') then v_loc_id := null; end if;

    update public.events set
      title = case when p_patch ? 'title' then btrim(p_patch ->> 'title') else r.title end,
      notes = case when p_patch ? 'notes' then p_patch ->> 'notes' else r.notes end,
      starts_at = v_start, ends_at = v_end, timezone = v_tz,
      location_id = v_loc_id, location_text = v_loc_text,
      opponent_id = case when p_patch ? 'opponent_id' then nullif(p_patch ->> 'opponent_id', '')::uuid else r.opponent_id end,
      home_away = case when p_patch ? 'home_away' then p_patch ->> 'home_away' else r.home_away end,
      arrive_early_minutes = case when p_patch ? 'arrive_early_minutes' then (p_patch ->> 'arrive_early_minutes')::smallint else r.arrive_early_minutes end,
      game_format = case when p_patch ? 'game_format' then p_patch -> 'game_format' else r.game_format end
    where id = r.id;
    v_t := v_start is distinct from r.starts_at or v_end is distinct from r.ends_at or v_tz is distinct from r.timezone;
    v_l := v_loc_id is distinct from r.location_id or v_loc_text is distinct from r.location_text;
    if v_t or v_l then
      v_time_or_place := true;
      v_notify_first := coalesce(v_notify_first, r.id);
    end if;
    if v_t then v_time_n := v_time_n + 1; end if;
    if v_l then v_loc_n := v_loc_n + 1; end if;
    v_n := v_n + 1;
  end loop;

  perform private.write_audit('event.update', 'events', p_event_id, e.team_id, null, v_before,
    jsonb_build_object('scope', p_scope, 'patch', p_patch, 'events_changed', v_n,
                       'time_or_location_changed', v_time_or_place));
  -- Only changes that bump the revision (time or place) notify; title/notes edits are silent.
  if v_time_or_place then
    perform private.notify_schedule(e.team_id,
      case when v_time_n > 0 then 'time_changed' else 'location_changed' end,
      v_notify_first, coalesce(p_patch ->> 'title', e.title), greatest(v_time_n, v_loc_n), e.type,
      (select x.starts_at from public.events x where x.id = v_notify_first), e.timezone,
      case when v_time_n > 0 and v_loc_n > 0 then 'both' end, gen_random_uuid()::text);
  end if;
  return v_n;
end;
$$;

create or replace function public.cancel_event(p_event_id uuid, p_scope text, p_reason text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  e public.events;
  v_ids uuid[];
  v_n int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.events where id = p_event_id;
  if e.id is null or not private.is_team_staff(e.team_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_scope not in ('this', 'this_and_following', 'all') then
    raise exception 'invalid_scope' using errcode = '23514';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 300 then
    raise exception 'reason_required' using errcode = '23514';
  end if;
  if e.status = 'cancelled' then raise exception 'already_cancelled' using errcode = '23514'; end if;

  select array_agg(t.id) into v_ids from private.event_scope_targets(p_event_id, p_scope) t where t.status = 'scheduled';
  if exists (select 1 from public.game_results g where g.event_id = any (v_ids)) then
    raise exception 'event_has_result' using errcode = '23514', detail = 'Clear the result before cancelling.';
  end if;
  update public.events set status = 'cancelled', cancelled_reason = btrim(p_reason) where id = any (v_ids);
  get diagnostics v_n = row_count;
  perform private.write_audit('event.cancel', 'events', p_event_id, e.team_id, null,
    jsonb_build_object('status', 'scheduled'),
    jsonb_build_object('status', 'cancelled', 'reason', btrim(p_reason), 'scope', p_scope, 'events_changed', v_n));
  perform private.notify_schedule(e.team_id, 'cancelled', p_event_id, e.title, v_n, e.type, e.starts_at, e.timezone,
    btrim(p_reason), gen_random_uuid()::text);
  return v_n;
end;
$$;

create or replace function public.record_game_result(
  p_event_id uuid, p_our_score integer, p_their_score integer,
  p_period_scores jsonb default null, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  e public.events;
  v_prev public.game_results;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.events where id = p_event_id;
  if e.id is null or not private.is_team_staff(e.team_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if e.type <> 'game' then raise exception 'results_only_for_games' using errcode = '23514'; end if;
  if e.status = 'cancelled' then raise exception 'event_cancelled' using errcode = '23514'; end if;
  if e.starts_at > now() then raise exception 'event_not_started' using errcode = '23514'; end if;
  select * into v_prev from public.game_results where event_id = p_event_id;

  insert into public.game_results (event_id, our_score, their_score, period_scores, notes, entered_by)
  values (p_event_id, p_our_score, p_their_score, p_period_scores, nullif(btrim(p_notes), ''), v_uid)
  on conflict (event_id) do update
    set our_score = excluded.our_score, their_score = excluded.their_score,
        period_scores = excluded.period_scores, notes = excluded.notes, entered_by = excluded.entered_by,
        entered_at = now()
  returning id into v_id;
  perform private.write_audit('game_result.record', 'game_results', v_id, e.team_id, null,
    case when v_prev.id is null then null
         else jsonb_build_object('our_score', v_prev.our_score, 'their_score', v_prev.their_score) end,
    jsonb_build_object('event_id', p_event_id, 'our_score', p_our_score, 'their_score', p_their_score));
  -- Keyed by the score, so re-saving the same result does not notify twice but a correction does.
  perform private.notify_schedule(e.team_id, 'result', p_event_id, e.title, 1, e.type, e.starts_at, e.timezone,
    format('%s-%s', p_our_score, p_their_score), p_event_id::text || ':' || p_our_score || '-' || p_their_score);
  return v_id;
end;
$$;


-- RSVP reminders: every 15 minutes, guardians with a child who has not answered an event starting
-- within 24 hours get ONE reminder for that event (cancelled events are skipped; the dedupe key makes
-- a second run a no-op). The reminder never carries a child's name.
create function private.send_rsvp_reminders()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_n int := 0;
begin
  for r in
    select distinct e.id as event_id, e.team_id, e.title, e.type, e.starts_at, e.timezone, hm.profile_id
    from public.events e
    join public.team_players tp on tp.team_id = e.team_id and tp.status = 'active'
    join public.players p on p.id = tp.player_id
    join public.household_members hm on hm.household_id = p.household_id and hm.relationship = 'guardian'
    left join public.rsvps rs on rs.event_id = e.id and rs.player_id = p.id
    where e.status = 'scheduled' and e.starts_at > now() and e.starts_at <= now() + interval '24 hours'
      and rs.id is null
      and not exists (select 1 from public.notification_outbox o
                      where o.dedupe_key = 'sch:reminder:' || e.id || ':' || hm.profile_id || ':in_app')
  loop
    perform private.enqueue_notification(r.profile_id, 'schedule',
      jsonb_build_object('kind', 'schedule', 'change', 'reminder', 'event_id', r.event_id, 'team_id', r.team_id,
        'title', left(r.title, 100), 'count', 1,
        'body', 'RSVP needed: ' || to_char(r.starts_at at time zone r.timezone, 'Dy, Mon FMDD · FMHH12:MI AM')),
      'sch:reminder:' || r.event_id || ':' || r.profile_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

select cron.schedule('schedule-rsvp-reminders', '*/15 * * * *', 'select private.send_rsvp_reminders()');

revoke execute on function
  private.schedule_recipients(uuid, uuid),
  private.notify_schedule(uuid, text, uuid, text, integer, text, timestamptz, text, text, text),
  private.send_rsvp_reminders() from public, anon, authenticated;
