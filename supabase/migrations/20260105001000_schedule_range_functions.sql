-- Phase 2 (Part B): date-range variants of the schedule read helpers, for the week and month views.
-- Same columns and the same visibility rules as team_schedule / household_schedule; events that
-- overlap [p_from, p_to) are returned, soonest first, capped at 500 rows (a month is far below it).

create function public.team_schedule_range(p_team_id uuid, p_from timestamptz, p_to timestamptz)
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
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_to <= p_from or p_to - p_from > interval '100 days' then
    raise exception 'invalid_range' using errcode = '23514';
  end if;
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
      and e.starts_at < p_to and e.ends_at >= p_from
    order by e.starts_at
    limit 500;
end;
$$;

create function public.household_schedule_range(p_from timestamptz, p_to timestamptz)
returns table (
  event_id uuid, team_id uuid, team_name text, type text, title text, starts_at timestamptz, ends_at timestamptz,
  timezone text, location_name text, location_address text, location_text text, opponent_name text,
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
      and e.starts_at < p_to and e.ends_at >= p_from
    order by e.starts_at, p.first_name
    limit 500;
end;
$$;

-- One event for the detail screen / deep link (null when the caller cannot see it).
create function public.get_event(p_event_id uuid)
returns table (
  id uuid, team_id uuid, team_name text, sport public.sport, type text, title text,
  starts_at timestamptz, ends_at timestamptz, timezone text,
  location_id uuid, location_name text, location_address text, location_text text,
  opponent_id uuid, opponent_name text, home_away text, notes text, arrive_early_minutes smallint,
  status text, cancelled_reason text, series_id uuid, game_format jsonb, revision integer,
  is_staff boolean, our_score smallint, their_score smallint, outcome text, period_scores jsonb, result_notes text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    select e.id, e.team_id, t.name, t.sport, e.type, e.title, e.starts_at, e.ends_at, e.timezone,
           e.location_id, l.name, l.address, e.location_text, e.opponent_id, o.name, e.home_away, e.notes,
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

revoke execute on function
  public.team_schedule_range(uuid, timestamptz, timestamptz), public.household_schedule_range(timestamptz, timestamptz),
  public.get_event(uuid) from public, anon, authenticated;
grant execute on function
  public.team_schedule_range(uuid, timestamptz, timestamptz), public.household_schedule_range(timestamptz, timestamptz),
  public.get_event(uuid) to authenticated;
