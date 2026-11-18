-- Phase 5 (A2): registration events, registrations, sensitive answers, notes, capability grants
--
-- Clients only READ (staff: registration events; family and staff: registrations). Every write is a
-- SECURITY DEFINER function (this migration and A4) or a service-role function used by Edge
-- Functions (svc_*). Anonymous visitors get NO table access: the public page reads through
-- get_public_registration (A4), which returns explicit public-safe fields only.
--
-- Capacity rule (documented in docs/registration.md): a spot is TAKEN by an accepted or placed
-- registration, and, when payment_timing = 'at_submission', by a submitted registration whose payment
-- hold is paid (hold_expires_at is null) or still running (hold_expires_at > now()). Pending
-- verification, waitlisted, declined and withdrawn registrations never hold a spot.

create sequence private.registration_display_seq start 1001;
create function private.next_registration_display_id()
returns text language sql volatile security definer set search_path = ''
as $$ select 'REG-' || nextval('private.registration_display_seq')::text; $$;

-- Eligibility: null, or {"type":"birth_date","min":"YYYY-MM-DD","max":"YYYY-MM-DD"} (either bound optional),
-- or {"type":"age","min":8,"max":10,"as_of":"YYYY-MM-DD"} (as_of optional; defaults to the event start).
create function private.valid_eligibility(p jsonb)
returns boolean language plpgsql immutable set search_path = ''
as $$
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in ('type', 'min', 'max', 'as_of')) then return false; end if;
  if not (p ? 'min' or p ? 'max') then return false; end if;
  if p ->> 'type' = 'birth_date' then
    if p ? 'as_of' then return false; end if;
    if p ? 'min' and (jsonb_typeof(p -> 'min') <> 'string' or (p ->> 'min') !~ '^\d{4}-\d{2}-\d{2}$') then return false; end if;
    if p ? 'max' and (jsonb_typeof(p -> 'max') <> 'string' or (p ->> 'max') !~ '^\d{4}-\d{2}-\d{2}$') then return false; end if;
    perform (p ->> 'min')::date, (p ->> 'max')::date;
    return true;
  elsif p ->> 'type' = 'age' then
    if p ? 'min' and (jsonb_typeof(p -> 'min') <> 'number' or (p ->> 'min') !~ '^\d{1,2}$') then return false; end if;
    if p ? 'max' and (jsonb_typeof(p -> 'max') <> 'number' or (p ->> 'max') !~ '^\d{1,2}$') then return false; end if;
    if p ? 'as_of' then perform (p ->> 'as_of')::date; end if;
    return true;
  end if;
  return false;
exception when others then
  return false;
end;
$$;

-- Does a date of birth satisfy an event's eligibility rule?
create function private.is_eligible(p_eligibility jsonb, p_dob date, p_starts_on date)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare v_as_of date; v_age integer;
begin
  if p_eligibility is null then return true; end if;
  if p_eligibility ->> 'type' = 'birth_date' then
    return (not p_eligibility ? 'min' or p_dob >= (p_eligibility ->> 'min')::date)
       and (not p_eligibility ? 'max' or p_dob <= (p_eligibility ->> 'max')::date);
  end if;
  v_as_of := coalesce((p_eligibility ->> 'as_of')::date, p_starts_on, current_date);
  v_age := extract(year from age(v_as_of, p_dob))::integer;
  return (not p_eligibility ? 'min' or v_age >= (p_eligibility ->> 'min')::int)
     and (not p_eligibility ? 'max' or v_age <= (p_eligibility ->> 'max')::int);
end;
$$;

