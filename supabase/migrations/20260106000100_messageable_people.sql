-- Who the caller may start a conversation with (names only, no contact details).
-- Staff: any other active member of the team. Everyone else: the team's staff, and (for a
-- player with a login) their own guardians. Parents never get a list of other families.
create function public.get_messageable_people(p_team_id uuid)
returns table (profile_id uuid, display_name text, role public.team_role, is_minor boolean)
language sql stable security definer set search_path = ''
as $$
  select distinct on (tm.profile_id) tm.profile_id, pr.display_name, tm.role, private.is_minor(tm.profile_id)
  from public.team_memberships tm
  join public.profiles pr on pr.id = tm.profile_id
  where tm.team_id = p_team_id and tm.status = 'active'
    and private.is_member_of(p_team_id, (select auth.uid()))
    and tm.profile_id <> (select auth.uid())
    and (
      private.is_staff_of(p_team_id, (select auth.uid()))
      or tm.role in ('admin', 'coach', 'manager')
      or private.is_guardian_of_profile(tm.profile_id, (select auth.uid()))
    )
  order by tm.profile_id, tm.role;
$$;
revoke execute on function public.get_messageable_people(uuid) from public, anon, authenticated;
grant execute on function public.get_messageable_people(uuid) to authenticated;
