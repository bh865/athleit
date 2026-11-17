-- Phase 2 (1/9): scheduling reference data: sport_configs, locations, opponents, and the
-- schedule visibility helper.
--
-- Visibility rule for everything schedule-related (private.can_view_team_schedule):
--   * team staff (admin / coach / manager), or
--   * a guardian of, or the login of, an ACTIVELY rostered player on the team, or
--   * an admin of the club the team is affiliated with (read-only).
-- Membership is derived, never stored on the event. A parent who holds a team role but has no
-- child on the roster does not see the schedule.

-- Helpers --------------------------------------------------------------------
create function private.can_view_team_schedule(p_team_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_team_staff(p_team_id)
    or exists (
      select 1
      from public.team_players tp
      join public.players p on p.id = tp.player_id
      where tp.team_id = p_team_id and tp.status = 'active'
        and (p.profile_id = (select auth.uid())
             or exists (
               select 1 from public.household_members hm
               where hm.household_id = p.household_id
                 and hm.profile_id = (select auth.uid()) and hm.relationship = 'guardian')))
    or exists (
      select 1 from public.teams t
      where t.id = p_team_id and t.club_id is not null and private.is_club_admin(t.club_id));
$$;

-- sport_configs ----------------------------------------------------------------
create table public.sport_configs (
  sport public.sport primary key,
  period_type text not null
    constraint sport_configs_period_type_check check (period_type in ('half', 'quarter', 'period', 'inning', 'set')),
  default_period_count smallint not null
    constraint sport_configs_period_count_check check (default_period_count between 1 and 12),
  -- null for innings and sets (not timed)
  default_period_minutes smallint
    constraint sport_configs_period_minutes_check check (default_period_minutes between 1 and 120),
  ties_allowed boolean not null,
  positions text[] not null default '{}',
  scoring_label text not null constraint sport_configs_scoring_label_length check (char_length(scoring_label) between 1 and 30),
  constraint sport_configs_untimed_periods check (
    (period_type in ('inning', 'set')) = (default_period_minutes is null))
);

-- Youth defaults; every value is documented (and flagged where leagues differ) in
-- docs/sport-configs.md. Teams override the period count and length per game via
-- events.game_format.
insert into public.sport_configs
  (sport, period_type, default_period_count, default_period_minutes, ties_allowed, positions, scoring_label) values
  ('soccer',     'half',    2, 30,   true,  array['GK', 'DEF', 'MID', 'FWD'],                              'Goals'),
  ('basketball', 'quarter', 4, 8,    false, array['PG', 'SG', 'SF', 'PF', 'C'],                            'Points'),
  ('volleyball', 'set',     3, null, false, array['OH', 'MB', 'OPP', 'S', 'L', 'DS'],                      'Sets won'),
  ('football',   'quarter', 4, 12,   true,  array['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K'],    'Points'),
  ('baseball',   'inning',  6, null, true,  array['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'],     'Runs'),
  ('softball',   'inning',  7, null, true,  array['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'],     'Runs'),
  ('hockey',     'period',  3, 15,   true,  array['G', 'D', 'C', 'LW', 'RW'],                              'Goals');

-- locations ----------------------------------------------------------------------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null constraint locations_name_length check (char_length(btrim(name)) between 1 and 100),
  address text constraint locations_address_length check (char_length(address) <= 300),
  notes text constraint locations_notes_length check (char_length(notes) <= 500),
  lat double precision constraint locations_lat_range check (lat between -90 and 90),
  lng double precision constraint locations_lng_range check (lng between -180 and 180),
  constraint locations_lat_lng_pair check ((lat is null) = (lng is null)),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index locations_team_id_idx on public.locations (team_id);
create index locations_created_by_idx on public.locations (created_by);
create trigger locations_set_updated_at before update on public.locations
  for each row execute function public.set_updated_at();

-- opponents ----------------------------------------------------------------------
create table public.opponents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null constraint opponents_name_length check (char_length(btrim(name)) between 1 and 100),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, name)
);
create index opponents_created_by_idx on public.opponents (created_by);
create trigger opponents_set_updated_at before update on public.opponents
  for each row execute function public.set_updated_at();

-- RLS ------------------------------------------------------------------------
alter table public.sport_configs enable row level security;
alter table public.locations enable row level security;
alter table public.opponents enable row level security;

revoke all on public.sport_configs, public.locations, public.opponents from anon, authenticated;
grant select on public.sport_configs to authenticated;
grant select, delete on public.locations, public.opponents to authenticated;
grant insert (team_id, name, address, notes, lat, lng) on public.locations to authenticated;
grant update (name, address, notes, lat, lng) on public.locations to authenticated;
grant insert (team_id, name) on public.opponents to authenticated;
grant update (name) on public.opponents to authenticated;

create policy "Signed-in users read sport configs" on public.sport_configs
  for select to authenticated using (true);

-- Everyone who can see the team's schedule can read its saved locations and opponents;
-- staff manage them.
create policy "Schedule viewers read locations" on public.locations
  for select to authenticated using (private.can_view_team_schedule(team_id));
create policy "Staff add locations" on public.locations
  for insert to authenticated with check (private.is_team_staff(team_id));
create policy "Staff edit locations" on public.locations
  for update to authenticated
  using (private.is_team_staff(team_id)) with check (private.is_team_staff(team_id));
create policy "Staff delete locations" on public.locations
  for delete to authenticated using (private.is_team_staff(team_id));

create policy "Schedule viewers read opponents" on public.opponents
  for select to authenticated using (private.can_view_team_schedule(team_id));
create policy "Staff add opponents" on public.opponents
  for insert to authenticated with check (private.is_team_staff(team_id));
create policy "Staff edit opponents" on public.opponents
  for update to authenticated
  using (private.is_team_staff(team_id)) with check (private.is_team_staff(team_id));
create policy "Staff delete opponents" on public.opponents
  for delete to authenticated using (private.is_team_staff(team_id));

revoke execute on function private.can_view_team_schedule(uuid) from public, anon, authenticated;
grant execute on function private.can_view_team_schedule(uuid) to authenticated;
