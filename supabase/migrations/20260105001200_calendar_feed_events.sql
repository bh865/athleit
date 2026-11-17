-- Phase 2 (Part C): the rows behind a person's calendar feed.
--
-- Called ONLY by the calendar-feed Edge Function (service role) after it has resolved a secret
-- token to a profile. Returns events from every team the person is on: teams where they are staff,
-- and teams where a child they are guardian of (or they themselves, 13+) is ACTIVELY rostered. A
-- window of 30 days back to 365 days ahead, at most 2000 rows. No RSVP data, no names.

create function public.calendar_feed_events(p_profile_id uuid)
returns table (
  id uuid, team_name text, type text, title text, starts_at timestamptz, ends_at timestamptz, timezone text,
  location_name text, location_address text, location_text text, opponent_name text, home_away text,
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
  select e.id, t.name, e.type, e.title, e.starts_at, e.ends_at, e.timezone, l.name, l.address, e.location_text,
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

revoke execute on function public.calendar_feed_events(uuid) from public, anon, authenticated;
grant execute on function public.calendar_feed_events(uuid) to service_role;
