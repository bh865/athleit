-- Phase 1A (3/8): club affiliation requests, create_team, find_club
--
-- A team never sets its own club_id. A team admin files a request; an admin of the club
-- approves it, and only decide_club_link (SECURITY DEFINER) writes teams.club_id.

create table public.team_club_link_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  requested_by uuid references public.profiles (id) on delete set null,
  status public.request_status not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index team_club_link_requests_team_id_idx on public.team_club_link_requests (team_id);
create index team_club_link_requests_club_id_idx on public.team_club_link_requests (club_id);
create index team_club_link_requests_requested_by_idx on public.team_club_link_requests (requested_by);
create index team_club_link_requests_decided_by_idx on public.team_club_link_requests (decided_by)
  where decided_by is not null;
create unique index team_club_link_requests_one_pending
  on public.team_club_link_requests (team_id, club_id) where status = 'pending';

alter table public.team_club_link_requests enable row level security;
revoke all on public.team_club_link_requests from anon, authenticated;
grant select on public.team_club_link_requests to authenticated;

create policy "Requester, team admins and club admins read link requests"
  on public.team_club_link_requests for select to authenticated
  using (
    requested_by = (select auth.uid())
    or private.has_team_role(team_id, array['admin']::public.team_role[])
    or private.is_club_admin(club_id));

-- Internal: file a link request on behalf of a team admin (already authorised by the caller).
create function private.file_club_link_request(p_team_id uuid, p_club_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_current uuid;
begin
  select club_id into v_current from public.teams where id = p_team_id;
  if v_current is not null then
    raise exception 'already_affiliated' using detail = 'Unlink the team from its club first.';
  end if;
  if not exists (select 1 from public.clubs where id = p_club_id) then
    raise exception 'club_not_found';
  end if;
  insert into public.team_club_link_requests (team_id, club_id, requested_by)
  values (p_team_id, p_club_id, auth.uid()) returning id into v_id;
  perform private.write_audit('club_link.request', 'team_club_link_requests', v_id, p_team_id, p_club_id,
    null, jsonb_build_object('team_id', p_team_id, 'club_id', p_club_id));
  return v_id;
end;
$$;

create function public.create_team(
  p_name text, p_sport public.sport, p_season_label text, p_club_id uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  insert into public.teams (name, sport, season_label, created_by)
  values (btrim(p_name), p_sport, btrim(p_season_label), v_uid) returning id into v_id;
  insert into public.team_memberships (team_id, profile_id, role) values (v_id, v_uid, 'admin');
  perform private.write_audit('team.create', 'teams', v_id, v_id, null, null,
    jsonb_build_object('name', btrim(p_name), 'sport', p_sport, 'season_label', btrim(p_season_label)));
  -- Affiliation is only ever a request, never a direct club_id write.
  if p_club_id is not null then
    perform private.file_club_link_request(v_id, p_club_id);
  end if;
  return v_id;
end;
$$;

create function public.request_club_link(p_team_id uuid, p_club_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.has_team_role(p_team_id, array['admin']::public.team_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.file_club_link_request(p_team_id, p_club_id);
end;
$$;

create function public.decide_club_link(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  r public.team_club_link_requests;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into r from public.team_club_link_requests where id = p_request_id for update;
  if not found or not private.is_club_admin(r.club_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'request_not_pending';
  end if;
  if p_approve then
    if exists (select 1 from public.teams where id = r.team_id and club_id is not null) then
      raise exception 'already_affiliated';
    end if;
    update public.teams set club_id = r.club_id where id = r.team_id;
  end if;
  update public.team_club_link_requests
    set status = case when p_approve then 'approved' else 'declined' end::public.request_status,
        decided_by = auth.uid(), decided_at = now()
    where id = r.id;
  perform private.write_audit(
    case when p_approve then 'club_link.approve' else 'club_link.decline' end,
    'team_club_link_requests', r.id, r.team_id, r.club_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', case when p_approve then 'approved' else 'declined' end));
end;
$$;

-- Lets a team admin find the club they want to affiliate with (by its public slug).
create function public.find_club(p_slug text)
returns table (id uuid, name text, slug text)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, c.slug from public.clubs c
  where c.slug = lower(btrim(p_slug)) and (select auth.uid()) is not null;
$$;

revoke execute on function private.file_club_link_request(uuid, uuid) from public, anon, authenticated;
revoke execute on function
  public.create_team(text, public.sport, text, uuid), public.request_club_link(uuid, uuid),
  public.decide_club_link(uuid, boolean), public.find_club(text)
  from public, anon, authenticated;
grant execute on function
  public.create_team(text, public.sport, text, uuid), public.request_club_link(uuid, uuid),
  public.decide_club_link(uuid, boolean), public.find_club(text)
  to authenticated;
