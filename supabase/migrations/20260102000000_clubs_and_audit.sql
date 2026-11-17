-- Phase 1A (1/8): clubs, club memberships, audit log, create_club
--
-- Conventions for all Phase 1A migrations:
--  * Policy helpers live in the `private` schema (not exposed through the API),
--    are SECURITY DEFINER with a pinned search_path, and read membership rows
--    directly, so a policy never recurses into the table it protects.
--  * Client-callable functions live in `public`, are SECURITY DEFINER, check
--    auth.uid() themselves, and are executable only by `authenticated`.
--  * Tables grant `authenticated` only what the policies need; `anon` gets nothing.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.sport as enum
  ('soccer', 'basketball', 'volleyball', 'football', 'baseball', 'softball', 'hockey');
create type public.club_role as enum ('admin', 'manager');
create type public.team_role as enum ('admin', 'coach', 'manager', 'parent', 'player');
create type public.membership_status as enum ('active', 'inactive');
create type public.request_status as enum ('pending', 'approved', 'declined');

-- clubs --------------------------------------------------------------------
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint clubs_name_length check (char_length(btrim(name)) between 1 and 100),
  slug text not null unique
    constraint clubs_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 50),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clubs_created_by_idx on public.clubs (created_by);
create trigger clubs_set_updated_at before update on public.clubs
  for each row execute function public.set_updated_at();

create table public.club_memberships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.club_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, profile_id, role)
);
create index club_memberships_profile_id_idx on public.club_memberships (profile_id);
create trigger club_memberships_set_updated_at before update on public.club_memberships
  for each row execute function public.set_updated_at();

-- audit_log: written only by triggers / private.write_audit; no FKs on purpose so
-- history survives deletion of the thing it describes.
create table public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  target_type text not null,
  target_id uuid,
  team_id uuid,
  club_id uuid,
  before jsonb,
  after jsonb
);
create index audit_log_team_id_idx on public.audit_log (team_id) where team_id is not null;
create index audit_log_club_id_idx on public.audit_log (club_id) where club_id is not null;

-- Helpers --------------------------------------------------------------------
create function private.is_club_admin(p_club_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.club_memberships cm
    where cm.club_id = p_club_id and cm.profile_id = (select auth.uid())
      and cm.role = 'admin' and cm.status = 'active');
$$;

create function private.is_club_member(p_club_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.club_memberships cm
    where cm.club_id = p_club_id and cm.profile_id = (select auth.uid())
      and cm.status = 'active');
$$;

create function private.write_audit(
  p_action text, p_target_type text, p_target_id uuid,
  p_team_id uuid, p_club_id uuid, p_before jsonb, p_after jsonb)
returns void language sql security definer set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, team_id, club_id, before, after)
  values ((select auth.uid()), p_action, p_target_type, p_target_id, p_team_id, p_club_id, p_before, p_after);
$$;

-- Generic membership audit trigger (club_memberships here, team_memberships later).
create function private.audit_membership()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  perform private.write_audit(
    tg_table_name || '.' || lower(tg_op), tg_table_name, (v_row ->> 'id')::uuid,
    (v_row ->> 'team_id')::uuid, (v_row ->> 'club_id')::uuid, v_old, v_new);
  return null;
end;
$$;

create trigger club_memberships_audit
  after insert or update or delete on public.club_memberships
  for each row execute function private.audit_membership();

-- The last active admin of a club cannot be removed or demoted.
create function private.protect_last_club_admin()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active') then
    -- A cascading delete of the club itself is allowed.
    if exists (select 1 from public.clubs c where c.id = old.club_id) then
      perform pg_advisory_xact_lock(hashtextextended('club:' || old.club_id::text, 0));
      if not exists (
        select 1 from public.club_memberships m
        where m.club_id = old.club_id and m.role = 'admin' and m.status = 'active' and m.id <> old.id) then
        raise exception 'last_admin' using detail = 'A club must keep at least one active admin.';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger club_memberships_protect_last_admin
  before update or delete on public.club_memberships
  for each row execute function private.protect_last_club_admin();

-- RLS ------------------------------------------------------------------------
alter table public.clubs enable row level security;
alter table public.club_memberships enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.clubs, public.club_memberships, public.audit_log from anon, authenticated;
grant select on public.clubs, public.club_memberships, public.audit_log to authenticated;
grant update (name) on public.clubs to authenticated;
grant update (role, status) on public.club_memberships to authenticated;
grant delete on public.club_memberships to authenticated;

create policy "Club members can read their club" on public.clubs
  for select to authenticated using (private.is_club_member(id));
create policy "Club admins can rename their club" on public.clubs
  for update to authenticated
  using (private.is_club_admin(id)) with check (private.is_club_admin(id));

create policy "Read own club memberships; admins read all in their club" on public.club_memberships
  for select to authenticated
  using (profile_id = (select auth.uid()) or private.is_club_admin(club_id));
create policy "Club admins change roles and status" on public.club_memberships
  for update to authenticated
  using (private.is_club_admin(club_id)) with check (true); -- only role/status are grantable
create policy "Club admins remove members; members can leave" on public.club_memberships
  for delete to authenticated
  using (profile_id = (select auth.uid()) or private.is_club_admin(club_id));

create policy "Club admins read their club's audit trail" on public.audit_log
  for select to authenticated
  using (club_id is not null and private.is_club_admin(club_id));

-- Functions ------------------------------------------------------------------
create function public.create_club(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  insert into public.clubs (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), v_uid) returning id into v_id;
  insert into public.club_memberships (club_id, profile_id, role) values (v_id, v_uid, 'admin');
  perform private.write_audit('club.create', 'clubs', v_id, null, v_id, null,
    jsonb_build_object('name', btrim(p_name), 'slug', lower(btrim(p_slug))));
  return v_id;
end;
$$;

-- Function privileges: nothing for public/anon; only what is listed for authenticated.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_club_admin(uuid), private.is_club_member(uuid) to authenticated;
revoke execute on function public.create_club(text, text) from public, anon, authenticated;
grant execute on function public.create_club(text, text) to authenticated;
