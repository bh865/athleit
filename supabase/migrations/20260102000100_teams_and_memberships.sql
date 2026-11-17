-- Phase 1A (2/8): teams and team memberships
--
-- Teams are created through create_team (a later migration) so the creator becomes admin
-- atomically. Clients can never write teams.club_id: affiliation is a request a club admin
-- approves (team_club_link_requests).

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint teams_name_length check (char_length(btrim(name)) between 1 and 100),
  sport public.sport not null,
  season_label text not null
    constraint teams_season_label_length check (char_length(btrim(season_label)) between 1 and 40),
  club_id uuid references public.clubs (id) on delete set null,
  -- Shared with families so they can ask to join. A code only ever creates a join request.
  join_code text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index teams_club_id_idx on public.teams (club_id) where club_id is not null;
create index teams_created_by_idx on public.teams (created_by);
create trigger teams_set_updated_at before update on public.teams
  for each row execute function public.set_updated_at();

create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.team_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, profile_id, role)
);
create index team_memberships_profile_id_idx on public.team_memberships (profile_id);
create trigger team_memberships_set_updated_at before update on public.team_memberships
  for each row execute function public.set_updated_at();

-- Helpers --------------------------------------------------------------------
create function private.is_team_member(p_team_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_memberships tm
    where tm.team_id = p_team_id and tm.profile_id = (select auth.uid()) and tm.status = 'active');
$$;

create function private.has_team_role(p_team_id uuid, p_roles public.team_role[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_memberships tm
    where tm.team_id = p_team_id and tm.profile_id = (select auth.uid())
      and tm.status = 'active' and tm.role = any (p_roles));
$$;

-- Staff = admin, coach or manager.
create function private.is_team_staff(p_team_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.has_team_role(p_team_id, array['admin', 'coach', 'manager']::public.team_role[]);
$$;

-- Staff, or an admin of the club the team is affiliated with (read-only visibility).
create function private.can_view_team_roster(p_team_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_team_staff(p_team_id)
    or exists (
      select 1 from public.teams t
      where t.id = p_team_id and t.club_id is not null and private.is_club_admin(t.club_id));
$$;

-- Audit ----------------------------------------------------------------------
create trigger team_memberships_audit
  after insert or update or delete on public.team_memberships
  for each row execute function private.audit_membership();

create function private.audit_team_affiliation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.club_id is distinct from old.club_id then
    perform private.write_audit('team.affiliation_change', 'teams', new.id, new.id,
      coalesce(new.club_id, old.club_id),
      jsonb_build_object('club_id', old.club_id), jsonb_build_object('club_id', new.club_id));
  end if;
  return null;
end;
$$;
create trigger teams_audit_affiliation
  after update of club_id on public.teams
  for each row execute function private.audit_team_affiliation();

-- The last active admin of a team cannot be removed or demoted.
create function private.protect_last_team_admin()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active') then
    if exists (select 1 from public.teams t where t.id = old.team_id) then
      perform pg_advisory_xact_lock(hashtextextended('team:' || old.team_id::text, 0));
      if not exists (
        select 1 from public.team_memberships m
        where m.team_id = old.team_id and m.role = 'admin' and m.status = 'active' and m.id <> old.id) then
        raise exception 'last_admin' using detail = 'A team must keep at least one active admin.';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger team_memberships_protect_last_admin
  before update or delete on public.team_memberships
  for each row execute function private.protect_last_team_admin();

-- RLS ------------------------------------------------------------------------
alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;

revoke all on public.teams, public.team_memberships from anon, authenticated;
grant select on public.teams, public.team_memberships to authenticated;
grant update (name, sport, season_label) on public.teams to authenticated;
grant update (role, status) on public.team_memberships to authenticated;
grant delete on public.team_memberships to authenticated;

-- Members read their team; admins of the affiliated club read it too (read-only).
create policy "Members and affiliated club admins can read a team" on public.teams
  for select to authenticated
  using (private.is_team_member(id) or (club_id is not null and private.is_club_admin(club_id)));
create policy "Team admins can edit team details" on public.teams
  for update to authenticated
  using (private.has_team_role(id, array['admin']::public.team_role[]))
  with check (private.has_team_role(id, array['admin']::public.team_role[]));

create policy "Read own memberships; staff read their team's memberships" on public.team_memberships
  for select to authenticated
  using (profile_id = (select auth.uid()) or private.is_team_staff(team_id));
create policy "Team admins change roles and status" on public.team_memberships
  for update to authenticated
  using (private.has_team_role(team_id, array['admin']::public.team_role[]))
  with check (true); -- only role/status are grantable
create policy "Team admins remove members; members can leave" on public.team_memberships
  for delete to authenticated
  using (profile_id = (select auth.uid())
         or private.has_team_role(team_id, array['admin']::public.team_role[]));

create policy "Team admins read their team's audit trail" on public.audit_log
  for select to authenticated
  using (team_id is not null and private.has_team_role(team_id, array['admin']::public.team_role[]));

-- Functions ------------------------------------------------------------------
-- Staff-only member list with display names (profiles are own-row only under RLS).
create function public.get_team_members(p_team_id uuid)
returns table (membership_id uuid, profile_id uuid, display_name text, role public.team_role,
               status public.membership_status)
language sql stable security definer set search_path = ''
as $$
  select tm.id, tm.profile_id, pr.display_name, tm.role, tm.status
  from public.team_memberships tm
  join public.profiles pr on pr.id = tm.profile_id
  where tm.team_id = p_team_id and private.is_team_staff(p_team_id)
  order by tm.created_at;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_club_admin(uuid), private.is_club_member(uuid),
  private.is_team_member(uuid), private.has_team_role(uuid, public.team_role[]),
  private.is_team_staff(uuid), private.can_view_team_roster(uuid)
  to authenticated;
revoke execute on function public.get_team_members(uuid) from public, anon, authenticated;
grant execute on function public.get_team_members(uuid) to authenticated;
