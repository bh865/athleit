-- Phase 5 (A4): registration functions
--
-- Everything here is SECURITY DEFINER with a pinned search_path, checks auth.uid() itself and audits.
-- Public/anonymous access is limited to get_public_registration (explicit public-safe fields only).
-- svc_* functions are for Edge Functions (service role) and are not executable by clients.
--
-- Concurrency: every function that changes capacity first locks the registration_events row
-- (SELECT ... FOR UPDATE), so two simultaneous submissions or decisions for the last spot are
-- serialized and exactly one wins.

-- Internal helpers ------------------------------------------------------------------------------------------
-- Does this registration currently hold a spot (so that moving it does not double count)?
create function private.registration_holds_spot(r public.registrations, e public.registration_events)
returns boolean language sql stable set search_path = ''
as $$
  select r.status in ('accepted', 'placed')
      or (r.status = 'submitted' and e.payment_timing = 'at_submission' and (r.hold_expires_at is null or r.hold_expires_at > now()));
$$;

-- Status a verified, signed-in or confirmed registration enters with. Caller holds the event lock.
create function private.entry_status(e public.registration_events)
returns text language plpgsql stable security definer set search_path = ''
as $$
begin
  if e.capacity is null then return 'submitted'; end if;
  if private.registration_taken(e.id) >= e.capacity
     or (e.waitlist_enabled and exists (select 1 from public.registrations w
                                         where w.registration_event_id = e.id and w.status = 'waitlisted')) then
    if e.waitlist_enabled then return 'waitlisted'; end if;
    raise exception 'registration_full' using errcode = '23514';
  end if;
  return 'submitted';
end;
$$;

create function private.next_waitlist_position(p_event_id uuid)
returns integer language sql stable security definer set search_path = ''
as $$ select coalesce(max(waitlist_position), 0) + 1 from public.registrations where registration_event_id = p_event_id; $$;

-- Coarse availability label: never an exact count of registrants.
create function private.spots_label(p_capacity integer, p_taken integer, p_waitlist boolean)
returns text language sql immutable set search_path = ''
as $$
  select case when p_capacity is null then 'open'
              when p_taken >= p_capacity then case when p_waitlist then 'waitlist' else 'full' end
              when p_capacity - p_taken <= greatest(3, p_capacity / 10) then 'few'
              else 'open' end;
$$;

-- Offer free spots to the first waitlisted registrations, in order. Caller holds the event lock.
-- Returns the ids accepted. Used when auto_promote_waitlist is on (and by promote_from_waitlist with p_max = 1).
create function private.promote_waitlist(p_event_id uuid, p_max integer)
returns uuid[] language plpgsql security definer set search_path = ''
as $$
declare e public.registration_events; r public.registrations; v_out uuid[] := '{}';
begin
  select * into e from public.registration_events where id = p_event_id;
  while coalesce(cardinality(v_out), 0) < p_max
        and (e.capacity is null or private.registration_taken(p_event_id) < e.capacity) loop
    select * into r from public.registrations
      where registration_event_id = p_event_id and status = 'waitlisted'
      order by waitlist_position limit 1 for update;
    exit when not found;
    update public.registrations set status = 'accepted', decided_at = now() where id = r.id;
    v_out := v_out || r.id;
    perform private.write_audit('registration.promote', 'registrations', r.id, e.team_id, e.club_id,
      jsonb_build_object('status', 'waitlisted'), jsonb_build_object('status', 'accepted', 'auto', p_max > 1));
  end loop;
  return v_out;
end;
$$;

-- Split submitted answers: ordinary answers must name non-sensitive fields of the form, sensitive answers
-- sensitive ones. Anything else is rejected (hidden-field smuggling).
create function private.check_answer_keys(p_schema jsonb, p_answers jsonb, p_sensitive jsonb)
returns void language plpgsql immutable set search_path = ''
as $$
declare k text;
begin
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_sensitive, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_answers' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(coalesce(p_answers, '{}'::jsonb)) loop
    if not exists (select 1 from jsonb_array_elements(p_schema -> 'fields') f
                   where f ->> 'id' = k and coalesce((f ->> 'sensitive')::boolean, false) = false) then
      raise exception 'unknown_answer' using errcode = '22023', detail = left(k, 40);
    end if;
  end loop;
  for k in select jsonb_object_keys(coalesce(p_sensitive, '{}'::jsonb)) loop
    if not exists (select 1 from jsonb_array_elements(p_schema -> 'fields') f
                   where f ->> 'id' = k and coalesce((f ->> 'sensitive')::boolean, false) = true) then
      raise exception 'unknown_answer' using errcode = '22023', detail = left(k, 40);
    end if;
  end loop;