-- registration_events ------------------------------------------------------------------------------
create table public.registration_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete restrict,
  club_id uuid references public.clubs (id) on delete restrict,
  title text not null constraint registration_events_title_length check (char_length(btrim(title)) between 1 and 120),
  slug text not null unique
    constraint registration_events_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 6 and 80),
  kind text not null default 'season'
    constraint registration_events_kind check (kind in ('season', 'tryout', 'camp', 'clinic', 'other')),
  sport public.sport,
  summary text constraint registration_events_summary_length check (char_length(summary) <= 500),
  -- Typed blocks (key_facts, description, agenda, what_to_bring, faq). Deep validation: Zod in packages/core.
  info_blocks jsonb not null default '[]'::jsonb,
  starts_on date,
  ends_on date,
  location_text text constraint registration_events_location_length check (char_length(location_text) <= 200),
  opens_at timestamptz,
  closes_at timestamptz,
  capacity integer constraint registration_events_capacity_range check (capacity between 1 and 100000),
  waitlist_enabled boolean not null default false,
  -- true: a freed spot is offered to the first waitlisted registration automatically; false: staff confirm.
  auto_promote_waitlist boolean not null default false,
  visibility text not null default 'public'
    constraint registration_events_visibility check (visibility in ('public', 'link_only', 'members_only')),
  eligibility jsonb,
  price_cents integer constraint registration_events_price_range check (price_cents between 50 and 5000000),
  payment_timing text not null default 'none'
    constraint registration_events_payment_timing check (payment_timing in ('none', 'at_submission', 'after_acceptance')),
  -- How long an unpaid at_submission hold keeps its spot.
  payment_hold_minutes integer not null default 60
    constraint registration_events_hold_range check (payment_hold_minutes between 5 and 10080),
  target_team_id uuid references public.teams (id) on delete set null,
  roster_behavior text not null default 'none'
    constraint registration_events_roster_behavior check (roster_behavior in ('none', 'propose_placement')),
  form_version_id uuid references public.form_versions (id) on delete restrict,
  waiver_version_ids uuid[] not null default '{}'
    constraint registration_events_waiver_count check (cardinality(waiver_version_ids) <= 10),
  cover_image_path text constraint registration_events_cover_length check (char_length(cover_image_path) <= 300),
  contact_email text constraint registration_events_contact_email_length check (char_length(contact_email) <= 254),
  confirmation_message text constraint registration_events_confirmation_length check (char_length(confirmation_message) <= 1000),
  status text not null default 'draft'
    constraint registration_events_status check (status in ('draft', 'open', 'closed', 'archived')),
  created_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_events_one_issuer check (num_nonnulls(team_id, club_id) = 1),
  constraint registration_events_dates check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint registration_events_window check (closes_at is null or opens_at is null or closes_at > opens_at),
  constraint registration_events_eligibility check (private.valid_eligibility(eligibility)),
  constraint registration_events_price_timing check ((price_cents is null) = (payment_timing = 'none')),
  constraint registration_events_info_blocks check (
    jsonb_typeof(info_blocks) = 'array' and jsonb_array_length(info_blocks) <= 40 and octet_length(info_blocks::text) <= 60000),
  constraint registration_events_contact_email_format check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint registration_events_open_complete check (status = 'draft' or form_version_id is not null)
);
create index registration_events_team_id_idx on public.registration_events (team_id) where team_id is not null;
create index registration_events_club_id_idx on public.registration_events (club_id) where club_id is not null;
create index registration_events_target_team_id_idx on public.registration_events (target_team_id) where target_team_id is not null;
create index registration_events_form_version_id_idx on public.registration_events (form_version_id) where form_version_id is not null;
create index registration_events_created_by_idx on public.registration_events (created_by) where created_by is not null;
create index registration_events_status_idx on public.registration_events (status);
create trigger registration_events_set_updated_at before update on public.registration_events
  for each row execute function public.set_updated_at();

