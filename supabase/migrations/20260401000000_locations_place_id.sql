-- Places autocomplete: a Google place id on locations, and the schedule reads return lat, lng and place id
-- so every map link can open the exact place. lat and lng (and their grants) already exist; this adds place_id.
-- We store only the address the user picked plus its coordinates and place id; nothing else from Google.

alter table public.locations
  add column place_id text constraint locations_place_id_length check (place_id is null or char_length(place_id) between 1 and 300);

grant insert (place_id) on public.locations to authenticated;
grant update (place_id) on public.locations to authenticated;

-- Return types change, so each function is dropped and recreated (bodies are otherwise unchanged).

drop function public.team_schedule(uuid, text, integer, integer);
create function public.team_schedule(
  p_team_id uuid, p_when text default 'upcoming', p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, team_id uuid, type text, title text, starts_at timestamptz, ends_at timestamptz, timezone text,
  location_id uuid, location_name text, location_address text, location_lat double precision, location_lng double precision, location_place_id text, location_text text,
  opponent_id uuid, opponent_name text, home_away text, notes text, arrive_early_minutes smallint,
  status text, cancelled_reason text, series_id uuid, game_format jsonb, revision integer,
  going integer, not_going integer, maybe integer, no_reply integer,
  our_score smallint, their_score smallint, outcome text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_when not in ('upcoming', 'past') then raise exception 'invalid_when' using errcode = '23514'; end if;
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    select e.id, e.team_id, e.type, e.title, e.starts_at, e.ends_at, e.timezone,
           e.location_id, l.name, l.address, l.lat, l.lng, l.place_id, e.location_text,
           e.opponent_id, o.name, e.home_away, e.notes, e.arrive_early_minutes,
           e.status, e.cancelled_reason, e.series_id, e.game_format, e.revision,
           c.going, c.not_going, c.maybe, c.no_reply, g.our_score, g.their_score, g.outcome
    from public.events e
    left join public.locations l on l.id = e.location_id
    left join public.opponents o on o.id = e.opponent_id
    left join public.game_results g on g.event_id = e.id
    cross join lateral private.rsvp_counts(e.id, e.team_id) c
    where e.team_id = p_team_id and private.can_view_team_schedule(p_team_id)
      and (case when p_when = 'upcoming' then e.ends_at >= now() else e.ends_at < now() end)
    order by case when p_when = 'upcoming' then e.starts_at end asc,
             case when p_when = 'past' then e.starts_at end desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

drop function public.household_schedule(text, integer, integer);
create function public.household_schedule(
  p_when text default 'upcoming', p_limit integer default 50, p_offset integer default 0)
returns table (
  event_id uuid, team_id uuid, team_name text, type text, title text, starts_at timestamptz, ends_at timestamptz,
  timezone text, location_name text, location_address text, location_lat double precision, location_lng double precision, location_place_id text, location_text text, opponent_name text,
  home_away text, arrive_early_minutes smallint, status text, cancelled_reason text, revision integer,
  player_id uuid, player_first_name text, rsvp_status text, rsvp_note text,
  our_score smallint, their_score smallint, outcome text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_when not in ('upcoming', 'past') then raise exception 'invalid_when' using errcode = '23514'; end if;
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    select e.id, e.team_id, t.name, e.type, e.title, e.starts_at, e.ends_at, e.timezone,
           l.name, l.address, l.lat, l.lng, l.place_id, e.location_text, o.name, e.home_away, e.arrive_early_minutes,
           e.status, e.cancelled_reason, e.revision,
           p.id, p.first_name, r.status, r.note, g.our_score, g.their_score, g.outcome
    from public.players p
    join public.team_players tp on tp.player_id = p.id and tp.status = 'active'
    join public.events e on e.team_id = tp.team_id
    join public.teams t on t.id = e.team_id
    left join public.locations l on l.id = e.location_id
    left join public.opponents o on o.id = e.opponent_id
    left join public.rsvps r on r.event_id = e.id and r.player_id = p.id
    left join public.game_results g on g.event_id = e.id
    where (p.profile_id = (select auth.uid()) or private.is_guardian_of(p.id))
      and (case when p_when = 'upcoming' then e.ends_at >= now() else e.ends_at < now() end)
    order by case when p_when = 'upcoming' then e.starts_at end asc,
             case when p_when = 'past' then e.starts_at end desc, p.first_name
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

drop function public.next_up(integer);
create function public.next_up(p_limit integer default 5)
returns table (
  event_id uuid, team_id uuid, team_name text, type text, title text, starts_at timestamptz, ends_at timestamptz,
  timezone text, location_name text, location_address text, location_lat double precision, location_lng double precision, location_place_id text, location_text text, opponent_name text,
  home_away text, arrive_early_minutes smallint, revision integer, is_staff boolean, children jsonb,
  going integer, not_going integer, maybe integer, no_reply integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    with kids as (
      select tp.team_id as k_team, p.id as k_player, p.first_name as k_name
      from public.team_players tp
      join public.players p on p.id = tp.player_id
      where tp.status = 'active' and (p.profile_id = (select auth.uid()) or private.is_guardian_of(p.id))
    ), staff_teams as (
      select tm.team_id as s_team from public.team_memberships tm
      where tm.profile_id = (select auth.uid()) and tm.status = 'active' and tm.role in ('admin', 'coach', 'manager')
    ), my_teams as (
      select k_team as m_team from kids union select s_team from staff_teams
    )
    select e.id, e.team_id, t.name, e.type, e.title, e.starts_at, e.ends_at, e.timezone,
           l.name, l.address, l.lat, l.lng, l.place_id, e.location_text, o.name, e.home_away, e.arrive_early_minutes, e.revision,
           exists (select 1 from staff_teams s where s.s_team = e.team_id),
           (select coalesce(jsonb_agg(jsonb_build_object('player_id', k.k_player, 'first_name', k.k_name, 'status', r.status)
                                      order by k.k_name), '[]'::jsonb)
            from kids k left join public.rsvps r on r.event_id = e.id and r.player_id = k.k_player
            where k.k_team = e.team_id),
           c.going, c.not_going, c.maybe, c.no_reply
    from public.events e
    join my_teams mt on mt.m_team = e.team_id
    join public.teams t on t.id = e.team_id
    left join public.locations l on l.id = e.location_id
    left join public.opponents o on o.id = e.opponent_id
    cross join lateral private.rsvp_counts(e.id, e.team_id) c
    where e.status = 'scheduled' and e.ends_at >= now()
    order by e.starts_at
    limit least(greatest(p_limit, 1), 20);
end;
$$;

drop function public.team_schedule_range(uuid, timestamptz, timestamptz);
create function public.team_schedule_range(p_team_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, team_id uuid, type text, title text, starts_at timestamptz, ends_at timestamptz, timezone text,
  location_id uuid, location_name text, location_address text, location_lat double precision, location_lng double precision, location_place_id text, location_text text,
  opponent_id uuid, opponent_name text, home_away text, notes text, arrive_early_minutes smallint,
  status text, cancelled_reason text, series_id uuid, game_format jsonb, revision integer,
  going integer, not_going integer, maybe integer, no_reply integer,
  our_score smallint, their_score smallint, outcome text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_to <= p_from or p_to - p_from > interval '100 days' then
    raise exception 'invalid_range' using errcode = '23514';
  end if;
  return query
    select e.id, e.team_id, e.type, e.title, e.starts_at, e.ends_at, e.timezone,
           e.location_id, l.name, l.address, l.lat, l.lng, l.place_id, e.location_text,
           e.opponent_id, o.name, e.home_away, e.notes, e.arrive_early_minutes,
           e.status, e.cancelled_reason, e.series_id, e.game_format, e.revision,
           c.going, c.not_going, c.maybe, c.no_reply, g.our_score, g.their_score, g.outcome
    from public.events e
    left join public.locations l on l.id = e.location_id
    left join public.opponents o on o.id = e.opponent_id
    left join public.game_results g on g.event_id = e.id
    cross join lateral private.rsvp_counts(e.id, e.team_id) c
    where e.team_id = p_team_id and private.can_view_team_schedule(p_team_id)
      and e.starts_at < p_to and e.ends_at >= p_from
    order by e.starts_at
    limit 500;
end;
$$;

drop function public.household_schedule_range(timestamptz, timestamptz);
create function public.household_schedule_range(p_from timestamptz, p_to timestamptz)
returns table (
  event_id uuid, team_id uuid, team_name text, type text, title text, starts_at timestamptz, ends_at timestamptz,
  timezone text, location_name text, location_address text, location_lat double precision, location_lng double precision, location_place_id text, location_text text, opponent_name text,
  home_away text, arrive_early_minutes smallint, status text, cancelled_reason text, revision integer,
  player_id uuid, player_first_name text, rsvp_status text, rsvp_note text,
  our_score smallint, their_score smallint, outcome text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_to <= p_from or p_to - p_from > interval '100 days' then
    raise exception 'invalid_range' using errcode = '23514';
  end if;
  return query
    select e.id, e.team_id, t.name, e.type, e.title, e.starts_at, e.ends_at, e.timezone,
           l.name, l.address, l.lat, l.lng, l.place_id, e.location_text, o.name, e.home_away, e.arrive_early_minutes,
           e.status, e.cancelled_reason, e.revision,
           p.id, p.first_name, r.status, r.note, g.our_score, g.their_score, g.outcome
    from public.players p
    join public.team_players tp on tp.player_id = p.id and tp.status = 'active'
    join public.events e on e.team_id = tp.team_id
    join public.teams t on t.id = e.team_id
    left join public.locations l on l.id = e.location_id
    left join public.opponents o on o.id = e.opponent_id
    left join public.rsvps r on r.event_id = e.id and r.player_id = p.id
    left join public.game_results g on g.event_id = e.id
    where (p.profile_id = (select auth.uid()) or private.is_guardian_of(p.id))
      and e.starts_at < p_to and e.ends_at >= p_from
    order by e.starts_at, p.first_name
    limit 500;
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
  is_staff boolean, our_score smallint, their_score smallint, outcome text, period_scores jsonb, result_notes text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    select e.id, e.team_id, t.name, t.sport, e.type, e.title, e.starts_at, e.ends_at, e.timezone,
           e.location_id, l.name, l.address, l.lat, l.lng, l.place_id, e.location_text, e.opponent_id, o.name, e.home_away, e.notes,
           e.arrive_early_minutes, e.status, e.cancelled_reason, e.series_id, e.game_format, e.revision,
           private.is_team_staff(e.team_id), g.our_score, g.their_score, g.outcome, g.period_scores, g.notes
    from public.events e
    join public.teams t on t.id = e.team_id
    left join public.locations l on l.id = e.location_id
    left join public.opponents o on o.id = e.opponent_id
    left join public.game_results g on g.event_id = e.id
    where e.id = p_event_id and private.can_view_team_schedule(e.team_id);
end;
$$;

drop function public.calendar_feed_events(uuid);
create function public.calendar_feed_events(p_profile_id uuid)
returns table (
  id uuid, team_name text, type text, title text, starts_at timestamptz, ends_at timestamptz, timezone text,
  location_name text, location_address text, location_lat double precision, location_lng double precision, location_place_id text, location_text text, opponent_name text, home_away text,
  notes text, arrive_early_minutes smallint, status text, cancelled_reason text, revision integer,
  updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with my_teams as (
    select tm.team_id from public.team_memberships tm
      where tm.profile_id = p_profile_id and tm.status = 'active' and tm.role in ('admin', 'coach', 'manager')
    union
    select tp.team_id from public.team_players tp
      join public.players p on p.id = tp.player_id
      where tp.status = 'active'
        and (p.profile_id = p_profile_id
             or exists (select 1 from public.household_members hm
                        where hm.household_id = p.household_id and hm.profile_id = p_profile_id
                          and hm.relationship = 'guardian'))
  )
  select e.id, t.name, e.type, e.title, e.starts_at, e.ends_at, e.timezone, l.name, l.address, l.lat, l.lng, l.place_id, e.location_text,
         o.name, e.home_away, e.notes, e.arrive_early_minutes, e.status, e.cancelled_reason, e.revision, e.updated_at
  from public.events e
  join my_teams mt on mt.team_id = e.team_id
  join public.teams t on t.id = e.team_id
  left join public.locations l on l.id = e.location_id
  left join public.opponents o on o.id = e.opponent_id
  where e.starts_at >= now() - interval '30 days' and e.starts_at < now() + interval '365 days'
  order by e.starts_at, e.id
  limit 2000;
$$;


revoke execute on function
  public.team_schedule(uuid, text, integer, integer), public.household_schedule(text, integer, integer),
  public.next_up(integer), public.team_schedule_range(uuid, timestamptz, timestamptz),
  public.household_schedule_range(timestamptz, timestamptz), public.get_event(uuid),
  public.calendar_feed_events(uuid)
  from public, anon, authenticated;
grant execute on function
  public.team_schedule(uuid, text, integer, integer), public.household_schedule(text, integer, integer),
  public.next_up(integer), public.team_schedule_range(uuid, timestamptz, timestamptz),
  public.household_schedule_range(timestamptz, timestamptz), public.get_event(uuid) to authenticated;
grant execute on function public.calendar_feed_events(uuid) to service_role;
