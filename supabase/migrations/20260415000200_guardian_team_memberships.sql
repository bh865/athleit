-- A guardian of a rostered child is a parent on that child's team.
--
-- Before this, only the person whose join request was approved got a team membership. A second
-- guardian who joined the household (family code) could read the child's roster row through RLS but
-- had no team context: no Roster, Schedule or Messages, and the team name was hidden by the teams
-- policy, so the child showed as "Not on a team yet". Memberships stay the single source of team
-- access; this only creates the missing `parent` rows. Existing rows (any status) are left alone, so
-- a staff member who deactivated a parent is not overridden.

create function private.add_guardian_parent_memberships()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'team_players' then
    insert into public.team_memberships (team_id, profile_id, role)
    select new.team_id, hm.profile_id, 'parent'::public.team_role
    from public.players p
    join public.household_members hm on hm.household_id = p.household_id
    where p.id = new.player_id and hm.relationship = 'guardian'
    on conflict (team_id, profile_id, role) do nothing;
  else -- household_members: a new guardian joins a household whose children are already rostered
    if new.relationship = 'guardian' then
      insert into public.team_memberships (team_id, profile_id, role)
      select distinct tp.team_id, new.profile_id, 'parent'::public.team_role
      from public.players p
      join public.team_players tp on tp.player_id = p.id
      where p.household_id = new.household_id
      on conflict (team_id, profile_id, role) do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.add_guardian_parent_memberships() from public, anon, authenticated;

create trigger team_players_guardian_memberships after insert on public.team_players
  for each row execute function private.add_guardian_parent_memberships();
create trigger household_members_guardian_memberships after insert on public.household_members
  for each row execute function private.add_guardian_parent_memberships();

-- Backfill: guardians of children already on a roster.
insert into public.team_memberships (team_id, profile_id, role)
select distinct tp.team_id, hm.profile_id, 'parent'::public.team_role
from public.team_players tp
join public.players p on p.id = tp.player_id
join public.household_members hm on hm.household_id = p.household_id
where hm.relationship = 'guardian'
on conflict (team_id, profile_id, role) do nothing;