end;
$$;

-- Service-role writes (Edge Functions) --------------------------------------------------------------------------
-- The ONLY way a registration row is created. Anonymous submitters have p_submitted_by = null and start as
-- pending_verification; signed-in guardians start submitted (or waitlisted when full).
create function public.svc_create_registration(
  p_event_id uuid, p_form_version_id uuid, p_guardian_name text, p_guardian_email text, p_guardian_phone text,
  p_guardian_relationship text, p_player_first_name text, p_player_last_name text, p_player_date_of_birth date,
  p_player_id uuid, p_submitted_by uuid, p_answers jsonb, p_sensitive jsonb)
returns table (id uuid, display_id text, status text)
language plpgsql security definer set search_path = ''
as $$
declare
  e public.registration_events; v_schema jsonb; v_first text := p_player_first_name; v_last text := p_player_last_name;
  v_dob date := p_player_date_of_birth; v_household uuid; v_status text; v_pos integer; v_hold timestamptz;
  v_id uuid; v_display text; v_player public.players;
begin
  select * into e from public.registration_events where registration_events.id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if e.status <> 'open' then raise exception 'registration_closed' using errcode = '23514'; end if;
  if e.opens_at is not null and now() < e.opens_at then raise exception 'not_open_yet' using errcode = '23514'; end if;
  if e.closes_at is not null and now() > e.closes_at then raise exception 'registration_closed' using errcode = '23514'; end if;
  if e.form_version_id is distinct from p_form_version_id then raise exception 'form_version_mismatch' using errcode = '23514'; end if;
  if e.price_cents is not null and e.payment_timing = 'at_submission' and p_submitted_by is null then
    raise exception 'account_required' using errcode = '23514';
  end if;
  if p_submitted_by is not null and not exists (select 1 from public.profiles pr where pr.id = p_submitted_by) then
    raise exception 'submitter_not_found' using errcode = 'P0002';
  end if;

  if p_player_id is not null then
    select * into v_player from public.players where players.id = p_player_id;
    if not found or p_submitted_by is null or not exists (
         select 1 from public.household_members hm
         where hm.household_id = v_player.household_id and hm.profile_id = p_submitted_by and hm.relationship = 'guardian') then
      raise exception 'player_not_yours' using errcode = '42501';
    end if;
    v_first := v_player.first_name; v_last := v_player.last_name; v_dob := v_player.date_of_birth; v_household := v_player.household_id;
  end if;
  if not private.is_eligible(e.eligibility, v_dob, e.starts_on) then raise exception 'not_eligible' using errcode = '23514'; end if;

  select v.schema into v_schema from public.form_versions v where v.id = p_form_version_id;
  perform private.check_answer_keys(v_schema, p_answers, p_sensitive);

  if p_submitted_by is null then
    v_status := 'pending_verification';
  else
    v_status := private.entry_status(e);
  end if;
  if v_status = 'waitlisted' then v_pos := private.next_waitlist_position(p_event_id); end if;
  if v_status = 'submitted' and e.payment_timing = 'at_submission' then
    v_hold := now() + make_interval(mins => e.payment_hold_minutes);
  end if;

  insert into public.registrations (registration_event_id, display_id, submitted_by, guardian_name, guardian_email, guardian_phone,
    guardian_relationship, player_first_name, player_last_name, player_date_of_birth, player_id, household_id, status,
    form_version_id, answers, waitlist_position, hold_expires_at, verified_at)
  values (p_event_id, private.next_registration_display_id(), p_submitted_by, btrim(p_guardian_name), p_guardian_email,
    nullif(btrim(p_guardian_phone), ''), btrim(p_guardian_relationship), btrim(v_first), btrim(v_last), v_dob, p_player_id,
    v_household, v_status, p_form_version_id, coalesce(p_answers, '{}'::jsonb), v_pos, v_hold,
    case when p_submitted_by is not null then now() end)
  returning registrations.id, registrations.display_id into v_id, v_display;

  if p_sensitive is not null and p_sensitive <> '{}'::jsonb then
    insert into public.registration_sensitive_answers (registration_id, answers) values (v_id, p_sensitive);
  end if;
  -- Ids and status only: no names, emails or answers in the audit trail.
  perform private.write_audit('registration.submit', 'registrations', v_id, e.team_id, e.club_id, null,
    jsonb_build_object('event_id', p_event_id, 'status', v_status, 'signed_in', p_submitted_by is not null));
  return query select v_id, v_display, v_status;
