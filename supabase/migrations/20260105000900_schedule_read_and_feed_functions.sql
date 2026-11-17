-- Phase 2 (9/9 part 2): read helpers for the UI and the calendar feed token functions

-- team_schedule: one team's events, p_when = 'upcoming' (not yet ended, soonest first) or
-- 'past' (ended, latest first). Includes cancelled events, counts, and any result. Empty for
-- anyone who cannot see the team's schedule. p_limit is clamped to 1..100.
create function public.team_schedule(
  p_team_id uuid, p_when text default 'upcoming', p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, team_id uuid, type text, title text, starts_at timestamptz, ends_at timestamptz, timezone text,
  location_id uuid, location_name text, location_address text, location_text text,
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
           e.location_id, l.name, l.address, e.location_text,
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

-- household_schedule: events across every team the viewer's children (or the viewer, if a 13+
-- player with a login) are actively rostered on, ONE ROW PER CHILD with that child's RSVP.
create function public.household_schedule(
  p_when text default 'upcoming', p_limit integer default 50, p_offset integer default 0)
returns table (
  event_id uuid, team_id uuid, team_name text, type text, title text, starts_at timestamptz, ends_at timestamptz,
  timezone text, location_name text, location_address text, location_text text, opponent_name text,
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
           l.name, l.address, e.location_text, o.name, e.home_away, e.arrive_early_minutes,
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

-- next_up: the viewer's next scheduled (not cancelled, not yet ended) events across all their
-- teams, as staff and/or as family. `children` lists the viewer's own rostered children on that
-- team with their RSVP status ([] for staff-only viewers).
create function public.next_up(p_limit integer default 5)
returns table (
  event_id uuid, team_id uuid, team_name text, type text, title text, starts_at timestamptz, ends_at timestamptz,
  timezone text, location_name text, location_address text, location_text text, opponent_name text,
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
           l.name, l.address, e.location_text, o.name, e.home_away, e.arrive_early_minutes, e.revision,
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

-- Calendar feed tokens ------------------------------------------------------------------------
-- The token is two random UUIDs (about 244 bits) joined without dashes; only its SHA-256 is stored.
create function private.new_calendar_feed_token(p_profile_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  insert into public.calendar_feed_tokens (profile_id, token_hash)
  values (p_profile_id, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
  return v_token;
end;
$$;

-- Returns the plaintext token ONCE. One live token per person; use rotate to replace it.
create function public.create_calendar_feed_token()
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_token text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.calendar_feed_tokens t where t.profile_id = v_uid and t.revoked_at is null) then
    raise exception 'token_exists' using errcode = '23505', detail = 'Rotate the existing feed link instead.';
  end if;
  v_token := private.new_calendar_feed_token(v_uid);
  perform private.write_audit('calendar_feed.create', 'calendar_feed_tokens', null, null, null, null, null);
  return v_token;
end;
$$;

create function public.rotate_calendar_feed_token()
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_token text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  update public.calendar_feed_tokens set revoked_at = now() where profile_id = v_uid and revoked_at is null;
  v_token := private.new_calendar_feed_token(v_uid);
  perform private.write_audit('calendar_feed.rotate', 'calendar_feed_tokens', null, null, null, null, null);
  return v_token;
end;
$$;

create function public.revoke_calendar_feed_token()
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  update public.calendar_feed_tokens set revoked_at = now() where profile_id = v_uid and revoked_at is null;
  perform private.write_audit('calendar_feed.revoke', 'calendar_feed_tokens', null, null, null, null, null);
end;
$$;

-- Used only by the feed Edge Function (service role). Returns the owner of a live token and
-- records the use; null for unknown or revoked tokens. Never logs the token.
create function public.resolve_calendar_feed_token(p_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_profile uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  update public.calendar_feed_tokens set last_used_at = now()
    where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and revoked_at is null
    returning profile_id into v_profile;
  return v_profile;
end;
$$;

revoke execute on function private.new_calendar_feed_token(uuid) from public, anon, authenticated;
revoke execute on function
  public.team_schedule(uuid, text, integer, integer), public.household_schedule(text, integer, integer),
  public.next_up(integer), public.create_calendar_feed_token(), public.rotate_calendar_feed_token(),
  public.revoke_calendar_feed_token(), public.resolve_calendar_feed_token(text)
  from public, anon, authenticated;
grant execute on function
  public.team_schedule(uuid, text, integer, integer), public.household_schedule(text, integer, integer),
  public.next_up(integer), public.create_calendar_feed_token(), public.rotate_calendar_feed_token(),
  public.revoke_calendar_feed_token() to authenticated;
grant execute on function public.resolve_calendar_feed_token(text) to service_role;