-- registrations --------------------------------------------------------------------------------------
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  registration_event_id uuid not null references public.registration_events (id) on delete restrict,
  display_id text not null unique constraint registrations_display_id_format check (display_id ~ '^REG-[0-9]{4,}$'),
  submitted_by uuid references public.profiles (id) on delete set null,
  guardian_name text not null constraint registrations_guardian_name_length check (char_length(btrim(guardian_name)) between 1 and 120),
  guardian_email text not null constraint registrations_guardian_email_format
    check (char_length(guardian_email) <= 254 and guardian_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  guardian_phone text constraint registrations_guardian_phone_length check (char_length(guardian_phone) <= 40),
  guardian_relationship text not null constraint registrations_guardian_relationship_length
    check (char_length(btrim(guardian_relationship)) between 1 and 40),
  player_first_name text not null constraint registrations_player_first_length check (char_length(btrim(player_first_name)) between 1 and 60),
  player_last_name text not null constraint registrations_player_last_length check (char_length(btrim(player_last_name)) between 1 and 60),
  player_date_of_birth date not null
    constraint registrations_dob_range check (player_date_of_birth between date '1900-01-01' and date '2100-01-01'),
  player_id uuid references public.players (id) on delete set null,
  household_id uuid references public.households (id) on delete set null,
  status text not null default 'submitted'
    constraint registrations_status check (status in
      ('pending_verification', 'submitted', 'waitlisted', 'accepted', 'declined', 'withdrawn', 'placed')),
  form_version_id uuid not null references public.form_versions (id) on delete restrict,
  -- NON-sensitive answers only. Sensitive answers live in registration_sensitive_answers.
  answers jsonb not null default '{}'::jsonb
    constraint registrations_answers_shape check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 50000),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text constraint registrations_decision_note_length check (char_length(decision_note) <= 1000),
  -- Monotonic per event, never renumbered, so waitlist order is stable. Rank = order among waitlisted.
  waitlist_position integer,
  -- at_submission only: when an unpaid hold stops counting. Null = paid (or no hold).
  hold_expires_at timestamptz,
  payment_request_id uuid references public.payment_requests (id) on delete set null,
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registrations_waitlist_consistency check (status <> 'waitlisted' or waitlist_position is not null)
);
create index registrations_event_status_idx on public.registrations (registration_event_id, status);
create index registrations_submitted_by_idx on public.registrations (submitted_by) where submitted_by is not null;
create index registrations_household_id_idx on public.registrations (household_id) where household_id is not null;
create index registrations_player_id_idx on public.registrations (player_id) where player_id is not null;
create index registrations_form_version_id_idx on public.registrations (form_version_id);
create index registrations_decided_by_idx on public.registrations (decided_by) where decided_by is not null;
create index registrations_payment_request_id_idx on public.registrations (payment_request_id) where payment_request_id is not null;
create index registrations_guardian_email_idx on public.registrations (lower(guardian_email));
create unique index registrations_waitlist_position_uidx
  on public.registrations (registration_event_id, waitlist_position) where waitlist_position is not null;
-- One live registration per child per event (a duplicate submission is refused, not double-counted).
create unique index registrations_one_live_per_child_uidx
  on public.registrations (registration_event_id, lower(guardian_email), lower(player_first_name), lower(player_last_name), player_date_of_birth)
  where status not in ('declined', 'withdrawn');
create trigger registrations_set_updated_at before update on public.registrations
  for each row execute function public.set_updated_at();

create function private.guard_registration()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.guardian_email := lower(btrim(new.guardian_email));
  if tg_op = 'UPDATE' then
    if new.registration_event_id is distinct from old.registration_event_id
       or new.display_id is distinct from old.display_id
       or new.form_version_id is distinct from old.form_version_id then
      raise exception 'registration_immutable' using errcode = '23514';
    end if;
    -- Once anonymized the row never changes again.
    if old.anonymized_at is not null and new.* is distinct from old.* then
      raise exception 'registration_anonymized' using errcode = '23514';
    end if;
    if new.status is distinct from old.status and not (
         (old.status = 'pending_verification' and new.status in ('submitted', 'waitlisted', 'declined', 'withdrawn'))
      or (old.status = 'submitted' and new.status in ('accepted', 'waitlisted', 'declined', 'withdrawn'))
      or (old.status = 'waitlisted' and new.status in ('accepted', 'declined', 'withdrawn'))
      or (old.status = 'accepted' and new.status in ('placed', 'declined', 'withdrawn'))
      or (old.status = 'placed' and new.status in ('withdrawn'))) then
      raise exception 'invalid_status_transition' using errcode = '23514',
        detail = format('%s -> %s', old.status, new.status);
    end if;
  end if;
  return new;