end;
$$;

-- Email confirmed (magic link) -> the registration now counts: submitted, or waitlisted when full.
create function public.svc_verify_registration(p_registration_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare r public.registrations; e public.registration_events; v_status text;
begin
  select registration_event_id into r.registration_event_id from public.registrations where id = p_registration_id;
  if not found then raise exception 'registration_not_found' using errcode = 'P0002'; end if;
  select * into e from public.registration_events where id = r.registration_event_id for update;
  select * into r from public.registrations where id = p_registration_id for update;
  if r.status <> 'pending_verification' then return r.status; end if; -- idempotent
  if e.status <> 'open' or (e.closes_at is not null and now() > e.closes_at) then
    raise exception 'registration_closed' using errcode = '23514';
  end if;
  v_status := private.entry_status(e);
  update public.registrations set status = v_status, verified_at = now(),
    waitlist_position = case when v_status = 'waitlisted' then private.next_waitlist_position(e.id) end
  where id = p_registration_id;
  perform private.write_audit('registration.verify', 'registrations', p_registration_id, e.team_id, e.club_id, null,
    jsonb_build_object('status', v_status));
  return v_status;
end;
$$;

-- Staff decisions ------------------------------------------------------------------------------------------------------
create function public.decide_registration(p_registration_id uuid, p_decision text, p_message text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r public.registrations; e public.registration_events; v_from text; v_taken integer; v_promoted uuid[] := '{}'; v_spot_freed boolean;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_decision not in ('accept', 'waitlist', 'decline') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  select registration_event_id into r.registration_event_id from public.registrations where id = p_registration_id;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.registration_events where id = r.registration_event_id for update;
  if not private.is_issuer_manager(e.team_id, e.club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.registrations where id = p_registration_id for update;
  v_from := r.status;
  if v_from = 'pending_verification' then raise exception 'unverified' using errcode = '23514'; end if;
  if v_from = 'placed' then raise exception 'already_placed' using errcode = '23514'; end if;
  if v_from in ('declined', 'withdrawn') then raise exception 'invalid_status_transition' using errcode = '23514'; end if;
  v_spot_freed := private.registration_holds_spot(r, e);

  if p_decision = 'accept' then
    if v_from = 'accepted' then raise exception 'invalid_status_transition' using errcode = '23514'; end if;
    v_taken := private.registration_taken(e.id) - case when v_spot_freed then 1 else 0 end;
    if e.capacity is not null and v_taken >= e.capacity then raise exception 'capacity_full' using errcode = '23514'; end if;
    update public.registrations set status = 'accepted', hold_expires_at = null, decided_by = (select auth.uid()), decided_at = now(),
      decision_note = nullif(btrim(p_message), '') where id = p_registration_id;
  elsif p_decision = 'waitlist' then
    if not e.waitlist_enabled then raise exception 'waitlist_disabled' using errcode = '23514'; end if;
    if v_from <> 'submitted' then raise exception 'invalid_status_transition' using errcode = '23514'; end if;
    update public.registrations set status = 'waitlisted', waitlist_position = coalesce(waitlist_position, private.next_waitlist_position(e.id)),
      decided_by = (select auth.uid()), decided_at = now(), decision_note = nullif(btrim(p_message), '') where id = p_registration_id;
  else
    update public.registrations set status = 'declined', hold_expires_at = null, decided_by = (select auth.uid()), decided_at = now(),
      decision_note = nullif(btrim(p_message), '') where id = p_registration_id;
    if v_spot_freed and e.auto_promote_waitlist then v_promoted := private.promote_waitlist(e.id, 1000); end if;
  end if;
  perform private.write_audit('registration.decide', 'registrations', p_registration_id, e.team_id, e.club_id,
    jsonb_build_object('status', v_from),
    jsonb_build_object('decision', p_decision, 'promoted', cardinality(v_promoted)));
  return jsonb_build_object('status', (select status from public.registrations where id = p_registration_id), 'promoted', to_jsonb(v_promoted));
end;
$$;

-- A family withdraws their own registration; a manager may withdraw any (including a placed one).
create function public.withdraw_registration(p_registration_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r public.registrations; e public.registration_events; v_freed boolean; v_promoted uuid[] := '{}'; v_mgr boolean;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select registration_event_id into r.registration_event_id from public.registrations where id = p_registration_id;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.registration_events where id = r.registration_event_id for update;
  v_mgr := private.is_issuer_manager(e.team_id, e.club_id);
  if not (v_mgr or private.is_registration_family(p_registration_id)) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.registrations where id = p_registration_id for update;
  if r.status in ('declined', 'withdrawn') or (r.status = 'placed' and not v_mgr) then
    raise exception 'invalid_status_transition' using errcode = '23514';
  end if;
  v_freed := private.registration_holds_spot(r, e);
  update public.registrations set status = 'withdrawn', hold_expires_at = null where id = p_registration_id;
  if v_freed and e.auto_promote_waitlist then v_promoted := private.promote_waitlist(e.id, 1000); end if;
  perform private.write_audit('registration.withdraw', 'registrations', p_registration_id, e.team_id, e.club_id,
    jsonb_build_object('status', r.status), jsonb_build_object('by', case when v_mgr then 'staff' else 'family' end, 'promoted', cardinality(v_promoted)));
  return jsonb_build_object('status', 'withdrawn', 'promoted', to_jsonb(v_promoted));
end;
$$;

-- Staff-confirmed promotion: accept the first waitlisted registration if a spot is free. Returns its id or null.
create function public.promote_from_waitlist(p_event_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare e public.registration_events; v_ids uuid[];
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.registration_events where id = p_event_id for update;
  if not found or not private.is_issuer_manager(e.team_id, e.club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_ids := private.promote_waitlist(p_event_id, 1);
  update public.registrations set decided_by = (select auth.uid()) where id = any (v_ids);
  return v_ids[1];
end;
$$;

-- Placement: accepted does NOT mean placed. A staff member of the destination team places the player,
-- which creates (or links) the player row and calls the existing place_player_on_roster.
create function public.place_registered_player(
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
  if not (e.team_id = p_team_id or e.target_team_id = p_team_id
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

-- Reads ---------------------------------------------------------------------------------------------------------------
-- Everything about one registration EXCEPT sensitive answers. Families get no staff notes.
create function public.get_registration_detail(p_registration_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare r public.registrations; e public.registration_events; v_staff boolean; v_schema jsonb;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.can_view_registration(p_registration_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.registrations where id = p_registration_id;
  select * into e from public.registration_events where id = r.registration_event_id;
  v_staff := private.is_issuer_staff(e.team_id, e.club_id);
  select schema into v_schema from public.form_versions where id = r.form_version_id;
  return jsonb_build_object(
    'registration', jsonb_build_object(
      'id', r.id, 'display_id', r.display_id, 'status', r.status, 'guardian_name', r.guardian_name,
      'guardian_email', r.guardian_email, 'guardian_phone', r.guardian_phone, 'guardian_relationship', r.guardian_relationship,
      'player_first_name', r.player_first_name, 'player_last_name', r.player_last_name, 'player_date_of_birth', r.player_date_of_birth,
      'player_id', r.player_id, 'answers', r.answers, 'decision_note', r.decision_note, 'decided_at', r.decided_at,
      'waitlist_position', r.waitlist_position, 'payment_request_id', r.payment_request_id, 'submitted_at', r.submitted_at,
      'hold_expires_at', r.hold_expires_at),
    'event', jsonb_build_object('id', e.id, 'title', e.title, 'slug', e.slug, 'kind', e.kind, 'price_cents', e.price_cents,
      'payment_timing', e.payment_timing, 'confirmation_message', e.confirmation_message, 'status', e.status),
    'form_schema', v_schema,
    'waivers', coalesce((
      select jsonb_agg(jsonb_build_object('waiver_version_id', v.id, 'title', v.title, 'acceptance_id', a.id,
                                          'accepted_at', a.accepted_at, 'has_copy', a.signed_copy_path is not null)
                       order by v.title)
      from unnest(e.waiver_version_ids) wv(id)
      join public.waiver_versions v on v.id = wv.id
      left join public.waiver_acceptances a on a.registration_id = r.id and a.waiver_version_id = v.id), '[]'::jsonb),
    'notes', case when v_staff then coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'created_at', n.created_at, 'author_name', pr.display_name)
                       order by n.created_at)
      from public.registration_notes n left join public.profiles pr on pr.id = n.author_id
      where n.registration_id = r.id), '[]'::jsonb) end,
    'has_sensitive', exists (select 1 from public.registration_sensitive_answers s where s.registration_id = r.id),
    'can_read_sensitive', private.is_registration_family(r.id) or (v_staff and private.can_read_sensitive(e.team_id, e.club_id)),
    'is_staff', v_staff,
    'can_decide', private.is_issuer_manager(e.team_id, e.club_id));
end;
$$;

-- The ONLY way to read sensitive answers. Allowed for the registrant's own family and for staff holding the
-- sensitive_answers capability (issuer admins by default). Writes an audit row on every read.
create function public.get_sensitive_answers(p_registration_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare r public.registrations; e public.registration_events; v_family boolean; v_answers jsonb;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into r from public.registrations where id = p_registration_id;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.registration_events where id = r.registration_event_id;
  v_family := private.is_registration_family(p_registration_id);
  if not (v_family or (private.is_issuer_staff(e.team_id, e.club_id) and private.can_read_sensitive(e.team_id, e.club_id))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select s.answers into v_answers from public.registration_sensitive_answers s where s.registration_id = p_registration_id;
  perform private.write_audit('registration.sensitive_read', 'registrations', p_registration_id, e.team_id, e.club_id, null,
    jsonb_build_object('viewer', case when v_family then 'family' else 'staff' end, 'had_answers', v_answers is not null));
  return coalesce(v_answers, '{}'::jsonb);
end;
$$;

create function public.list_registrations(
  p_event_id uuid, p_status text[] default null, p_search text default null, p_unpaid boolean default null,
  p_missing_waivers boolean default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, display_id text, status text, guardian_name text, guardian_email text, player_first_name text,
               player_last_name text, player_date_of_birth date, waitlist_position integer, waitlist_rank bigint,
               payment_request_id uuid, payment_status text, waivers_signed integer, waivers_required integer,
               submitted_at timestamptz, decided_at timestamptz, total_count bigint)
language sql stable security definer set search_path = ''
as $$
  with ev as (select e.* from public.registration_events e where e.id = p_event_id and private.is_issuer_staff(e.team_id, e.club_id)
                and (select auth.uid()) is not null),
  base as (
    select r.*, pq.status as pay_status,
      (select count(*)::int from public.waiver_acceptances a where a.registration_id = r.id
         and a.waiver_version_id = any (ev.waiver_version_ids)) as signed,
      cardinality(ev.waiver_version_ids) as required,
      case when r.status = 'waitlisted' then rank() over (partition by r.status order by r.waitlist_position) end as rnk
    from public.registrations r
    join ev on ev.id = r.registration_event_id
    left join public.payment_requests pq on pq.id = r.payment_request_id)
  select b.id, b.display_id, b.status, b.guardian_name, b.guardian_email, b.player_first_name, b.player_last_name,
         b.player_date_of_birth, b.waitlist_position, b.rnk, b.payment_request_id, b.pay_status, b.signed, b.required,
         b.submitted_at, b.decided_at, count(*) over ()
  from base b
  where (p_status is null or b.status = any (p_status))
    and (p_search is null or p_search = ''
         or position(lower(p_search) in lower(b.display_id || ' ' || b.guardian_name || ' ' || b.guardian_email || ' '
                                                || b.player_first_name || ' ' || b.player_last_name)) > 0)
    and (p_unpaid is null or (p_unpaid = (b.pay_status in ('unpaid', 'processing'))))
    and (p_missing_waivers is null or (p_missing_waivers = (b.signed < b.required)))
  order by b.submitted_at desc, b.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Aggregates only. Issuer staff, and the club admin of a team-issued event's club (aggregates, never rows).
create function public.registration_capacity_summary(p_event_id uuid)
returns table (capacity integer, taken integer, spots_left integer, waitlist_enabled boolean, pending_verification integer,
               submitted integer, waitlisted integer, accepted integer, placed integer, declined integer, withdrawn integer)
language sql stable security definer set search_path = ''
as $$
  select e.capacity, private.registration_taken(e.id),
         case when e.capacity is null then null else greatest(e.capacity - private.registration_taken(e.id), 0) end,
         e.waitlist_enabled,
         count(*) filter (where r.status = 'pending_verification')::int, count(*) filter (where r.status = 'submitted')::int,
         count(*) filter (where r.status = 'waitlisted')::int, count(*) filter (where r.status = 'accepted')::int,
         count(*) filter (where r.status = 'placed')::int, count(*) filter (where r.status = 'declined')::int,
         count(*) filter (where r.status = 'withdrawn')::int
  from public.registration_events e
  left join public.registrations r on r.registration_event_id = e.id
  where e.id = p_event_id and (select auth.uid()) is not null
    and (private.is_issuer_staff(e.team_id, e.club_id)
         or (e.team_id is not null and exists (select 1 from public.teams t where t.id = e.team_id and t.club_id is not null
                                              and private.is_club_admin(t.club_id))))
  group by e.id;
$$;

create function public.add_registration_note(p_registration_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare e public.registration_events; v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select ev.* into e from public.registrations r join public.registration_events ev on ev.id = r.registration_event_id where r.id = p_registration_id;
  if not found or not private.is_issuer_staff(e.team_id, e.club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.registration_notes (registration_id, author_id, body) values (p_registration_id, (select auth.uid()), btrim(p_body))
  returning id into v_id;
  perform private.write_audit('registration.note', 'registrations', p_registration_id, e.team_id, e.club_id, null, null);
  return v_id;
end;
$$;

-- Export rows for CSV. Ordinary answers always; sensitive answers only when asked for AND the caller holds the
-- capability (asking without it is refused, never silently downgraded). Every call is audited. The Edge Function
-- turns this into CSV and neutralizes leading = + - @ in cells.
create function public.export_registrations(p_event_id uuid, p_include_sensitive boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare e public.registration_events; v_rows jsonb; v_schema jsonb; v_sens boolean := coalesce(p_include_sensitive, false);
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.registration_events where id = p_event_id;
  if not found or not private.is_issuer_staff(e.team_id, e.club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_sens and not private.can_read_sensitive(e.team_id, e.club_id) then raise exception 'sensitive_forbidden' using errcode = '42501'; end if;
  select v.schema into v_schema from public.form_versions v where v.id = e.form_version_id;
  select coalesce(jsonb_agg(
      jsonb_build_object('display_id', r.display_id, 'status', r.status, 'submitted_at', r.submitted_at,
        'guardian_name', r.guardian_name, 'guardian_email', r.guardian_email, 'guardian_phone', r.guardian_phone,
        'guardian_relationship', r.guardian_relationship, 'player_first_name', r.player_first_name,
        'player_last_name', r.player_last_name, 'player_date_of_birth', r.player_date_of_birth, 'answers', r.answers)
      || case when v_sens then jsonb_build_object('sensitive_answers', coalesce(s.answers, '{}'::jsonb)) else '{}'::jsonb end
      order by r.submitted_at, r.id), '[]'::jsonb)
  into v_rows
  from (select * from public.registrations where registration_event_id = p_event_id order by submitted_at limit 10000) r
  left join public.registration_sensitive_answers s on v_sens and s.registration_id = r.id;
  perform private.write_audit('registration.export', 'registration_events', p_event_id, e.team_id, e.club_id, null,
    jsonb_build_object('rows', jsonb_array_length(v_rows), 'sensitive', v_sens));
  return jsonb_build_object('fields', (select coalesce(jsonb_agg(f - 'help' - 'validation' - 'show_if' - 'options'), '[]'::jsonb)
                                       from jsonb_array_elements(coalesce(v_schema -> 'fields', '[]'::jsonb)) f
                                       where v_sens or coalesce((f ->> 'sensitive')::boolean, false) = false),
                            'rows', v_rows, 'include_sensitive', v_sens);
end;
$$;

-- A signed-in person's own registrations (as submitter or household guardian) with the next step.
create function public.list_my_registrations()
returns table (id uuid, display_id text, status text, event_title text, event_slug text, player_first_name text,
               price_cents integer, payment_timing text, payment_request_id uuid, waivers_signed integer,
               waivers_required integer, next_step text, submitted_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.display_id, r.status, e.title, e.slug, r.player_first_name, e.price_cents, e.payment_timing, r.payment_request_id,
         s.signed, cardinality(e.waiver_version_ids),
         case when r.status in ('declined', 'withdrawn') then 'none'
              when r.status = 'pending_verification' then 'verify'
              when s.signed < cardinality(e.waiver_version_ids) then 'sign'
              when pq.status in ('unpaid', 'processing') then 'pay'
              else 'none' end,
         r.submitted_at
  from public.registrations r
  join public.registration_events e on e.id = r.registration_event_id
  left join public.payment_requests pq on pq.id = r.payment_request_id
  cross join lateral (select count(*)::int as signed from public.waiver_acceptances a
                      where a.registration_id = r.id and a.waiver_version_id = any (e.waiver_version_ids)) s
  where (select auth.uid()) is not null
    and (r.submitted_by = (select auth.uid()) or (r.household_id is not null and private.is_household_guardian(r.household_id)))
  order by r.submitted_at desc;
$$;

-- Open events for the teams and clubs the caller belongs to (member, or family of a rostered player).
create function public.list_open_registration_events()
returns table (slug text, title text, kind text, issuer_name text, starts_on date, closes_at timestamptz, price_cents integer, spots text)
language sql stable security definer set search_path = ''
as $$
  select e.slug, e.title, e.kind, coalesce(t.name, c.name), e.starts_on, e.closes_at, e.price_cents,
         private.spots_label(e.capacity, private.registration_taken(e.id), e.waitlist_enabled)
  from public.registration_events e
  left join public.teams t on t.id = e.team_id
  left join public.clubs c on c.id = e.club_id
  where (select auth.uid()) is not null and e.status = 'open' and e.visibility in ('public', 'members_only')
    and (e.opens_at is null or e.opens_at <= now()) and (e.closes_at is null or e.closes_at > now())
    and ((e.team_id is not null and (private.is_team_member(e.team_id) or private.is_team_family(e.team_id)))
         or (e.club_id is not null and (private.is_club_member(e.club_id) or exists (
               select 1 from public.teams ct where ct.club_id = e.club_id
                 and (private.is_team_member(ct.id) or private.is_team_family(ct.id))))))
  order by e.closes_at nulls last, e.title;
$$;

-- PUBLIC page data. Callable by anonymous visitors. Returns ONLY explicit public-safe fields and NEVER
-- registrants. A missing, draft, archived or not-visible event returns null (indistinguishable).
create function public.get_public_registration(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare e public.registration_events; v_issuer text; v_schema jsonb; v_member boolean := false; v_state text;
begin
  if p_slug is null or char_length(p_slug) > 80 then return null; end if;
  select * into e from public.registration_events where slug = lower(p_slug) and status in ('open', 'closed');
  if not found then return null; end if;
  if e.visibility = 'members_only' then
    if (select auth.uid()) is null then return null; end if;
    v_member := private.is_issuer_staff(e.team_id, e.club_id)
      or (e.team_id is not null and (private.is_team_member(e.team_id) or private.is_team_family(e.team_id)))
      or (e.club_id is not null and (private.is_club_member(e.club_id) or exists (
            select 1 from public.teams ct where ct.club_id = e.club_id and (private.is_team_member(ct.id) or private.is_team_family(ct.id)))));
    if not v_member then return null; end if;
  end if;
  select coalesce(t.name, c.name) into v_issuer from (select 1) one
    left join public.teams t on t.id = e.team_id left join public.clubs c on c.id = e.club_id;
  select v.schema into v_schema from public.form_versions v where v.id = e.form_version_id;
  v_state := case when e.status = 'closed' or (e.closes_at is not null and now() > e.closes_at) then 'closed'
                  when e.opens_at is not null and now() < e.opens_at then 'upcoming' else 'open' end;
  return jsonb_build_object(
    'slug', e.slug, 'title', e.title, 'kind', e.kind, 'sport', e.sport, 'summary', e.summary, 'info_blocks', e.info_blocks,
    'starts_on', e.starts_on, 'ends_on', e.ends_on, 'location_text', e.location_text, 'opens_at', e.opens_at, 'closes_at', e.closes_at,
    'eligibility', e.eligibility, 'price_cents', e.price_cents, 'payment_timing', e.payment_timing,
    'requires_account', e.price_cents is not null and e.payment_timing = 'at_submission',
    'issuer_name', v_issuer, 'cover_image_path', e.cover_image_path, 'contact_email', e.contact_email,
    'state', v_state, 'spots', private.spots_label(e.capacity, private.registration_taken(e.id), e.waitlist_enabled),
    'waitlist_enabled', e.waitlist_enabled, 'noindex', e.visibility <> 'public',
    'form', jsonb_build_object('version_id', e.form_version_id, 'schema', v_schema),
    'waivers', coalesce((select jsonb_agg(jsonb_build_object('version_id', v.id, 'title', v.title) order by v.title)
                         from unnest(e.waiver_version_ids) wv(id) join public.waiver_versions v on v.id = wv.id), '[]'::jsonb));
end;
$$;

-- Execute grants -----------------------------------------------------------------------------------------------------------------------
revoke execute on function
  private.registration_holds_spot(public.registrations, public.registration_events), private.entry_status(public.registration_events),
  private.next_waitlist_position(uuid), private.promote_waitlist(uuid, integer), private.check_answer_keys(jsonb, jsonb, jsonb),
  private.spots_label(integer, integer, boolean)
  from public, anon, authenticated;

revoke execute on function
  public.svc_create_registration(uuid, uuid, text, text, text, text, text, text, date, uuid, uuid, jsonb, jsonb),
  public.svc_verify_registration(uuid), public.decide_registration(uuid, text, text), public.withdraw_registration(uuid),
  public.promote_from_waitlist(uuid), public.place_registered_player(uuid, uuid, smallint, text),
  public.get_registration_detail(uuid), public.get_sensitive_answers(uuid),
  public.list_registrations(uuid, text[], text, boolean, boolean, integer, integer), public.registration_capacity_summary(uuid),
  public.add_registration_note(uuid, text), public.export_registrations(uuid, boolean), public.list_my_registrations(),
  public.list_open_registration_events(), public.get_public_registration(text)
  from public, anon, authenticated;
grant execute on function
  public.decide_registration(uuid, text, text), public.withdraw_registration(uuid), public.promote_from_waitlist(uuid),
  public.place_registered_player(uuid, uuid, smallint, text), public.get_registration_detail(uuid), public.get_sensitive_answers(uuid),
  public.list_registrations(uuid, text[], text, boolean, boolean, integer, integer), public.registration_capacity_summary(uuid),
  public.add_registration_note(uuid, text), public.export_registrations(uuid, boolean), public.list_my_registrations(),
  public.list_open_registration_events()
  to authenticated;
grant execute on function public.get_public_registration(text) to anon, authenticated;
grant execute on function public.svc_create_registration(uuid, uuid, text, text, text, text, text, text, date, uuid, uuid, jsonb, jsonb),
  public.svc_verify_registration(uuid) to service_role;
