-- Phase 5 (A5): fix a NULL-logic hole in place_registered_player
--
-- `not (a = b or c = d or ...)` evaluated to NULL (so no error) for a team-issued event whose target_team_id is
-- null, letting staff of an unrelated team place a registrant on their own roster. Each comparison is now
-- coalesced to false. Found by fn_place_registered_player.test.sql. Behaviour is otherwise unchanged.

create or replace function public.place_registered_player(
  p_registration_id uuid, p_team_id uuid, p_jersey_number smallint default null, p_position text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  r public.registrations; e public.registration_events; v_player uuid; v_household uuid; v_roster uuid;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.is_team_staff(p_team_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.registrations where id = p_registration_id for update;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.registration_events where id = r.registration_event_id;
  -- The destination must be the issuing team, the event's target team, or a team of the issuing club.
  if not (coalesce(e.team_id = p_team_id, false) or coalesce(e.target_team_id = p_team_id, false)
          or (e.club_id is not null and exists (select 1 from public.teams t where t.id = p_team_id and t.club_id = e.club_id))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if e.roster_behavior <> 'propose_placement' then raise exception 'placement_disabled' using errcode = '23514'; end if;
  if r.status not in ('accepted', 'placed') then raise exception 'not_accepted' using errcode = '23514'; end if;
  if r.submitted_by is null then raise exception 'registrant_unclaimed' using errcode = '23514'; end if;

  v_player := r.player_id; v_household := r.household_id;
  if v_player is null then
    if v_household is null then
      -- Use the submitter's only household, or create one (as add_child does).
      select hm.household_id into v_household from public.household_members hm
        where hm.profile_id = r.submitted_by and hm.relationship = 'guardian'
        group by hm.household_id having (select count(*) from public.household_members x where x.profile_id = r.submitted_by) = 1 limit 1;
      if v_household is null then
        insert into public.households (name) values (left(r.guardian_name, 90) || ' household') returning id into v_household;
        insert into public.household_members (household_id, profile_id) values (v_household, r.submitted_by);
      end if;
    end if;
    select p.id into v_player from public.players p
      where p.household_id = v_household and lower(p.first_name) = lower(r.player_first_name)
        and lower(p.last_name) = lower(r.player_last_name) and p.date_of_birth = r.player_date_of_birth limit 1;
    if v_player is null then
      insert into public.players (household_id, first_name, last_name, date_of_birth)
      values (v_household, r.player_first_name, r.player_last_name, r.player_date_of_birth) returning id into v_player;
    end if;
    update public.registrations set player_id = v_player, household_id = v_household where id = p_registration_id;
  end if;

  if not exists (select 1 from public.join_requests jr where jr.team_id = p_team_id and jr.player_id = v_player and jr.status = 'approved') then
    insert into public.join_requests (team_id, requester_id, player_id, status, decided_by, decided_at, message)
    values (p_team_id, r.submitted_by, v_player, 'approved', (select auth.uid()), now(), 'Placed from registration ' || r.display_id);
  end if;
  v_roster := public.place_player_on_roster(p_team_id, v_player, p_jersey_number, p_position);
  if r.status = 'accepted' then
    update public.registrations set status = 'placed' where id = p_registration_id;
  end if;
  perform private.write_audit('registration.place', 'registrations', p_registration_id, p_team_id, null,
    jsonb_build_object('status', r.status), jsonb_build_object('status', 'placed', 'player_id', v_player));
  return v_player;
end;
$$;
