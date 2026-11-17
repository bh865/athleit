-- Phase 1A (4/8): households, household members, players, add_child
--
-- A parent can add a child without joining any team: add_child creates the household on
-- the first child. Children under 13 never get a login: players.profile_id may only be set
-- when the player is 13 or older (trigger, so it holds for every writer).

create type public.household_relationship as enum ('guardian');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint households_name_length check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger households_set_updated_at before update on public.households
  for each row execute function public.set_updated_at();

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  relationship public.household_relationship not null default 'guardian',
  created_at timestamptz not null default now(),
  primary key (household_id, profile_id)
);
create index household_members_profile_id_idx on public.household_members (profile_id);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  first_name text not null constraint players_first_name_length check (char_length(btrim(first_name)) between 1 and 60),
  last_name text not null constraint players_last_name_length check (char_length(btrim(last_name)) between 1 and 60),
  date_of_birth date not null,
  -- Only for players 13+; set by claim_player_login / decide_player_login_claim, never by clients.
  profile_id uuid unique references public.profiles (id) on delete set null,
  photo_path text constraint players_photo_path_length check (char_length(photo_path) <= 300),
  -- Guardian-provided email the player must sign in with to claim their own login.
  login_invite_email text constraint players_login_invite_email_length check (char_length(login_invite_email) <= 254),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index players_household_id_idx on public.players (household_id);
create trigger players_set_updated_at before update on public.players
  for each row execute function public.set_updated_at();

create function private.enforce_player_rules()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.date_of_birth > current_date or new.date_of_birth < date '1900-01-01' then
    raise exception 'invalid_date_of_birth' using errcode = '23514';
  end if;
  if new.profile_id is not null
     and new.date_of_birth > (current_date - interval '13 years')::date then
    raise exception 'player_under_13'
      using errcode = '23514', detail = 'Players under 13 cannot have their own login.';
  end if;
  return new;
end;
$$;
create trigger players_enforce_rules
  before insert or update of date_of_birth, profile_id on public.players
  for each row execute function private.enforce_player_rules();

-- Helpers --------------------------------------------------------------------
create function private.is_household_guardian(p_household_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = p_household_id and hm.profile_id = (select auth.uid())
      and hm.relationship = 'guardian');
$$;

create function private.is_guardian_of(p_player_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.players p
    join public.household_members hm on hm.household_id = p.household_id
    where p.id = p_player_id and hm.profile_id = (select auth.uid()) and hm.relationship = 'guardian');
$$;

create function private.is_player_self(p_player_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.players p where p.id = p_player_id and p.profile_id = (select auth.uid()));
$$;

-- A team role of 'player' is only valid for a profile linked to a (13+) player row.
create function private.enforce_player_role()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.role = 'player' and not exists (
    select 1 from public.players p where p.profile_id = new.profile_id) then
    raise exception 'player_role_requires_linked_player'
      using errcode = '23514', detail = 'Only a player with their own login can hold the player role.';
  end if;
  return new;
end;
$$;
create trigger team_memberships_enforce_player_role
  before insert or update of role, profile_id on public.team_memberships
  for each row execute function private.enforce_player_role();

-- RLS ------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.players enable row level security;

revoke all on public.households, public.household_members, public.players from anon, authenticated;
grant select on public.households, public.household_members, public.players to authenticated;
grant update (name) on public.households to authenticated;
grant update (first_name, last_name, date_of_birth, photo_path, login_invite_email)
  on public.players to authenticated;

create policy "Guardians read their household" on public.households
  for select to authenticated using (private.is_household_guardian(id));
create policy "Guardians edit their household" on public.households
  for update to authenticated
  using (private.is_household_guardian(id)) with check (private.is_household_guardian(id));

create policy "Guardians read their household's members" on public.household_members
  for select to authenticated
  using (profile_id = (select auth.uid()) or private.is_household_guardian(household_id));

-- Family access only here; staff access is added with the roster (can_see_player).
create policy "Guardians and the player themself read the player" on public.players
  for select to authenticated
  using (private.is_guardian_of(id) or profile_id = (select auth.uid()));
create policy "Guardians edit their children" on public.players
  for update to authenticated
  using (private.is_guardian_of(id)) with check (private.is_guardian_of(id));

-- Functions ------------------------------------------------------------------
create function public.add_child(
  p_household_id uuid, p_first_name text, p_last_name text, p_date_of_birth date)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid := p_household_id;
  v_player uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_household is not null then
    if not private.is_household_guardian(v_household) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    -- No household given: reuse the caller's (oldest) one, or create it on the first child.
    select hm.household_id into v_household
    from public.household_members hm
    where hm.profile_id = v_uid and hm.relationship = 'guardian'
    order by hm.created_at limit 1;
    if v_household is null then
      select display_name into v_name from public.profiles where id = v_uid;
      insert into public.households (name)
      values (left(coalesce(v_name, 'My') || ' family', 100)) returning id into v_household;
      insert into public.household_members (household_id, profile_id) values (v_household, v_uid);
      perform private.write_audit('household.create', 'households', v_household, null, null, null,
        jsonb_build_object('name', left(coalesce(v_name, 'My') || ' family', 100)));
    end if;
  end if;
  insert into public.players (household_id, first_name, last_name, date_of_birth)
  values (v_household, btrim(p_first_name), btrim(p_last_name), p_date_of_birth)
  returning id into v_player;
  perform private.write_audit('player.add_child', 'players', v_player, null, null, null,
    jsonb_build_object('household_id', v_household));
  return v_player;
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_club_admin(uuid), private.is_club_member(uuid),
  private.is_team_member(uuid), private.has_team_role(uuid, public.team_role[]),
  private.is_team_staff(uuid), private.can_view_team_roster(uuid),
  private.is_household_guardian(uuid), private.is_guardian_of(uuid), private.is_player_self(uuid)
  to authenticated;
revoke execute on function public.add_child(uuid, text, text, date) from public, anon, authenticated;
grant execute on function public.add_child(uuid, text, text, date) to authenticated;
