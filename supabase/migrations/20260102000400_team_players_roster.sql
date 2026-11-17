-- Phase 1A (5/8): the roster, can_see_player, limited roster and guardian-contact functions
--
-- Data minimization for minors:
--  * Staff (and admins of the affiliated club, read-only) read full player rows.
--  * Parents and players never read teammates' rows; they get get_team_roster(), which
--    returns first name, jersey number and position only.
--  * Guardian contact details (email/phone live in auth.users) are returned only by
--    get_guardian_contacts(), to the child's own guardians and to staff of a team the
--    child is actively rostered on. Never to other parents or players, or club admins.

create type public.roster_status as enum ('active', 'inactive');

create table public.team_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  jersey_number smallint constraint team_players_jersey_range check (jersey_number between 0 and 99),
  position text constraint team_players_position_length check (char_length(position) <= 40),
  status public.roster_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, player_id)
);
create index team_players_player_id_idx on public.team_players (player_id);
-- One active player per jersey number per team.
create unique index team_players_active_jersey_unique
  on public.team_players (team_id, jersey_number)
  where status = 'active' and jersey_number is not null;
create trigger team_players_set_updated_at before update on public.team_players
  for each row execute function public.set_updated_at();

-- Helpers --------------------------------------------------------------------
create function private.can_see_player(p_player_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_guardian_of(p_player_id)
    or private.is_player_self(p_player_id)
    or exists (
      select 1 from public.team_players tp
      where tp.player_id = p_player_id and private.can_view_team_roster(tp.team_id));
$$;

-- RLS ------------------------------------------------------------------------
alter table public.team_players enable row level security;
revoke all on public.team_players from anon, authenticated;
grant select, delete on public.team_players to authenticated;
grant update (jersey_number, position, status) on public.team_players to authenticated;

create policy "Staff, club admins, guardians and the player read roster rows" on public.team_players
  for select to authenticated
  using (private.can_view_team_roster(team_id)
         or private.is_guardian_of(player_id) or private.is_player_self(player_id));
create policy "Team staff edit the roster" on public.team_players
  for update to authenticated
  using (private.is_team_staff(team_id)) with check (private.is_team_staff(team_id));
create policy "Team staff remove roster rows" on public.team_players
  for delete to authenticated using (private.is_team_staff(team_id));

-- Staff and club admins can also read the players on their rosters.
create policy "Roster staff read players" on public.players
  for select to authenticated using (private.can_see_player(id));

-- Functions ------------------------------------------------------------------
-- Staff/club admins get the full roster; other members get active players, first name only.
create function public.get_team_roster(p_team_id uuid)
returns table (team_player_id uuid, player_id uuid, first_name text, last_name text,
               jersey_number smallint, "position" text, status public.roster_status)
language sql stable security definer set search_path = ''
as $$
  select tp.id,
         case when private.can_view_team_roster(p_team_id) then tp.player_id end,
         p.first_name,
         case when private.can_view_team_roster(p_team_id) then p.last_name end,
         tp.jersey_number, tp.position, tp.status
  from public.team_players tp
  join public.players p on p.id = tp.player_id
  where tp.team_id = p_team_id
    and (private.can_view_team_roster(p_team_id)
         or (private.is_team_member(p_team_id) and tp.status = 'active'))
  order by tp.jersey_number nulls last, p.first_name;
$$;

create function public.get_guardian_contacts(p_player_id uuid)
returns table (profile_id uuid, display_name text, email text, phone text)
language sql stable security definer set search_path = ''
as $$
  select pr.id, pr.display_name, u.email::text, u.phone::text
  from public.players p
  join public.household_members hm on hm.household_id = p.household_id
  join public.profiles pr on pr.id = hm.profile_id
  join auth.users u on u.id = hm.profile_id
  where p.id = p_player_id
    and (private.is_guardian_of(p_player_id)
         or exists (
           select 1 from public.team_players tp
           where tp.player_id = p_player_id and tp.status = 'active'
             and private.is_team_staff(tp.team_id)))
  order by pr.display_name;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_club_admin(uuid), private.is_club_member(uuid),
  private.is_team_member(uuid), private.has_team_role(uuid, public.team_role[]),
  private.is_team_staff(uuid), private.can_view_team_roster(uuid),
  private.is_household_guardian(uuid), private.is_guardian_of(uuid), private.is_player_self(uuid),
  private.can_see_player(uuid)
  to authenticated;
revoke execute on function public.get_team_roster(uuid), public.get_guardian_contacts(uuid)
  from public, anon, authenticated;
grant execute on function public.get_team_roster(uuid), public.get_guardian_contacts(uuid)
  to authenticated;
