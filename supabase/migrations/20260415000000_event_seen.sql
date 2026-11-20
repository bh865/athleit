-- Schedule redesign, 3a: "Updated" per viewer.
-- event_seen remembers which revision of an event a person last opened. The schedule reads append the viewer's
-- seen_revision so a row can show a quiet "Updated" chip while revision > coalesce(seen_revision, 0) and revision > 1.
-- Opening an event calls mark_event_seen once. Existing return columns keep their meaning; seen_revision is appended.

create table public.event_seen (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  revision integer not null check (revision >= 1),
  seen_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_seen_user_idx on public.event_seen (user_id);

alter table public.event_seen enable row level security;
-- A person reads only their own rows. Writes go through mark_event_seen (no direct insert or update grant).
create policy event_seen_select_own on public.event_seen for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.event_seen from public, anon, authenticated;
grant select on public.event_seen to authenticated;

-- Upserts the caller's seen revision to the event's current revision. The caller must be able to see the event.
create function public.mark_event_seen(p_event_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  e public.events;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.events where id = p_event_id;
  if e.id is null or not private.can_view_team_schedule(e.team_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.event_seen (event_id, user_id, revision, seen_at)
  values (e.id, v_uid, e.revision, now())
  on conflict (event_id, user_id) do update
    set revision = greatest(public.event_seen.revision, excluded.revision), seen_at = now();
  return e.revision;
end;
$$;
revoke execute on function public.mark_event_seen(uuid) from public, anon, authenticated;
grant execute on function public.mark_event_seen(uuid) to authenticated;

-- Reads: same bodies as before plus the viewer's seen_revision as the last column.
drop function public.team_schedule(uuid, text, integer, integer);
create function public.team_schedule(
  p_team_id uuid, p_when text default 'upcoming', p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, team_id uuid, type text, title text, starts_at timestamptz, ends_at timestamptz, timezone text,
  location_id uuid, location_name text, location_address text, location_lat double precision, location_lng double precision, location_place_id text, location_text text,
  opponent_id uuid, opponent_name text, home_away text, notes text, arrive_early_minutes smallint,
  status text, cancelled_reason text, series_id uuid, game_format jsonb, revision integer,
  going integer, not_going integer, maybe integer, no_reply integer,
  our_score smallint, their_score smallint, outcome text, seen_revision integer)
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
           c.going, c.not_going, c.maybe, c.no_reply, g.our_score, g.their_score, g.outcome, s.revision
    from public.events e
    left join public.locations l on l.id = e.location_id
    left join public.opponents o on o.id = e.opponent_id
    left join public.game_results g on g.event_id = e.id
    left join public.event_seen s on s.event_id = e.id and s.user_id = (select auth.uid())
    cross join lateral private.rsvp_counts(e.id, e.team_id) c
    where e.team_id = p_team_id and private.can_view_team_schedule(p_team_id)
      and (case when p_when = 'upcoming' then e.ends_at >= now() else e.ends_at < now() end)
    order by case when p_when = 'upcoming' then e.starts_at end asc,
             case when p_when = 'past' then e.starts_at end desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
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
  our_score smallint, their_score smallint, outcome text, seen_revision integer)
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
           c.going, c.not_going, c.maybe, c.no_reply, g.our_score, g.their_score, g.outcome, s.revision
    from public.events e
    left join public.locations l on l.id = e.location_id
    left join public.opponents o on o.id = e.opponent_id
    left join public.game_results g on g.event_id = e.id
    left join public.event_seen s on s.event_id = e.id and s.user_id = (select auth.uid())
    cross join lateral private.rsvp_counts(e.id, e.team_id) c
    where e.team_id = p_team_id and private.can_view_team_schedule(p_team_id)
      and e.starts_at < p_to and e.ends_at >= p_from
    order by e.starts_at
    limit 500;
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
  our_score smallint, their_score smallint, outcome text, seen_revision integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_when not in ('upcoming', 'past') then raise exception 'invalid_when' using errcode = '23514'; end if;
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    select e.id, e.team_id, t.name, e.type, e.title, e.starts_at, e.ends_at, e.timezone,
           l.name, l.address, l.lat, l.lng, l.place_id, e.location_text, o.name, e.home_away, e.arrive_early_minutes,
           e.status, e.cancelled_reason, e.revision,
           p.id, p.first_name, r.status, r.note, g.our_score, g.their_score, g.outcome, s.revision
    from public.players p
    join public.team_players tp on tp.player_id = p.id and tp.status = 'active'
    join public.events e on e.team_id = tp.team_id
    join public.teams t on t.id = e.team_id
    left join public.locations l on l.id = e.location_id
    left join public.opponents o on o.id = e.opponent_id
    left join public.rsvps r on r.event_id = e.id and r.player_id = p.id
    left join public.game_results g on g.event_id = e.id
    left join public.event_seen s on s.event_id = e.id and s.user_id = (select auth.uid())
    where (p.profile_id = (select auth.uid()) or private.is_guardian_of(p.id))
      and (case when p_when = 'upcoming' then e.ends_at >= now() else e.ends_at < now() end)
    order by case when p_when = 'upcoming' then e.starts_at end asc,
             case when p_when = 'past' then e.starts_at end desc, p.first_name
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

drop function public.household_schedule_range(timestamptz, timestamptz);
create function public.household_schedule_range(p_from timestamptz, p_to timestamptz)
returns table (
  event_id uuid, team_id uuid, team_name text, type text, title text, starts_at timestamptz, ends_at timestamptz,
  timezone text, location_name text, location_address text, location_lat double precision, location_lng double precision, location_place_id text, location_text text, opponent_name text,
  home_away text, arrive_early_minutes smallint, status text, cancelled_reason text, revision integer,
  player_id uuid, player_first_name text, rsvp_status text, rsvp_note text,
  our_score smallint, their_score smallint, outcome text, seen_revision integer)
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
           p.id, p.first_name, r.status, r.note, g.our_score, g.their_score, g.outcome, s.revision
    from public.players p
    join public.team_players tp on tp.player_id = p.id and tp.status = 'active'
    join public.events e on e.team_id = tp.team_id
    join public.teams t on t.id = e.team_id
    left join public.locations l on l.id = e.location_id
    left join public.opponents o on o.id = e.opponent_id
    left join public.rsvps r on r.event_id = e.id and r.player_id = p.id
    left join public.game_results g on g.event_id = e.id
    left join public.event_seen s on s.event_id = e.id and s.user_id = (select auth.uid())
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
  is_staff boolean, our_score smallint, their_score smallint, outcome text, period_scores jsonb, result_notes text, virtual_url text,
  seen_revision integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    select e.id, e.team_id, t.name, t.sport, e.type, e.title, e.starts_at, e.ends_at, e.timezone,
           e.location_id, l.name, l.address, l.lat, l.lng, l.place_id, e.location_text, e.opponent_id, o.name, e.home_away, e.notes,
           e.arrive_early_minutes, e.status, e.cancelled_reason, e.series_id, e.game_format, e.revision,
           private.is_team_staff(e.team_id), g.our_score, g.their_score, g.outcome, g.period_scores, g.notes, e.virtual_url,
           s.revision
    from public.events e
    join public.teams t on t.id = e.team_id
    left join public.locations l on l.id = e.location_id
    left join public.opponents o on o.id = e.opponent_id
    left join public.game_results g on g.event_id = e.id
    left join public.event_seen s on s.event_id = e.id and s.user_id = (select auth.uid())
    where e.id = p_event_id and private.can_view_team_schedule(e.team_id);
end;
$$;

revoke execute on function
  public.team_schedule(uuid, text, integer, integer), public.team_schedule_range(uuid, timestamptz, timestamptz),
  public.household_schedule(text, integer, integer), public.household_schedule_range(timestamptz, timestamptz),
  public.get_event(uuid) from public, anon, authenticated;
grant execute on function
  public.team_schedule(uuid, text, integer, integer), public.team_schedule_range(uuid, timestamptz, timestamptz),
  public.household_schedule(text, integer, integer), public.household_schedule_range(timestamptz, timestamptz),
  public.get_event(uuid) to authenticated;
