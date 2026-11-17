-- Phase 1A gap fixes: second guardian (household invites), unlink a team from a club,
-- rotate a team's join code.

-- Household invites: a guardian invites another guardian into the household. -------------
alter table public.invites
  add column household_id uuid references public.households (id) on delete cascade;
create index invites_household_id_idx on public.invites (household_id) where household_id is not null;

alter table public.invites drop constraint invites_exactly_one_target;
alter table public.invites drop constraint invites_role_matches_target;
alter table public.invites add constraint invites_exactly_one_target check (
  (team_id is not null)::int + (club_id is not null)::int + (household_id is not null)::int = 1);
alter table public.invites add constraint invites_role_matches_target check (
  (team_id is not null and role in ('admin', 'coach', 'manager', 'parent', 'player'))
  or (club_id is not null and role in ('admin', 'manager'))
  or (household_id is not null and role = 'guardian'));

drop policy "Creators and the target's admins read invites" on public.invites;
create policy "Creators and the target's admins read invites" on public.invites
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or (team_id is not null and private.has_team_role(team_id, array['admin']::public.team_role[]))
    or (club_id is not null and private.is_club_admin(club_id))
    or (household_id is not null and private.is_household_guardian(household_id)));

create function public.create_household_invite(
  p_household_id uuid, p_expires_in interval default interval '7 days', p_max_uses integer default 1)
returns table (invite_id uuid, token text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_token text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.is_household_guardian(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_expires_in <= interval '0' or p_expires_in > interval '90 days' then
    raise exception 'invalid_expiry' using detail = 'Expiry must be between 0 and 90 days.';
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.invites (household_id, role, token_hash, expires_at, max_uses, created_by)
  values (p_household_id, 'guardian', private.hash_token(v_token), now() + p_expires_in, p_max_uses, auth.uid())
  returning id into v_id;
  perform private.write_audit('invite.create', 'invites', v_id, null, null, null,
    jsonb_build_object('role', 'guardian', 'household_id', p_household_id, 'max_uses', p_max_uses));
  return query select v_id, v_token;
end;
$$;

-- accept_invite now also handles household invites (new return column household_id).
drop function public.accept_invite(text);
create function public.accept_invite(p_token text)
returns table (team_id uuid, club_id uuid, household_id uuid, role text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  i public.invites;
  v_inserted integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into i from public.invites where token_hash = private.hash_token(coalesce(p_token, '')) for update;
  if not found then raise exception 'invite_invalid'; end if;
  if i.revoked_at is not null then raise exception 'invite_revoked'; end if;
  if i.expires_at <= now() then raise exception 'invite_expired'; end if;
  if i.use_count >= i.max_uses then raise exception 'invite_exhausted'; end if;

  if i.team_id is not null then
    insert into public.team_memberships (team_id, profile_id, role)
    values (i.team_id, v_uid, i.role::public.team_role)
    on conflict on constraint team_memberships_team_id_profile_id_role_key do update set status = 'active'
      where public.team_memberships.status = 'inactive';
  elsif i.club_id is not null then
    insert into public.club_memberships (club_id, profile_id, role)
    values (i.club_id, v_uid, i.role::public.club_role)
    on conflict on constraint club_memberships_club_id_profile_id_role_key do update set status = 'active'
      where public.club_memberships.status = 'inactive';
  else
    insert into public.household_members (household_id, profile_id)
    values (i.household_id, v_uid)
    on conflict on constraint household_members_pkey do nothing;
  end if;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then raise exception 'already_member'; end if;

  update public.invites set use_count = use_count + 1 where id = i.id;
  perform private.write_audit('invite.accept', 'invites', i.id, i.team_id, i.club_id, null,
    jsonb_build_object('role', i.role, 'profile_id', v_uid, 'household_id', i.household_id));
  return query select i.team_id, i.club_id, i.household_id, i.role;
end;
$$;

create or replace function public.revoke_invite(p_invite_id uuid)
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
  update public.invites set revoked_at = coalesce(revoked_at, now()) where id = i.id;
  perform private.write_audit('invite.revoke', 'invites', i.id, i.team_id, i.club_id, null, null);
end;
$$;

-- Unlink / rotate -------------------------------------------------------------------
-- Either side can end an affiliation: a team admin or an admin of the team's club.
create function public.unlink_team_from_club(p_team_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_club uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select club_id into v_club from public.teams where id = p_team_id for update;
  if not found
     or not (private.has_team_role(p_team_id, array['admin']::public.team_role[])
             or (v_club is not null and private.is_club_admin(v_club))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_club is null then raise exception 'not_affiliated'; end if;
  update public.teams set club_id = null where id = p_team_id; -- audited by trigger
end;
$$;

create function public.rotate_team_join_code(p_team_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.has_team_role(p_team_id, array['admin']::public.team_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.teams set join_code = v_code where id = p_team_id;
  perform private.write_audit('team.rotate_join_code', 'teams', p_team_id, p_team_id, null, null, null);
  return v_code;
end;
$$;

revoke execute on function
  public.create_household_invite(uuid, interval, integer), public.accept_invite(text),
  public.revoke_invite(uuid), public.unlink_team_from_club(uuid), public.rotate_team_join_code(uuid)
  from public, anon, authenticated;
grant execute on function
  public.create_household_invite(uuid, interval, integer), public.accept_invite(text),
  public.revoke_invite(uuid), public.unlink_team_from_club(uuid), public.rotate_team_join_code(uuid)
  to authenticated;
