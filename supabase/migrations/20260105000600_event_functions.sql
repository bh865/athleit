-- Phase 2 (7/9): create_event, update_event, cancel_event, delete_event
--
-- All four are SECURITY DEFINER, check auth.uid() and team-staff role themselves, and write
-- audit_log rows. Row-level validation (timezone, same-team location/opponent, games-only
-- fields, game_format, revision bump) lives in the events trigger, so it holds for any writer.
--
-- Recurrence (p_recurrence), weekly only:
--   {"weekdays": [2, 4], "interval": 1, "until": "2027-03-01"}   or   {"weekdays": [2], "count": 12}
-- weekdays are ISO (1 = Monday ... 7 = Sunday). Occurrences are the dates the rule produces from
-- the start date onward (the start date itself only if its weekday is listed). Every occurrence
-- keeps the same LOCAL wall-clock start time in the event's timezone, so a 5:30 PM practice stays
-- 5:30 PM across DST; the duration is a fixed length. CAP: 52 occurrences per series and at most
-- 366 days from the start date. A rule that would exceed either is REJECTED (series_cap_exceeded),
-- never silently truncated.

create function public.create_event(
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
  return query select v_first, v_series, v_n;
end;
$$;

-- Events a scope applies to (scheduled only; cancelled occurrences are left alone).
create function private.event_scope_targets(p_event_id uuid, p_scope text)
returns setof public.events
language plpgsql stable security definer set search_path = ''
as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event_id;
  if e.id is null then return; end if;
  if p_scope = 'this' or e.series_id is null then
    return query select * from public.events where id = p_event_id;
  elsif p_scope = 'this_and_following' then
    return query select * from public.events x
      where x.series_id = e.series_id and x.starts_at >= e.starts_at and x.status = 'scheduled' order by x.starts_at;
  else
    return query select * from public.events x
      where x.series_id = e.series_id and x.status = 'scheduled' order by x.starts_at;
  end if;
end;
$$;

-- scope: 'this' | 'this_and_following' | 'all' (series events; a non-series event is always just itself).
-- patch keys: title, notes, location_id, location_text, opponent_id, home_away, arrive_early_minutes,
-- game_format, starts_at, ends_at, timezone (single event only) and local_start_time ('HH:MI') /
-- duration_minutes (any scope; applied per occurrence in its own timezone, so DST is preserved).
-- A JSON null clears a nullable field. Returns the number of events changed.
create function public.update_event(p_event_id uuid, p_scope text, p_patch jsonb)
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
    if v_start is distinct from r.starts_at or v_end is distinct from r.ends_at or v_tz is distinct from r.timezone
       or v_loc_id is distinct from r.location_id or v_loc_text is distinct from r.location_text then
      v_time_or_place := true;
    end if;
    v_n := v_n + 1;
  end loop;

  perform private.write_audit('event.update', 'events', p_event_id, e.team_id, null, v_before,
    jsonb_build_object('scope', p_scope, 'patch', p_patch, 'events_changed', v_n,
                       'time_or_location_changed', v_time_or_place));
  return v_n;
end;
$$;

create function public.cancel_event(p_event_id uuid, p_scope text, p_reason text)
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
  return v_n;
end;
$$;

-- Only events with no RSVPs and no result can be deleted; otherwise cancel them.
create function public.delete_event(p_event_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare e public.events;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.events where id = p_event_id;
  if e.id is null or not private.is_team_staff(e.team_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.rsvps r where r.event_id = p_event_id) then
    raise exception 'event_has_rsvps' using errcode = '23503', detail = 'Cancel the event instead.';
  end if;
  if exists (select 1 from public.game_results g where g.event_id = p_event_id) then
    raise exception 'event_has_result' using errcode = '23503', detail = 'Clear the result first, or cancel the event.';
  end if;
  delete from public.events where id = p_event_id;
  if e.series_id is not null and not exists (select 1 from public.events x where x.series_id = e.series_id) then
    delete from public.event_series where id = e.series_id;
  end if;
  perform private.write_audit('event.delete', 'events', p_event_id, e.team_id, null,
    jsonb_build_object('type', e.type, 'title', e.title, 'starts_at', e.starts_at), null);
end;
$$;

revoke execute on function private.event_scope_targets(uuid, text) from public, anon, authenticated;
revoke execute on function
  public.create_event(uuid, text, text, timestamptz, timestamptz, text, uuid, text, uuid, text, text, integer, jsonb, jsonb),
  public.update_event(uuid, text, jsonb), public.cancel_event(uuid, text, text), public.delete_event(uuid)
  from public, anon, authenticated;
grant execute on function
  public.create_event(uuid, text, text, timestamptz, timestamptz, text, uuid, text, uuid, text, text, integer, jsonb, jsonb),
  public.update_event(uuid, text, jsonb), public.cancel_event(uuid, text, text), public.delete_event(uuid)
  to authenticated;
