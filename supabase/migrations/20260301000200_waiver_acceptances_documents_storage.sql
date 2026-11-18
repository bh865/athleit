-- Phase 5 (A3): waiver acceptances (append-only), acceptance evidence, documents, Storage buckets
--
-- waiver_acceptances is APPEND-ONLY: no UPDATE or DELETE for anyone, even the service role or the
-- database owner. Two narrow exceptions exist so that other rules keep working, both enforced by the
-- trigger (every other column is frozen):
--   * signed_copy_path may be set ONCE (null -> value), after the PDF is generated;
--   * signer_profile_id may be set to null (an account deletion cascades it); nothing else changes.
-- IP address and user agent live in waiver_acceptance_evidence, readable by issuer admins only.
-- Whether Edge Functions write that evidence is a product decision (see docs/registration-privacy.md).

create table public.waiver_acceptances (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid references public.registrations (id) on delete restrict,
  player_id uuid references public.players (id) on delete restrict,
  waiver_version_id uuid not null references public.waiver_versions (id) on delete restrict,
  -- Typed signature: the signer types their full name.
  signer_name text not null constraint waiver_acceptances_signer_name_length check (char_length(btrim(signer_name)) between 1 and 120),
  signer_relationship text not null constraint waiver_acceptances_relationship_length check (char_length(btrim(signer_relationship)) between 1 and 40),
  signer_profile_id uuid references public.profiles (id) on delete set null,
  signer_email text not null constraint waiver_acceptances_signer_email_format
    check (char_length(signer_email) <= 254 and signer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  accepted_at timestamptz not null default now(),
  -- ESIGN/UETA: the signer agreed to use electronic records and signatures. Must be true.
  electronic_consent boolean not null constraint waiver_acceptances_consent check (electronic_consent),
  signed_copy_path text constraint waiver_acceptances_copy_path_length check (char_length(signed_copy_path) <= 300),
  constraint waiver_acceptances_has_subject check (num_nonnulls(registration_id, player_id) >= 1)
);
create index waiver_acceptances_registration_id_idx on public.waiver_acceptances (registration_id) where registration_id is not null;
create index waiver_acceptances_player_id_idx on public.waiver_acceptances (player_id) where player_id is not null;
create index waiver_acceptances_waiver_version_id_idx on public.waiver_acceptances (waiver_version_id);
create index waiver_acceptances_signer_profile_id_idx on public.waiver_acceptances (signer_profile_id) where signer_profile_id is not null;
create unique index waiver_acceptances_one_per_registration_uidx
  on public.waiver_acceptances (registration_id, waiver_version_id) where registration_id is not null;

create function private.guard_waiver_acceptance()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.signer_email := lower(btrim(new.signer_email));
    new.signer_name := btrim(new.signer_name);
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'signed_copy_path' - 'signer_profile_id') = (to_jsonb(old) - 'signed_copy_path' - 'signer_profile_id')
     and (new.signed_copy_path is not distinct from old.signed_copy_path or old.signed_copy_path is null)
     and (new.signer_profile_id is not distinct from old.signer_profile_id or new.signer_profile_id is null) then
    return new;
  end if;
  raise exception 'acceptance_append_only' using errcode = '23514',
    detail = 'Waiver acceptances cannot be changed or deleted.';
end;
$$;
create trigger waiver_acceptances_guard before insert or update or delete on public.waiver_acceptances
  for each row execute function private.guard_waiver_acceptance();
create function private.guard_waiver_acceptance_truncate()
returns trigger language plpgsql set search_path = ''
as $$ begin raise exception 'acceptance_append_only' using errcode = '23514'; end; $$;
create trigger waiver_acceptances_no_truncate before truncate on public.waiver_acceptances
  for each statement execute function private.guard_waiver_acceptance_truncate();

