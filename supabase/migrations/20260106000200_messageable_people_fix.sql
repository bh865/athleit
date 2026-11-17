-- Fix: a guardian can also message their own player (the relation works in both directions).
create or replace function public.get_messageable_people(p_team_id uuid)
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
      or private.is_guardian_of_profile((select auth.uid()), tm.profile_id)
    )
  order by tm.profile_id, tm.role;
$$;
