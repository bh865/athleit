-- Phase 1 Part B read helpers (functions only, no new tables).
--
-- RLS correctly hides requester names, not-yet-linked teams and invite targets from the people
-- who need them to decide, so the UI reads them through these narrowly scoped functions.

-- Staff queue: who is asking to join, and for which child.
create function public.get_join_requests(p_team_id uuid)
returns table (id uuid, requester_id uuid, requester_name text, player_id uuid,
               player_first_name text, player_last_name text, message text,
               status public.request_status, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select jr.id, jr.requester_id, pr.display_name, jr.player_id,
         case when jr.status in ('pending', 'approved') then p.first_name end,
         case when jr.status in ('pending', 'approved') then p.last_name end,
         jr.message, jr.status, jr.created_at
  from public.join_requests jr
  join public.profiles pr on pr.id = jr.requester_id
  left join public.players p on p.id = jr.player_id
  where jr.team_id = p_team_id and private.is_team_staff(p_team_id)
  order by (jr.status = 'pending') desc, jr.created_at desc;
$$;

-- Club affiliation requests, for the team's admins (by team) or the club's admins (by club).
create function public.get_link_requests(p_team_id uuid default null, p_club_id uuid default null)
returns table (id uuid, team_id uuid, team_name text, sport public.sport, season_label text,
               club_id uuid, club_name text, requested_by_name text,
               status public.request_status, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.team_id, t.name, t.sport, t.season_label, r.club_id, c.name, pr.display_name,
         r.status, r.created_at
  from public.team_club_link_requests r
  join public.teams t on t.id = r.team_id
  join public.clubs c on c.id = r.club_id
  left join public.profiles pr on pr.id = r.requested_by
  where (p_team_id is null) <> (p_club_id is null)
    and ((p_team_id is not null and r.team_id = p_team_id
          and private.has_team_role(p_team_id, array['admin']::public.team_role[]))
      or (p_club_id is not null and r.club_id = p_club_id and private.is_club_admin(p_club_id)))
  order by (r.status = 'pending') desc, r.created_at desc;
$$;

-- Pending sign-in claims on the caller's own children.
create function public.get_player_login_claims()
returns table (claim_id uuid, player_id uuid, player_first_name text, player_last_name text,
               claimant_name text, claimant_email text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.player_id, p.first_name, p.last_name, pr.display_name, u.email::text, c.created_at
  from public.player_login_claims c
  join public.players p on p.id = c.player_id
  join public.profiles pr on pr.id = c.profile_id
  join auth.users u on u.id = c.profile_id
  where c.status = 'pending' and private.is_guardian_of(c.player_id)
  order by c.created_at;
$$;

-- What an invite is for, before the invitee accepts it. Never consumes the invite.
create function public.preview_invite(p_token text)
returns table (kind text, target_name text, role text, valid boolean, reason text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  i public.invites;
  v_kind text;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into i from public.invites where token_hash = private.hash_token(coalesce(p_token, ''));
  if not found then
    return query select null::text, null::text, null::text, false, 'invite_invalid'::text;
    return;
  end if;
  if i.team_id is not null then
    v_kind := 'team'; select t.name into v_name from public.teams t where t.id = i.team_id;
  elsif i.club_id is not null then
    v_kind := 'club'; select c.name into v_name from public.clubs c where c.id = i.club_id;
  else
    v_kind := 'household'; select h.name into v_name from public.households h where h.id = i.household_id;
  end if;
  return query select v_kind, v_name, i.role, (i.revoked_at is null and i.expires_at > now() and i.use_count < i.max_uses),
    case when i.revoked_at is not null then 'invite_revoked'
         when i.expires_at <= now() then 'invite_expired'
         when i.use_count >= i.max_uses then 'invite_exhausted' end;
end;
$$;

revoke execute on function
  public.get_join_requests(uuid), public.get_link_requests(uuid, uuid),
  public.get_player_login_claims(), public.preview_invite(text)
  from public, anon, authenticated;
grant execute on function
  public.get_join_requests(uuid), public.get_link_requests(uuid, uuid),
  public.get_player_login_claims(), public.preview_invite(text)
  to authenticated;
