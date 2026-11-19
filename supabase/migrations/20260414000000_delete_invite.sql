-- Delete an invite (any status, revoked ones included). Same authority as revoke_invite: the
-- creator, a team admin, a club admin or a guardian of the household. Deleting an unused invite
-- also kills its link, since only the token hash lived on this row.
create function public.delete_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  i public.invites;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into i from public.invites where id = p_invite_id for update;
  if not found or not (
    i.created_by = auth.uid()
    or (i.team_id is not null and private.has_team_role(i.team_id, array['admin']::public.team_role[]))
    or (i.club_id is not null and private.is_club_admin(i.club_id))
    or (i.household_id is not null and private.is_household_guardian(i.household_id))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.invites where id = i.id;
  perform private.write_audit('invite.delete', 'invites', i.id, i.team_id, i.club_id,
    jsonb_build_object('role', i.role, 'revoked', i.revoked_at is not null, 'use_count', i.use_count), null);
end;
$$;

revoke execute on function public.delete_invite(uuid) from public, anon, authenticated;
grant execute on function public.delete_invite(uuid) to authenticated;
