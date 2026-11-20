-- Schedule redesign, 3b: the previous time or place in the revision notice.
-- update_event records WHAT changed and the previous values on the event (last_change) in the same statement
-- that changes it. A later time or place change replaces it; title and notes edits leave it alone. A series edit
-- writes it on every affected occurrence. It holds no names of children and is not part of the calendar feed.
-- last_change shape: {kind: time|place|both, prev_starts_at, prev_ends_at, prev_timezone, prev_place, revision, changed_at}
-- where `revision` is the event revision the change produced, so a reader can tell whether it is the latest.

alter table public.events add column last_change jsonb;
-- Only update_event (security definer) writes it (authenticated has select only on events); get_event returns it.

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
      'game_format', 'virtual_url', 'starts_at', 'ends_at', 'timezone', 'local_start_time', 'duration_minutes')) then
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

    v_t := v_start is distinct from r.starts_at or v_end is distinct from r.ends_at or v_tz is distinct from r.timezone;
    v_l := v_loc_id is distinct from r.location_id or v_loc_text is distinct from r.location_text;
    update public.events set
      last_change = case when v_t or v_l then jsonb_build_object(
        'kind', case when v_t and v_l then 'both' when v_t then 'time' else 'place' end,
        'prev_starts_at', r.starts_at, 'prev_ends_at', r.ends_at, 'prev_timezone', r.timezone,
        'prev_place', coalesce((select pl.name from public.locations pl where pl.id = r.location_id), r.location_text),
        'revision', r.revision + 1, 'changed_at', now()) else r.last_change end,
      title = case when p_patch ? 'title' then btrim(p_patch ->> 'title') else r.title end,
      notes = case when p_patch ? 'notes' then p_patch ->> 'notes' else r.notes end,
      starts_at = v_start, ends_at = v_end, timezone = v_tz,
      location_id = v_loc_id, location_text = v_loc_text,
      opponent_id = case when p_patch ? 'opponent_id' then nullif(p_patch ->> 'opponent_id', '')::uuid else r.opponent_id end,
      home_away = case when p_patch ? 'home_away' then p_patch ->> 'home_away' else r.home_away end,
      arrive_early_minutes = case when p_patch ? 'arrive_early_minutes' then (p_patch ->> 'arrive_early_minutes')::smallint else r.arrive_early_minutes end,
      game_format = case when p_patch ? 'game_format' then p_patch -> 'game_format' else r.game_format end,
      virtual_url = case when p_patch ? 'virtual_url' then nullif(btrim(p_patch ->> 'virtual_url'), '') else r.virtual_url end
    where id = r.id;
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

drop function public.get_event(uuid);
create function public.get_event(p_event_id uuid)
returns table (
  id uuid, team_id uuid, team_name text, sport public.sport, type text, title text,
  starts_at timestamptz, ends_at timestamptz, timezone text,
  location_id uuid, location_name text, location_address text, location_lat double precision, location_lng double precision, location_place_id text, location_text text,
  opponent_id uuid, opponent_name text, home_away text, notes text, arrive_early_minutes smallint,
  status text, cancelled_reason text, series_id uuid, game_format jsonb, revision integer,
  is_staff boolean, our_score smallint, their_score smallint, outcome text, period_scores jsonb, result_notes text, virtual_url text,
  seen_revision integer, last_change jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    select e.id, e.team_id, t.name, t.sport, e.type, e.title, e.starts_at, e.ends_at, e.timezone,
           e.location_id, l.name, l.address, l.lat, l.lng, l.place_id, e.location_text, e.opponent_id, o.name, e.home_away, e.notes,
           e.arrive_early_minutes, e.status, e.cancelled_reason, e.series_id, e.game_format, e.revision,
           private.is_team_staff(e.team_id), g.our_score, g.their_score, g.outcome, g.period_scores, g.notes, e.virtual_url,
           s.revision, e.last_change
    from public.events e
    join public.teams t on t.id = e.team_id
    left join public.locations l on l.id = e.location_id
    left join public.opponents o on o.id = e.opponent_id
    left join public.game_results g on g.event_id = e.id
    left join public.event_seen s on s.event_id = e.id and s.user_id = (select auth.uid())
    where e.id = p_event_id and private.can_view_team_schedule(e.team_id);
end;
$$;


revoke execute on function public.update_event(uuid, text, jsonb), public.get_event(uuid) from public, anon, authenticated;
grant execute on function public.update_event(uuid, text, jsonb), public.get_event(uuid) to authenticated;