-- IP address and user agent of the signer, if the product decision is to record them.
create table public.waiver_acceptance_evidence (
  acceptance_id uuid primary key references public.waiver_acceptances (id) on delete restrict,
  ip_address inet,
  user_agent text constraint waiver_acceptance_evidence_ua_length check (char_length(user_agent) <= 400),
  created_at timestamptz not null default now()
);
create trigger waiver_acceptance_evidence_immutable before update or delete on public.waiver_acceptance_evidence
  for each row execute function private.guard_waiver_acceptance_truncate();
create trigger waiver_acceptance_evidence_no_truncate before truncate on public.waiver_acceptance_evidence
  for each statement execute function private.guard_waiver_acceptance_truncate();

-- documents -----------------------------------------------------------------------------------------------
create table public.documents (
  -- The id equals the third segment of storage_path (<team|club>/<owner id>/<document id>/<file>).
  id uuid primary key,
  team_id uuid references public.teams (id) on delete cascade,
  club_id uuid references public.clubs (id) on delete cascade,
  title text not null constraint documents_title_length check (char_length(btrim(title)) between 1 and 150),
  description text constraint documents_description_length check (char_length(description) <= 1000),
  category text not null default 'other'
    constraint documents_category check (category in ('rules', 'schedule', 'tournament', 'forms', 'other')),
  storage_path text not null unique constraint documents_storage_path_length check (char_length(storage_path) between 10 and 300),
  mime_type text not null,
  size_bytes bigint not null constraint documents_size_range check (size_bytes between 1 and 20971520),
  visibility text not null default 'team_members'
    constraint documents_visibility check (visibility in ('staff_only', 'team_members')),
  pinned boolean not null default false,
  uploaded_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_one_owner check (num_nonnulls(team_id, club_id) = 1),
  constraint documents_mime_allowed check (mime_type in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'))
);
create index documents_team_id_idx on public.documents (team_id) where team_id is not null;
create index documents_club_id_idx on public.documents (club_id) where club_id is not null;
create index documents_uploaded_by_idx on public.documents (uploaded_by) where uploaded_by is not null;
create trigger documents_set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

create function private.guard_document()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.team_id is distinct from old.team_id or new.club_id is distinct from old.club_id
     or new.storage_path is distinct from old.storage_path or new.mime_type is distinct from old.mime_type
     or new.size_bytes is distinct from old.size_bytes or new.uploaded_by is distinct from old.uploaded_by then
    raise exception 'document_file_immutable' using errcode = '23514', detail = 'Upload a new document instead.';
  end if;
  return new;
end;
$$;
create trigger documents_guard before update on public.documents
  for each row execute function private.guard_document();

-- Helpers -------------------------------------------------------------------------------------------------------
-- A rostered player's family, or the player themself (13+): the people a team document is for besides members.
create function private.is_team_family(p_team_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_players tp join public.players p on p.id = tp.player_id
    where tp.team_id = p_team_id and tp.status = 'active'
      and (p.profile_id = (select auth.uid())
           or exists (select 1 from public.household_members hm
                      where hm.household_id = p.household_id and hm.profile_id = (select auth.uid()) and hm.relationship = 'guardian')));
$$;

create function private.can_read_document(p_document_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id
      and (private.is_issuer_manager(d.team_id, d.club_id)
           or (d.archived_at is null
               and case
                 when d.team_id is not null then
                   case d.visibility
                     when 'staff_only' then private.is_team_staff(d.team_id)
                     else private.is_team_staff(d.team_id) or private.is_team_member(d.team_id) or private.is_team_family(d.team_id) end
                 else
                   case d.visibility
                     when 'staff_only' then private.is_club_member(d.club_id)
                     else private.is_club_member(d.club_id) or exists (
                       select 1 from public.teams t where t.club_id = d.club_id
                         and (private.is_team_staff(t.id) or private.is_team_member(t.id) or private.is_team_family(t.id))) end
               end)));
$$;

create function private.can_read_acceptance(p_acceptance_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.waiver_acceptances a
    join public.waiver_versions v on v.id = a.waiver_version_id
    join public.waivers w on w.id = v.waiver_id
    where a.id = p_acceptance_id
      and (a.signer_profile_id = (select auth.uid())
           or (a.registration_id is not null and (private.is_registration_family(a.registration_id)
                or exists (select 1 from public.registrations r where r.id = a.registration_id
                           and private.is_registration_event_staff(r.registration_event_id))))
           or (a.player_id is not null and (private.is_guardian_of(a.player_id)
                or exists (select 1 from public.team_players tp where tp.player_id = a.player_id and private.is_team_staff(tp.team_id))))
           or private.is_issuer_staff(w.team_id, w.club_id)));
$$;

create function private.can_read_acceptance_evidence(p_acceptance_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.waiver_acceptances a
    join public.waiver_versions v on v.id = a.waiver_version_id
    join public.waivers w on w.id = v.waiver_id
    where a.id = p_acceptance_id
      and (private.is_issuer_admin(w.team_id, w.club_id)
           or exists (select 1 from public.registrations r join public.registration_events e on e.id = r.registration_event_id
                      where r.id = a.registration_id and private.is_issuer_admin(e.team_id, e.club_id))));
$$;

-- RLS ---------------------------------------------------------------------------------------------------------------
alter table public.waiver_acceptances enable row level security;
alter table public.waiver_acceptance_evidence enable row level security;
alter table public.documents enable row level security;
revoke all on public.waiver_acceptances, public.waiver_acceptance_evidence, public.documents from anon, authenticated;
grant select on public.waiver_acceptances, public.waiver_acceptance_evidence, public.documents to authenticated;

create policy "Signers, families and staff read acceptances" on public.waiver_acceptances
  for select to authenticated using (private.can_read_acceptance(id));
create policy "Issuer admins read acceptance evidence" on public.waiver_acceptance_evidence
  for select to authenticated using (private.can_read_acceptance_evidence(acceptance_id));
create policy "Eligible members read documents" on public.documents
  for select to authenticated using (private.can_read_document(id));

-- Waiver text for signers: a family may read a waiver version attached to a registration they can see,
-- or one they already signed. (Replaces the staff-only policy from A1 with a superset.)
drop policy "Waiver version readers read versions" on public.waiver_versions;
create function private.can_read_waiver_version_extended(p_version_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.can_read_waiver_version(p_version_id)
    or exists (select 1 from public.registrations r join public.registration_events e on e.id = r.registration_event_id
               where p_version_id = any (e.waiver_version_ids)
                 and (r.submitted_by = (select auth.uid())
                      or (r.household_id is not null and private.is_household_guardian(r.household_id))))
    or exists (select 1 from public.waiver_acceptances a where a.waiver_version_id = p_version_id and private.can_read_acceptance(a.id));
$$;
create policy "Staff, signers and registrants read waiver versions" on public.waiver_versions
  for select to authenticated using (private.can_read_waiver_version_extended(id));
drop policy "Issuer staff read form versions" on public.form_versions;
create function private.can_read_form_version_extended(p_version_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.can_read_form_version(p_version_id)
    or exists (select 1 from public.registrations r where r.form_version_id = p_version_id
               and (r.submitted_by = (select auth.uid())
                    or (r.household_id is not null and private.is_household_guardian(r.household_id))));
$$;
create policy "Staff and registrants read form versions" on public.form_versions
  for select to authenticated using (private.can_read_form_version_extended(id));

-- Storage ---------------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents', 'documents', false, 20971520, array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']),
  ('waiver-copies', 'waiver-copies', false, 5242880, array['application/pdf']),
  ('registration-covers', 'registration-covers', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Path helpers. documents: <team|club>/<owner uuid>/<document uuid>/<file>. covers: <owner uuid>/<file>.
create function private.uuid_or_null(p_text text)
returns uuid language sql immutable set search_path = ''
as $$
  select case when p_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_text::uuid end;
$$;

create function private.can_manage_document_path(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case split_part(p_name, '/', 1)
    when 'team' then private.is_issuer_manager(private.uuid_or_null(split_part(p_name, '/', 2)), null)
    when 'club' then private.is_issuer_manager(null, private.uuid_or_null(split_part(p_name, '/', 2)))
    else false end
    and private.uuid_or_null(split_part(p_name, '/', 3)) is not null
    and char_length(split_part(p_name, '/', 4)) between 1 and 200
    and split_part(p_name, '/', 5) = '';
$$;

create function private.can_manage_cover_path(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.uuid_or_null(split_part(p_name, '/', 1)) is not null
    and char_length(split_part(p_name, '/', 2)) between 1 and 200 and split_part(p_name, '/', 3) = ''
    and (private.is_issuer_manager(private.uuid_or_null(split_part(p_name, '/', 1)), null)
         or private.is_issuer_manager(null, private.uuid_or_null(split_part(p_name, '/', 1))));
$$;

create function private.can_read_cover_path(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.uuid_or_null(split_part(p_name, '/', 1)) is not null
    and (private.is_issuer_staff(private.uuid_or_null(split_part(p_name, '/', 1)), null)
         or private.is_issuer_staff(null, private.uuid_or_null(split_part(p_name, '/', 1))));
$$;

create policy "Documents: eligible members read"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents' and exists (
    select 1 from public.documents d where d.storage_path = name and private.can_read_document(d.id)));
create policy "Documents: managers upload under their own prefix"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and private.can_manage_document_path(name));
-- Managers may only delete objects that never got a metadata row (failed uploads).
create policy "Documents: managers delete orphan uploads"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and private.can_manage_document_path(name)
         and not exists (select 1 from public.documents d where d.storage_path = name));

create policy "Waiver copies: signers, families and staff read"
  on storage.objects for select to authenticated
  using (bucket_id = 'waiver-copies' and exists (
    select 1 from public.waiver_acceptances a where a.signed_copy_path = name and private.can_read_acceptance(a.id)));
-- No insert/update/delete policies on waiver-copies: only the service role (Edge Functions) writes.

create policy "Registration covers: staff read"
  on storage.objects for select to authenticated
  using (bucket_id = 'registration-covers' and private.can_read_cover_path(name));
create policy "Registration covers: managers upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'registration-covers' and private.can_manage_cover_path(name));
create policy "Registration covers: managers replace"
  on storage.objects for update to authenticated
  using (bucket_id = 'registration-covers' and private.can_manage_cover_path(name))
  with check (bucket_id = 'registration-covers' and private.can_manage_cover_path(name));
create policy "Registration covers: managers delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'registration-covers' and private.can_manage_cover_path(name));

-- Document functions ------------------------------------------------------------------------------------------------------
-- Call after uploading the object. Verifies the object exists in the bucket with the declared size and
-- content type (what Storage recorded, not what the client claims), then records metadata.
create function public.create_document(
  p_team_id uuid default null, p_club_id uuid default null, p_title text default null, p_description text default null,
  p_category text default 'other', p_storage_path text default null, p_mime_type text default null,
  p_size_bytes bigint default null, p_visibility text default 'team_members', p_pinned boolean default false)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_obj storage.objects; v_prefix text;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if num_nonnulls(p_team_id, p_club_id) <> 1 or not private.is_issuer_manager(p_team_id, p_club_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_prefix := case when p_team_id is not null then 'team/' || p_team_id::text else 'club/' || p_club_id::text end || '/';
  if p_storage_path is null or left(p_storage_path, char_length(v_prefix)) <> v_prefix or not private.can_manage_document_path(p_storage_path) then
    raise exception 'invalid_storage_path' using errcode = '22023';
  end if;
  v_id := private.uuid_or_null(split_part(p_storage_path, '/', 3));
  select * into v_obj from storage.objects where bucket_id = 'documents' and name = p_storage_path;
  if not found then raise exception 'object_not_found' using errcode = 'P0002'; end if;
  if coalesce((v_obj.metadata ->> 'mimetype'), '') <> p_mime_type or coalesce((v_obj.metadata ->> 'size')::bigint, -1) <> p_size_bytes then
    raise exception 'object_mismatch' using errcode = '23514', detail = 'The uploaded file does not match its declared type or size.';
  end if;
  insert into public.documents (id, team_id, club_id, title, description, category, storage_path, mime_type, size_bytes,
    visibility, pinned, uploaded_by)
  values (v_id, p_team_id, p_club_id, btrim(p_title), nullif(btrim(p_description), ''), p_category, p_storage_path, p_mime_type,
    p_size_bytes, p_visibility, coalesce(p_pinned, false), (select auth.uid()));
  perform private.write_audit('document.create', 'documents', v_id, p_team_id, p_club_id, null,
    jsonb_build_object('category', p_category, 'visibility', p_visibility, 'mime_type', p_mime_type, 'size_bytes', p_size_bytes));
  return v_id;
end;
$$;

create function public.update_document(
  p_document_id uuid, p_title text, p_description text, p_category text, p_visibility text, p_pinned boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare d public.documents;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into d from public.documents where id = p_document_id for update;
  if not found or not private.is_issuer_manager(d.team_id, d.club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.documents set title = btrim(p_title), description = nullif(btrim(p_description), ''), category = p_category,
    visibility = p_visibility, pinned = coalesce(p_pinned, false)
  where id = p_document_id;
  perform private.write_audit('document.update', 'documents', p_document_id, d.team_id, d.club_id,
    jsonb_build_object('visibility', d.visibility, 'pinned', d.pinned), jsonb_build_object('visibility', p_visibility, 'pinned', p_pinned));
end;
$$;

create function public.archive_document(p_document_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare d public.documents;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into d from public.documents where id = p_document_id for update;
  if not found or not private.is_issuer_manager(d.team_id, d.club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.documents set archived_at = coalesce(archived_at, now()), pinned = false where id = p_document_id;
  perform private.write_audit('document.archive', 'documents', p_document_id, d.team_id, d.club_id, null, null);
end;
$$;

-- Documents the caller may see for a team or club (pinned first). Managers also see archived ones.
create function public.list_documents(p_team_id uuid default null, p_club_id uuid default null, p_include_archived boolean default false)
returns table (id uuid, title text, description text, category text, mime_type text, size_bytes bigint, visibility text,
               pinned boolean, storage_path text, uploaded_by_name text, created_at timestamptz, archived_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select d.id, d.title, d.description, d.category, d.mime_type, d.size_bytes, d.visibility, d.pinned, d.storage_path,
         p.display_name, d.created_at, d.archived_at
  from public.documents d
  left join public.profiles p on p.id = d.uploaded_by
  where (select auth.uid()) is not null
    and num_nonnulls(p_team_id, p_club_id) = 1
    and d.team_id is not distinct from p_team_id and d.club_id is not distinct from p_club_id
    and private.can_read_document(d.id)
    and (d.archived_at is null or (p_include_archived and private.is_issuer_manager(d.team_id, d.club_id)))
  order by d.pinned desc, d.created_at desc;
$$;

-- Waiver functions ------------------------------------------------------------------------------------------------------------
-- Core insert shared by the signed-in and service-role paths. Checks everything about the subject and version.
create function private.insert_waiver_acceptance(
  p_registration_id uuid, p_player_id uuid, p_waiver_version_id uuid, p_signer_name text, p_signer_relationship text,
  p_signer_email text, p_consent boolean, p_signer_profile_id uuid, p_ip inet, p_user_agent text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; r public.registrations; e public.registration_events; v_waiver uuid; v_team uuid;
begin
  if num_nonnulls(p_registration_id, p_player_id) <> 1 then raise exception 'invalid_subject' using errcode = '22023'; end if;
  if p_consent is not true then raise exception 'consent_required' using errcode = '23514'; end if;
  select waiver_id into v_waiver from public.waiver_versions where id = p_waiver_version_id;
  if v_waiver is null then raise exception 'waiver_not_found' using errcode = 'P0002'; end if;
  if p_registration_id is not null then
    select * into r from public.registrations where id = p_registration_id;
    if not found then raise exception 'registration_not_found' using errcode = 'P0002'; end if;
    if r.status in ('declined', 'withdrawn') then raise exception 'registration_closed' using errcode = '23514'; end if;
    select * into e from public.registration_events where id = r.registration_event_id;
    if not p_waiver_version_id = any (e.waiver_version_ids) then raise exception 'waiver_not_part_of_event' using errcode = '23514'; end if;
    v_team := e.team_id;
  else
    -- A rostered player's waiver: it must be required by a team they are actively on, and the CURRENT version.
    if not exists (select 1 from public.team_players tp join public.team_required_waivers rw on rw.team_id = tp.team_id
                   where tp.player_id = p_player_id and tp.status = 'active' and rw.waiver_id = v_waiver) then
      raise exception 'waiver_not_required' using errcode = '23514';
    end if;
    select tp.team_id into v_team from public.team_players tp join public.team_required_waivers rw on rw.team_id = tp.team_id
      where tp.player_id = p_player_id and tp.status = 'active' and rw.waiver_id = v_waiver limit 1;
    if p_waiver_version_id <> (select v.id from public.waiver_versions v where v.waiver_id = v_waiver order by v.version desc limit 1) then
      raise exception 'waiver_version_outdated' using errcode = '23514';
    end if;
  end if;
  insert into public.waiver_acceptances (registration_id, player_id, waiver_version_id, signer_name, signer_relationship,
    signer_profile_id, signer_email, electronic_consent)
  values (p_registration_id, p_player_id, p_waiver_version_id, p_signer_name, p_signer_relationship, p_signer_profile_id,
    p_signer_email, true)
  returning id into v_id;
  if p_ip is not null or p_user_agent is not null then
    insert into public.waiver_acceptance_evidence (acceptance_id, ip_address, user_agent) values (v_id, p_ip, left(p_user_agent, 400));
  end if;
  perform private.write_audit('waiver.accept', 'waiver_acceptances', v_id,
    v_team, null, null,
    jsonb_build_object('waiver_version_id', p_waiver_version_id, 'registration_id', p_registration_id, 'player_id', p_player_id));
  return v_id;
end;
$$;

-- A signed-in guardian signs for their own registration, or for their own rostered child.
create function public.record_waiver_acceptance(
  p_waiver_version_id uuid, p_signer_name text, p_signer_relationship text, p_signer_email text, p_consent boolean,
  p_registration_id uuid default null, p_player_id uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_registration_id is not null and not private.is_registration_family(p_registration_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_player_id is not null and not private.is_guardian_of(p_player_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if num_nonnulls(p_registration_id, p_player_id) <> 1 then raise exception 'invalid_subject' using errcode = '22023'; end if;
  return private.insert_waiver_acceptance(p_registration_id, p_player_id, p_waiver_version_id, p_signer_name,
    p_signer_relationship, p_signer_email, p_consent, (select auth.uid()), null, null);
end;
$$;

-- Edge Function (service role) path for registrants who verified by email but have no account.
create function public.svc_record_waiver_acceptance(
  p_registration_id uuid, p_waiver_version_id uuid, p_signer_name text, p_signer_relationship text, p_signer_email text,
  p_consent boolean, p_ip inet default null, p_user_agent text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.registrations r where r.id = p_registration_id and r.status = 'pending_verification') then
    raise exception 'verification_required' using errcode = '23514';
  end if;
  return private.insert_waiver_acceptance(p_registration_id, null, p_waiver_version_id, p_signer_name, p_signer_relationship,
    p_signer_email, p_consent, null, p_ip, p_user_agent);
end;
$$;

-- Set-once: record where the generated PDF lives (the only change an acceptance ever allows).
create function public.svc_attach_signed_copy(p_acceptance_id uuid, p_path text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.waiver_acceptances set signed_copy_path = p_path where id = p_acceptance_id and signed_copy_path is null;
  if not found then raise exception 'copy_already_attached' using errcode = '23514'; end if;
end;
$$;

-- Per rostered player and required waiver: is there a CURRENT acceptance?
--   current  = accepted the latest published version, and (no expiry or not yet expired)
--   outdated = accepted an older version     expired = past requires_resign_after_days     missing = none
create function public.waiver_compliance(p_team_id uuid)
returns table (player_id uuid, first_name text, last_name text, jersey_number smallint, waiver_id uuid,
               waiver_title text, status text, accepted_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select tp.player_id, p.first_name, p.last_name, tp.jersey_number, w.id, w.title,
         case when a.id is null then 'missing'
              when a.waiver_version_id <> lv.id then 'outdated'
              when av.requires_resign_after_days is not null
                   and a.accepted_at + make_interval(days => av.requires_resign_after_days) < now() then 'expired'
              else 'current' end,
         a.accepted_at,
         case when a.id is not null and av.requires_resign_after_days is not null
              then a.accepted_at + make_interval(days => av.requires_resign_after_days) end
  from public.team_players tp
  join public.players p on p.id = tp.player_id
  join public.team_required_waivers rw on rw.team_id = tp.team_id
  join public.waivers w on w.id = rw.waiver_id
  cross join lateral (select v.id from public.waiver_versions v where v.waiver_id = w.id order by v.version desc limit 1) lv
  left join lateral (
    select ac.* from public.waiver_acceptances ac
    join public.waiver_versions v2 on v2.id = ac.waiver_version_id and v2.waiver_id = w.id
    where ac.player_id = tp.player_id
       or exists (select 1 from public.registrations r where r.id = ac.registration_id and r.player_id = tp.player_id)
    order by ac.accepted_at desc limit 1) a on true
  left join public.waiver_versions av on av.id = a.waiver_version_id
  where tp.team_id = p_team_id and tp.status = 'active'
    and (select auth.uid()) is not null and private.is_team_staff(p_team_id)
  order by p.last_name, p.first_name, w.title;
$$;

-- Execute grants --------------------------------------------------------------------------------------------------------------------
revoke execute on function
  private.guard_waiver_acceptance(), private.guard_waiver_acceptance_truncate(), private.guard_document(),
  private.is_team_family(uuid), private.can_read_document(uuid), private.can_read_acceptance(uuid),
  private.can_read_acceptance_evidence(uuid), private.can_read_waiver_version_extended(uuid),
  private.can_read_form_version_extended(uuid), private.uuid_or_null(text), private.can_manage_document_path(text),
  private.can_manage_cover_path(text), private.can_read_cover_path(text),
  private.insert_waiver_acceptance(uuid, uuid, uuid, text, text, text, boolean, uuid, inet, text)
  from public, anon, authenticated;
grant execute on function private.is_team_family(uuid), private.can_read_document(uuid), private.can_read_acceptance(uuid),
  private.can_read_acceptance_evidence(uuid), private.can_read_waiver_version_extended(uuid),
  private.can_read_form_version_extended(uuid), private.uuid_or_null(text), private.can_manage_document_path(text),
  private.can_manage_cover_path(text), private.can_read_cover_path(text) to authenticated;

revoke execute on function
  public.create_document(uuid, uuid, text, text, text, text, text, bigint, text, boolean),
  public.update_document(uuid, text, text, text, text, boolean), public.archive_document(uuid),
  public.list_documents(uuid, uuid, boolean), public.record_waiver_acceptance(uuid, text, text, text, boolean, uuid, uuid),
  public.svc_record_waiver_acceptance(uuid, uuid, text, text, text, boolean, inet, text),
  public.svc_attach_signed_copy(uuid, text), public.waiver_compliance(uuid)
  from public, anon, authenticated;
grant execute on function
  public.create_document(uuid, uuid, text, text, text, text, text, bigint, text, boolean),
  public.update_document(uuid, text, text, text, text, boolean), public.archive_document(uuid),
  public.list_documents(uuid, uuid, boolean), public.record_waiver_acceptance(uuid, text, text, text, boolean, uuid, uuid),
  public.waiver_compliance(uuid)
  to authenticated;
grant usage on schema private to service_role;
grant execute on function public.svc_record_waiver_acceptance(uuid, uuid, text, text, text, boolean, inet, text),
  public.svc_attach_signed_copy(uuid, text) to service_role;