end;
$$;
create trigger registrations_guard before insert or update on public.registrations
  for each row execute function private.guard_registration();

-- Events: validation, state machine, and terms frozen once registrations exist.
create function private.guard_registration_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_taken integer; v_block jsonb;
begin
  if jsonb_typeof(new.info_blocks) <> 'array' then raise exception 'invalid_info_block' using errcode = '23514'; end if;
  for v_block in select value from jsonb_array_elements(new.info_blocks) loop
    if jsonb_typeof(v_block) <> 'object'
       or coalesce(v_block ->> 'type', '') not in ('key_facts', 'description', 'agenda', 'what_to_bring', 'faq') then
      raise exception 'invalid_info_block' using errcode = '23514';
    end if;
  end loop;
  if new.target_team_id is not null and new.club_id is not null and not exists (
       select 1 from public.teams t where t.id = new.target_team_id and t.club_id = new.club_id) then
    raise exception 'target_team_not_in_club' using errcode = '23514';
  end if;
  if new.target_team_id is not null and new.team_id is not null and new.target_team_id <> new.team_id then
    raise exception 'target_team_mismatch' using errcode = '23514';
  end if;
  if new.roster_behavior = 'propose_placement' and new.team_id is null and new.club_id is null then
    raise exception 'invalid_issuer' using errcode = '23514';
  end if;
  if new.form_version_id is not null and not exists (
       select 1 from public.form_versions v join public.forms f on f.id = v.form_id
       where v.id = new.form_version_id and f.team_id is not distinct from new.team_id and f.club_id is not distinct from new.club_id) then
    raise exception 'form_wrong_owner' using errcode = '23514';
  end if;
  if cardinality(new.waiver_version_ids) > 0 and exists (
       select 1 from unnest(new.waiver_version_ids) wv(id)
       where not exists (
         select 1 from public.waiver_versions v join public.waivers w on w.id = v.waiver_id
         where v.id = wv.id and (w.team_id is not distinct from new.team_id and w.club_id is not distinct from new.club_id
                 or (w.club_id is not null and w.club_id = (select t.club_id from public.teams t where t.id = new.team_id))))) then
    raise exception 'waiver_wrong_owner' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.team_id is distinct from old.team_id or new.club_id is distinct from old.club_id then
      raise exception 'issuer_immutable' using errcode = '23514';
    end if;
    if old.status <> 'draft' and new.slug <> old.slug then
      raise exception 'slug_locked' using errcode = '23514';
    end if;
    if new.status is distinct from old.status and not (
         (old.status = 'draft' and new.status in ('open', 'archived'))
      or (old.status = 'open' and new.status in ('closed', 'archived'))
      or (old.status = 'closed' and new.status in ('open', 'archived'))) then
      raise exception 'invalid_status_transition' using errcode = '23514', detail = format('%s -> %s', old.status, new.status);
    end if;
    if exists (select 1 from public.registrations r where r.registration_event_id = old.id) then
      if new.price_cents is distinct from old.price_cents or new.payment_timing is distinct from old.payment_timing
         or new.form_version_id is distinct from old.form_version_id
         or new.waiver_version_ids is distinct from old.waiver_version_ids then
        raise exception 'terms_locked' using errcode = '23514',
          detail = 'Price, payment timing, form and waivers cannot change once registrations exist.';
      end if;
      if new.capacity is not null and new.capacity is distinct from old.capacity then
        v_taken := private.registration_taken(old.id);
        if new.capacity < v_taken then raise exception 'capacity_below_taken' using errcode = '23514'; end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Spots taken (see the capacity rule above). Callers hold the event row lock when it matters.
