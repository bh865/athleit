-- Phase 1A (7/8): join requests, place_player_on_roster
--
-- A team code (or id) only ever creates a pending request. Access is granted by
-- decide_join_request when team staff approve. Staff can see the child named on a pending
-- or approved request (so they can decide and then roster them) but nothing else.

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  player_id uuid references public.players (id) on delete cascade,
  message text constraint join_requests_message_length check (char_length(message) <= 500),
  status public.request_status not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index join_requests_team_id_idx on public.join_requests (team_id);
create index join_requests_requester_id_idx on public.join_requests (requester_id);
create index join_requests_player_id_idx on public.join_requests (player_id) where player_id is not null;
create index join_requests_decided_by_idx on public.join_requests (decided_by) where decided_by is not null;
create unique index join_requests_one_pending
  on public.join_requests (team_id, requester_id, coalesce(player_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending';

alter table public.join_requests enable row level security;
revoke all on public.join_requests from anon, authenticated;
grant select on public.join_requests to authenticated;

create policy "Requesters and team staff read join requests" on public.join_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or private.is_team_staff(team_id));

-- Staff may also see the player named on a pending/approved request to their team.
create or replace function private.can_see_player(p_player_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_guardian_of(p_player_id)
    or private.is_player_self(p_player_id)
    or exists (
      select 1 from public.team_players tp
      where tp.player_id = p_player_id and private.can_view_team_roster(tp.team_id))
    or exists (
      select 1 from public.join_requests jr
      where jr.player_id = p_player_id and jr.status in ('pending', 'approved')
        and private.is_team_staff(jr.team_id));
$$;

create function public.request_to_join(
  p_team_code text default null, p_team_id uuid default null,
  p_player_id uuid default null, p_message text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_team uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if (p_team_code is null) = (p_team_id is null) then
    raise exception 'invalid_target' using detail = 'Provide exactly one of team code or team id.';
  end if;
  if p_team_code is not null then
    select id into v_team from public.teams where join_code = upper(btrim(p_team_code));
  else
    select id into v_team from public.teams where id = p_team_id;
  end if;
  if v_team is null then
    raise exception 'team_not_found';
  end if;
  if p_player_id is not null
     and not (private.is_guardian_of(p_player_id) or private.is_player_self(p_player_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if private.is_team_member(v_team) and p_player_id is null then
    raise exception 'already_member';
  end if;
  insert into public.join_requests (team_id, requester_id, player_id, message)
  values (v_team, v_uid, p_player_id, nullif(btrim(p_message), '')) returning id into v_id;
  perform private.write_audit('join_request.create', 'join_requests', v_id, v_team, null, null,
    jsonb_build_object('player_id', p_player_id));
  return v_id;
end;
$$;

create function public.decide_join_request(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  r public.join_requests;
  v_role public.team_role;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into r from public.join_requests where id = p_request_id for update;
  if not found or not private.is_team_staff(r.team_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'request_not_pending';
  end if;
  if p_approve then
    -- The requester joins as the player themself (13+, own login) or as a parent.
    v_role := case when exists (
        select 1 from public.players p where p.id = r.player_id and p.profile_id = r.requester_id)
      then 'player' else 'parent' end;
    insert into public.team_memberships (team_id, profile_id, role)
    values (r.team_id, r.requester_id, v_role)
    on conflict on constraint team_memberships_team_id_profile_id_role_key do update set status = 'active'
      where public.team_memberships.status = 'inactive';
  end if;
  update public.join_requests
    set status = case when p_approve then 'approved' else 'declined' end::public.request_status,
        decided_by = auth.uid(), decided_at = now()
    where id = r.id;
  perform private.write_audit(
    case when p_approve then 'join_request.approve' else 'join_request.decline' end,
    'join_requests', r.id, r.team_id, null,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', case when p_approve then 'approved' else 'declined' end));
end;
$$;

-- Staff place a child on the roster. The child must have an approved join request to this
-- team (or already be on its roster, in which case this updates the row).
create function public.place_player_on_roster(
  p_team_id uuid, p_player_id uuid, p_jersey_number smallint default null,
  p_position text default null, p_status public.roster_status default 'active')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.is_team_staff(p_team_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
       select 1 from public.join_requests jr
       where jr.team_id = p_team_id and jr.player_id = p_player_id and jr.status = 'approved')
     and not exists (
       select 1 from public.team_players tp where tp.team_id = p_team_id and tp.player_id = p_player_id) then
    raise exception 'player_not_eligible'
      using detail = 'The player needs an approved join request for this team.';
  end if;
  insert into public.team_players (team_id, player_id, jersey_number, position, status)
  values (p_team_id, p_player_id, p_jersey_number, nullif(btrim(p_position), ''), p_status)
  on conflict (team_id, player_id) do update
    set jersey_number = excluded.jersey_number, position = excluded.position, status = excluded.status
  returning id into v_id;
  perform private.write_audit('roster.place', 'team_players', v_id, p_team_id, null, null,
    jsonb_build_object('player_id', p_player_id, 'jersey_number', p_jersey_number, 'status', p_status));
  return v_id;
end;
$$;

revoke execute on function private.can_see_player(uuid) from public, anon, authenticated;
grant execute on function private.can_see_player(uuid) to authenticated;
revoke execute on function
  public.request_to_join(text, uuid, uuid, text), public.decide_join_request(uuid, boolean),
  public.place_player_on_roster(uuid, uuid, smallint, text, public.roster_status)
  from public, anon, authenticated;
grant execute on function
  public.request_to_join(text, uuid, uuid, text), public.decide_join_request(uuid, boolean),
  public.place_player_on_roster(uuid, uuid, smallint, text, public.roster_status)
  to authenticated;
