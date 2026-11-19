-- Account deletion guard. Deleting an auth user cascades to the user's own rows (memberships,
-- notification settings, devices, message participation) and nulls the user on records the
-- organisation keeps (payments, waiver acceptances, registrations, messages, documents). Two
-- cases would harm other people, so deletion is blocked until they are resolved:
--   * the user is the only active admin of a team or club (the last-admin triggers would also
--     refuse the cascade), and
--   * the user is the only guardian in a household that has players (the children would be
--     left without a guardian).
-- The function only ever describes the caller's own situation.

create function public.account_deletion_blockers()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name)
      from public.team_memberships m
      join public.teams t on t.id = m.team_id
      where m.profile_id = v_uid and m.role = 'admin' and m.status = 'active'
        and not exists (
          select 1 from public.team_memberships o
          where o.team_id = m.team_id and o.role = 'admin' and o.status = 'active' and o.id <> m.id)
    ), '[]'::jsonb),
    'clubs', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
      from public.club_memberships m
      join public.clubs c on c.id = m.club_id
      where m.profile_id = v_uid and m.role = 'admin' and m.status = 'active'
        and not exists (
          select 1 from public.club_memberships o
          where o.club_id = m.club_id and o.role = 'admin' and o.status = 'active' and o.id <> m.id)
    ), '[]'::jsonb),
    'households', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name) order by h.name)
      from public.household_members hm
      join public.households h on h.id = hm.household_id
      where hm.profile_id = v_uid
        and exists (select 1 from public.players p where p.household_id = h.id)
        and not exists (
          select 1 from public.household_members o
          where o.household_id = hm.household_id and o.profile_id <> v_uid)
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.account_deletion_blockers() from public, anon, authenticated;
grant execute on function public.account_deletion_blockers() to authenticated;