create function private.registration_taken(p_event_id uuid)
returns integer language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from public.registrations r
  join public.registration_events e on e.id = r.registration_event_id
  where r.registration_event_id = p_event_id
    and (r.status in ('accepted', 'placed')
         or (r.status = 'submitted' and e.payment_timing = 'at_submission'
             and (r.hold_expires_at is null or r.hold_expires_at > now())));
$$;
create trigger registration_events_guard before insert or update on public.registration_events
  for each row execute function private.guard_registration_event();

-- Sensitive answers: apart from ordinary answers, NO client access at all ------------------------------------
create table public.registration_sensitive_answers (
  registration_id uuid primary key references public.registrations (id) on delete cascade,
  answers jsonb not null
    constraint registration_sensitive_answers_shape check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 20000),
  created_at timestamptz not null default now()
);

-- Staff-only evaluation notes (never visible to families) -------------------------------------------------------
create table public.registration_notes (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null constraint registration_notes_body_length check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index registration_notes_registration_id_idx on public.registration_notes (registration_id);
create index registration_notes_author_id_idx on public.registration_notes (author_id) where author_id is not null;

-- Who may read sensitive answers beyond the issuer's admins (documented, grantable capability) --------------------
create table public.registration_capability_grants (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete cascade,
  club_id uuid references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  capability text not null constraint registration_capability_grants_capability check (capability in ('sensitive_answers')),
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint registration_capability_grants_one_owner check (num_nonnulls(team_id, club_id) = 1)
);
create unique index registration_capability_grants_team_uidx
  on public.registration_capability_grants (team_id, profile_id, capability) where team_id is not null;
create unique index registration_capability_grants_club_uidx
  on public.registration_capability_grants (club_id, profile_id, capability) where club_id is not null;
create index registration_capability_grants_profile_id_idx on public.registration_capability_grants (profile_id);
create index registration_capability_grants_club_id_idx on public.registration_capability_grants (club_id) where club_id is not null;
create index registration_capability_grants_granted_by_idx on public.registration_capability_grants (granted_by) where granted_by is not null;

-- Helpers ----------------------------------------------------------------------------------------------------------------
create function private.can_read_sensitive(p_team_id uuid, p_club_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_issuer_admin(p_team_id, p_club_id)
    or (private.is_issuer_staff(p_team_id, p_club_id)
        and exists (select 1 from public.registration_capability_grants g
                    where g.profile_id = (select auth.uid()) and g.capability = 'sensitive_answers'
                      and g.team_id is not distinct from p_team_id and g.club_id is not distinct from p_club_id));
$$;

create function private.is_registration_event_staff(p_event_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.registration_events e where e.id = p_event_id and private.is_issuer_staff(e.team_id, e.club_id));
$$;

create function private.is_registration_event_manager(p_event_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.registration_events e where e.id = p_event_id and private.is_issuer_manager(e.team_id, e.club_id));
$$;

-- A family member (submitter or guardian of the linked household) or issuer staff.
create function private.can_view_registration(p_registration_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.registrations r join public.registration_events e on e.id = r.registration_event_id
    where r.id = p_registration_id
      and (r.submitted_by = (select auth.uid())
           or (r.household_id is not null and private.is_household_guardian(r.household_id))
           or private.is_issuer_staff(e.team_id, e.club_id)));
$$;

create function private.is_registration_family(p_registration_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.registrations r
    where r.id = p_registration_id
      and (r.submitted_by = (select auth.uid())
           or (r.household_id is not null and private.is_household_guardian(r.household_id))));
$$;

-- RLS -----------------------------------------------------------------------------------------------------------------------
alter table public.registration_events enable row level security;
alter table public.registrations enable row level security;
alter table public.registration_sensitive_answers enable row level security;
alter table public.registration_notes enable row level security;
alter table public.registration_capability_grants enable row level security;
revoke all on public.registration_events, public.registrations, public.registration_sensitive_answers,
  public.registration_notes, public.registration_capability_grants from anon, authenticated;
grant select on public.registration_events, public.registrations, public.registration_notes,
  public.registration_capability_grants to authenticated;
-- registration_sensitive_answers: no grants. Read only through get_sensitive_answers (audited).

create policy "Issuer staff read registration events" on public.registration_events
  for select to authenticated using (private.is_issuer_staff(team_id, club_id));
create policy "Families and issuer staff read registrations" on public.registrations
  for select to authenticated using (private.can_view_registration(id));
create policy "No direct access to sensitive answers" on public.registration_sensitive_answers
  for all to authenticated using (false) with check (false);
create policy "Issuer staff read registration notes" on public.registration_notes
  for select to authenticated using (exists (
    select 1 from public.registrations r where r.id = registration_id and private.is_registration_event_staff(r.registration_event_id)));
create policy "Admins and grantees read capability grants" on public.registration_capability_grants
  for select to authenticated using (profile_id = (select auth.uid()) or private.is_issuer_admin(team_id, club_id));

-- Functions: registration events -----------------------------------------------------------------------------------------------
-- Columns a manager may set through create/update (everything else is controlled by the functions).
create function private.event_data_keys()
returns text[] language sql immutable set search_path = ''
as $$ select array['title', 'slug', 'kind', 'sport', 'summary', 'info_blocks', 'starts_on', 'ends_on', 'location_text',
  'opens_at', 'closes_at', 'capacity', 'waitlist_enabled', 'auto_promote_waitlist', 'visibility', 'eligibility',
  'price_cents', 'payment_timing', 'payment_hold_minutes', 'target_team_id', 'roster_behavior', 'form_version_id',
  'waiver_version_ids', 'cover_image_path', 'contact_email', 'confirmation_message']; $$;

create function public.create_registration_event(
  p_team_id uuid default null, p_club_id uuid default null, p_data jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_row public.registration_events; v_key text; v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if num_nonnulls(p_team_id, p_club_id) <> 1 or not private.is_issuer_manager(p_team_id, p_club_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for v_key in select jsonb_object_keys(coalesce(p_data, '{}'::jsonb)) loop
    if not v_key = any (private.event_data_keys()) then raise exception 'unknown_field' using errcode = '22023', detail = left(v_key, 40); end if;
  end loop;
  v_row := jsonb_populate_record(null::public.registration_events, coalesce(p_data, '{}'::jsonb));
  insert into public.registration_events (
    team_id, club_id, title, slug, kind, sport, summary, info_blocks, starts_on, ends_on, location_text, opens_at, closes_at,
    capacity, waitlist_enabled, auto_promote_waitlist, visibility, eligibility, price_cents, payment_timing, payment_hold_minutes,
    target_team_id, roster_behavior, form_version_id, waiver_version_ids, cover_image_path, contact_email, confirmation_message, created_by)
  values (
    p_team_id, p_club_id, btrim(v_row.title), v_row.slug, coalesce(v_row.kind, 'season'), v_row.sport, nullif(btrim(v_row.summary), ''),
    coalesce(v_row.info_blocks, '[]'::jsonb), v_row.starts_on, v_row.ends_on, nullif(btrim(v_row.location_text), ''), v_row.opens_at,
    v_row.closes_at, v_row.capacity, coalesce(v_row.waitlist_enabled, false), coalesce(v_row.auto_promote_waitlist, false),
    coalesce(v_row.visibility, 'public'), v_row.eligibility, v_row.price_cents, coalesce(v_row.payment_timing, 'none'),
    coalesce(v_row.payment_hold_minutes, 60), v_row.target_team_id, coalesce(v_row.roster_behavior, 'none'), v_row.form_version_id,
    coalesce(v_row.waiver_version_ids, '{}'), v_row.cover_image_path, nullif(btrim(v_row.contact_email), ''),
    nullif(btrim(v_row.confirmation_message), ''), (select auth.uid()))
  returning id into v_id;
  perform private.write_audit('registration_event.create', 'registration_events', v_id, p_team_id, p_club_id, null,
    jsonb_build_object('title', btrim(v_row.title), 'slug', v_row.slug));
  return v_id;
end;
$$;

create function public.update_registration_event(p_event_id uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare e public.registration_events; v_new public.registration_events; v_key text;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.registration_events where id = p_event_id for update;
  if not found or not private.is_issuer_manager(e.team_id, e.club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if e.status = 'archived' then raise exception 'event_archived' using errcode = '23514'; end if;
  for v_key in select jsonb_object_keys(coalesce(p_data, '{}'::jsonb)) loop
    if not v_key = any (private.event_data_keys()) then raise exception 'unknown_field' using errcode = '22023', detail = left(v_key, 40); end if;
  end loop;
  v_new := jsonb_populate_record(e, coalesce(p_data, '{}'::jsonb));
  update public.registration_events set
    title = btrim(v_new.title), slug = v_new.slug, kind = v_new.kind, sport = v_new.sport, summary = nullif(btrim(v_new.summary), ''),
    info_blocks = v_new.info_blocks, starts_on = v_new.starts_on, ends_on = v_new.ends_on,
    location_text = nullif(btrim(v_new.location_text), ''), opens_at = v_new.opens_at, closes_at = v_new.closes_at,
    capacity = v_new.capacity, waitlist_enabled = v_new.waitlist_enabled, auto_promote_waitlist = v_new.auto_promote_waitlist,
    visibility = v_new.visibility, eligibility = v_new.eligibility, price_cents = v_new.price_cents,
    payment_timing = v_new.payment_timing, payment_hold_minutes = v_new.payment_hold_minutes,
    target_team_id = v_new.target_team_id, roster_behavior = v_new.roster_behavior, form_version_id = v_new.form_version_id,
    waiver_version_ids = v_new.waiver_version_ids, cover_image_path = v_new.cover_image_path,
    contact_email = nullif(btrim(v_new.contact_email), ''), confirmation_message = nullif(btrim(v_new.confirmation_message), '')
  where id = p_event_id;
  perform private.write_audit('registration_event.update', 'registration_events', p_event_id, e.team_id, e.club_id, null,
    jsonb_build_object('keys', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(coalesce(p_data, '{}'::jsonb)) k)));
end;
$$;

-- Publish (or reopen) an event. Requires a published form, every waiver the team requires, and payments readiness.
create function public.publish_registration_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare e public.registration_events; v_team uuid;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.registration_events where id = p_event_id for update;
  if not found or not private.is_issuer_manager(e.team_id, e.club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if e.status not in ('draft', 'closed') then raise exception 'invalid_status_transition' using errcode = '23514'; end if;
  if e.form_version_id is null then raise exception 'form_required' using errcode = '23514'; end if;
  if e.opens_at is null or e.closes_at is null then raise exception 'window_required' using errcode = '23514'; end if;
  if e.closes_at <= now() then raise exception 'window_in_past' using errcode = '23514'; end if;
  -- Every waiver the (target) team requires must be among the event's waiver versions.
  v_team := coalesce(e.team_id, e.target_team_id);
  if v_team is not null and exists (
       select 1 from public.team_required_waivers rw
       where rw.team_id = v_team and not exists (
         select 1 from public.waiver_versions v where v.waiver_id = rw.waiver_id and v.id = any (e.waiver_version_ids))) then
    raise exception 'required_waivers_missing' using errcode = '23514';
  end if;
  if e.price_cents is not null and not exists (
       select 1 from public.connected_accounts ca
       where ca.team_id is not distinct from e.team_id and ca.club_id is not distinct from e.club_id and ca.charges_enabled) then
    raise exception 'payments_not_ready' using errcode = '23514',
      detail = 'Finish payout setup before opening a paid registration.';
  end if;
  update public.registration_events set status = 'open', published_at = coalesce(published_at, now()) where id = p_event_id;
  perform private.write_audit('registration_event.publish', 'registration_events', p_event_id, e.team_id, e.club_id,
    jsonb_build_object('status', e.status), jsonb_build_object('status', 'open'));
end;
$$;

create function public.close_registration_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare e public.registration_events;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.registration_events where id = p_event_id for update;
  if not found or not private.is_issuer_manager(e.team_id, e.club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.registration_events set status = 'closed' where id = p_event_id;
  perform private.write_audit('registration_event.close', 'registration_events', p_event_id, e.team_id, e.club_id,
    jsonb_build_object('status', e.status), jsonb_build_object('status', 'closed'));
end;
$$;

create function public.archive_registration_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare e public.registration_events;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.registration_events where id = p_event_id for update;
  if not found or not private.is_issuer_manager(e.team_id, e.club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.registration_events set status = 'archived' where id = p_event_id;
  perform private.write_audit('registration_event.archive', 'registration_events', p_event_id, e.team_id, e.club_id,
    jsonb_build_object('status', e.status), jsonb_build_object('status', 'archived'));
end;
$$;

-- Grant or revoke the sensitive-answers capability to active staff of the issuer. Issuer admins only.
create function public.grant_registration_capability(
  p_team_id uuid default null, p_club_id uuid default null, p_profile_id uuid default null,
  p_capability text default 'sensitive_answers', p_granted boolean default true)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if num_nonnulls(p_team_id, p_club_id) <> 1 or not private.is_issuer_admin(p_team_id, p_club_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_capability <> 'sensitive_answers' then raise exception 'unknown_capability' using errcode = '22023'; end if;
  if p_granted then
    if not (
         (p_team_id is not null and exists (select 1 from public.team_memberships tm where tm.team_id = p_team_id
            and tm.profile_id = p_profile_id and tm.status = 'active' and tm.role in ('admin', 'coach', 'manager')))
      or (p_club_id is not null and exists (select 1 from public.club_memberships cm where cm.club_id = p_club_id
            and cm.profile_id = p_profile_id and cm.status = 'active'))) then
      raise exception 'grantee_not_staff' using errcode = '23514';
    end if;
    insert into public.registration_capability_grants (team_id, club_id, profile_id, capability, granted_by)
    values (p_team_id, p_club_id, p_profile_id, p_capability, (select auth.uid())) on conflict do nothing;
  else
    delete from public.registration_capability_grants
    where team_id is not distinct from p_team_id and club_id is not distinct from p_club_id
      and profile_id = p_profile_id and capability = p_capability;
  end if;
  perform private.write_audit('registration.capability', 'profiles', p_profile_id, p_team_id, p_club_id, null,
    jsonb_build_object('capability', p_capability, 'granted', p_granted));
end;
$$;

-- Execute grants ---------------------------------------------------------------------------------------------------------------
revoke execute on function
  private.next_registration_display_id(), private.valid_eligibility(jsonb), private.is_eligible(jsonb, date, date),
  private.guard_registration(), private.guard_registration_event(), private.registration_taken(uuid),
  private.can_read_sensitive(uuid, uuid), private.is_registration_event_staff(uuid), private.is_registration_event_manager(uuid),
  private.can_view_registration(uuid), private.is_registration_family(uuid), private.event_data_keys()
  from public, anon, authenticated;
grant execute on function private.can_read_sensitive(uuid, uuid), private.is_registration_event_staff(uuid),
  private.is_registration_event_manager(uuid), private.can_view_registration(uuid), private.is_registration_family(uuid),
  private.valid_eligibility(jsonb), private.event_data_keys()
  to authenticated;
revoke execute on function
  public.create_registration_event(uuid, uuid, jsonb), public.update_registration_event(uuid, jsonb),
  public.publish_registration_event(uuid), public.close_registration_event(uuid), public.archive_registration_event(uuid),
  public.grant_registration_capability(uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function
  public.create_registration_event(uuid, uuid, jsonb), public.update_registration_event(uuid, jsonb),
  public.publish_registration_event(uuid), public.close_registration_event(uuid), public.archive_registration_event(uuid),
  public.grant_registration_capability(uuid, uuid, uuid, text, boolean)
  to authenticated;
