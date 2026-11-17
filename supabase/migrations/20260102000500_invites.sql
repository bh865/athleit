-- Phase 1A (6/8): invites
--
-- Staff (and club admins/managers) are added by invite link only. The raw token is returned
-- once by create_invite and never stored: only its SHA-256 hash is. accept_invite validates
-- expiry, revocation and remaining uses, then creates the membership.

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete cascade,
  club_id uuid references public.clubs (id) on delete cascade,
  role text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  max_uses integer not null default 1 constraint invites_max_uses_range check (max_uses between 1 and 1000),
  use_count integer not null default 0 constraint invites_use_count_nonneg check (use_count >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invites_exactly_one_target check ((team_id is null) <> (club_id is null)),
  constraint invites_role_matches_target check (
    (team_id is not null and role in ('admin', 'coach', 'manager', 'parent', 'player'))
    or (club_id is not null and role in ('admin', 'manager'))),
  constraint invites_use_count_within_max check (use_count <= max_uses)
);
create index invites_team_id_idx on public.invites (team_id) where team_id is not null;
create index invites_club_id_idx on public.invites (club_id) where club_id is not null;
create index invites_created_by_idx on public.invites (created_by);

alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;
grant select on public.invites to authenticated;

create policy "Creators and the target's admins read invites" on public.invites
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or (team_id is not null and private.has_team_role(team_id, array['admin']::public.team_role[]))
    or (club_id is not null and private.is_club_admin(club_id)));

create function private.hash_token(p_token text)
returns text language sql immutable set search_path = ''
as $$ select encode(sha256(convert_to(p_token, 'utf8')), 'hex'); $$;

-- Returns the one-time token. Only team admins may mint staff invites; any staff may invite
-- parents/players; only club admins may invite to a club.
create function public.create_invite(
  p_team_id uuid, p_club_id uuid, p_role text,
  p_expires_in interval default interval '7 days', p_max_uses integer default 1)
returns table (invite_id uuid, token text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if (p_team_id is null) = (p_club_id is null) then
    raise exception 'invalid_target' using detail = 'Provide exactly one of team or club.';
  end if;
  if p_expires_in <= interval '0' or p_expires_in > interval '90 days' then
    raise exception 'invalid_expiry' using detail = 'Expiry must be between 0 and 90 days.';
  end if;
  if p_team_id is not null then
    if p_role in ('admin', 'coach', 'manager') then
      if not private.has_team_role(p_team_id, array['admin']::public.team_role[]) then
        raise exception 'forbidden' using errcode = '42501';
      end if;
    elsif not private.is_team_staff(p_team_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif not private.is_club_admin(p_club_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.invites (team_id, club_id, role, token_hash, expires_at, max_uses, created_by)
  values (p_team_id, p_club_id, p_role, private.hash_token(v_token), now() + p_expires_in, p_max_uses, v_uid)
  returning id into v_id;
  perform private.write_audit('invite.create', 'invites', v_id, p_team_id, p_club_id, null,
    jsonb_build_object('role', p_role, 'max_uses', p_max_uses, 'expires_at', now() + p_expires_in));
  return query select v_id, v_token;
end;
$$;

create function public.accept_invite(p_token text)
returns table (team_id uuid, club_id uuid, role text)
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
  else
    insert into public.club_memberships (club_id, profile_id, role)
    values (i.club_id, v_uid, i.role::public.club_role)
    on conflict on constraint club_memberships_club_id_profile_id_role_key do update set status = 'active'
      where public.club_memberships.status = 'inactive';
  end if;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then raise exception 'already_member'; end if;

  update public.invites set use_count = use_count + 1 where id = i.id;
  perform private.write_audit('invite.accept', 'invites', i.id, i.team_id, i.club_id, null,
    jsonb_build_object('role', i.role, 'profile_id', v_uid));
  return query select i.team_id, i.club_id, i.role;
end;
$$;

create function public.revoke_invite(p_invite_id uuid)
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
    or (i.club_id is not null and private.is_club_admin(i.club_id))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.invites set revoked_at = coalesce(revoked_at, now()) where id = i.id;
  perform private.write_audit('invite.revoke', 'invites', i.id, i.team_id, i.club_id, null, null);
end;
$$;

revoke execute on function private.hash_token(text) from public, anon, authenticated;
revoke execute on function
  public.create_invite(uuid, uuid, text, interval, integer), public.accept_invite(text),
  public.revoke_invite(uuid) from public, anon, authenticated;
grant execute on function
  public.create_invite(uuid, uuid, text, interval, integer), public.accept_invite(text),
  public.revoke_invite(uuid) to authenticated;
