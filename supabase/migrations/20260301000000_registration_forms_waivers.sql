-- Phase 5 (A1): forms, form versions, waivers, waiver versions, required waivers
--
-- Published forms and waivers are IMMUTABLE VERSIONS. A mutable `draft_*` column lives on the parent
-- row; publishing copies it into a new, never-changing version row (triggers block UPDATE and DELETE
-- on versions, even for the service role). Registrations and signatures keep pointing at the version
-- they used. Clients only READ; every write is a SECURITY DEFINER function that checks the role and
-- writes an audit entry.
--
-- Helpers (private schema, SECURITY DEFINER, pinned search_path):
--   is_issuer_manager(team, club): team admin or manager, or a club admin (club-issued)
--   is_issuer_staff(team, club)  : (Phase 4) team staff incl. coaches, or a club admin

-- Issuer helpers -----------------------------------------------------------------------------
create function private.is_issuer_manager(p_team_id uuid, p_club_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case
    when p_team_id is not null then private.has_team_role(p_team_id, array['admin', 'manager']::public.team_role[])
    when p_club_id is not null then private.is_club_admin(p_club_id)
    else false end;
$$;

-- Words that must never be asked for in a form (government ids, SSNs, card data).
create function private.is_forbidden_field_text(p_text text)
returns boolean language sql immutable set search_path = ''
as $$
  select coalesce(
    regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g')
      ~ '\m(ssn|social security|social sec|passport|drivers? licen[sc]e|driver s licen[sc]e|driving licen[sc]e|government id|govt id|national id|tax id|taxpayer|credit card|debit card|card number|cvv|cvc|routing number|bank account|iban)\M',
    false);
$$;

-- Form schema validator -----------------------------------------------------------------------
-- Mirrors packages/core (Zod). The database is the authority: whatever path writes a draft or a
-- version, this runs. Raises 23514 with a short machine code in the message.
create function private.validate_form_schema(p_schema jsonb)
returns void language plpgsql immutable set search_path = ''
as $$
declare
  v_field jsonb;
  v_ids text[] := '{}';
  v_id text;
  v_type text;
  v_key text;
  v_opt jsonb;
  v_show jsonb;
  v_vkey text;
  v_types constant text[] := array['short_text', 'long_text', 'email', 'phone', 'number', 'date',
    'single_choice', 'multiple_choice', 'dropdown', 'checkbox', 'consent_checkbox', 'address'];
  v_field_keys constant text[] := array['id', 'type', 'label', 'help', 'required', 'options', 'validation', 'show_if', 'sensitive'];
  v_vkeys constant text[] := array['min_length', 'max_length', 'min', 'max', 'pattern'];
begin
  if p_schema is null or coalesce(jsonb_typeof(p_schema), '') <> 'object'
     or coalesce(jsonb_typeof(p_schema -> 'fields'), '') <> 'array' then
    raise exception 'invalid_form_schema' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_object_keys(p_schema) k where k <> 'fields') then
    raise exception 'invalid_form_schema' using errcode = '23514', detail = 'Unknown top-level key.';
  end if;
  if jsonb_array_length(p_schema -> 'fields') > 60 or octet_length(p_schema::text) > 100000 then
    raise exception 'form_too_large' using errcode = '23514';
  end if;

  for v_field in select value from jsonb_array_elements(p_schema -> 'fields') loop
    if jsonb_typeof(v_field) <> 'object' then raise exception 'invalid_field' using errcode = '23514'; end if;
    for v_key in select jsonb_object_keys(v_field) loop
      if not v_key = any (v_field_keys) then
        raise exception 'invalid_field' using errcode = '23514', detail = 'Unknown field key ' || left(v_key, 40);
      end if;
    end loop;
    v_id := v_field ->> 'id';
    v_type := v_field ->> 'type';
    if coalesce(jsonb_typeof(v_field -> 'id'), '') <> 'string' or v_id !~ '^[a-z][a-z0-9_]{0,39}$' then
      raise exception 'invalid_field_id' using errcode = '23514';
    end if;
    if v_id = any (v_ids) then raise exception 'duplicate_field_id' using errcode = '23514'; end if;
    if coalesce(jsonb_typeof(v_field -> 'type'), '') <> 'string' or not v_type = any (v_types) then
      raise exception 'invalid_field_type' using errcode = '23514', detail = 'File uploads are not supported.';
    end if;
    if coalesce(jsonb_typeof(v_field -> 'label'), '') <> 'string' or char_length(btrim(v_field ->> 'label')) not between 1 and 200 then
      raise exception 'invalid_field_label' using errcode = '23514';
    end if;
    if v_field ? 'help' and (jsonb_typeof(v_field -> 'help') <> 'string' or char_length(v_field ->> 'help') > 500) then
      raise exception 'invalid_field_help' using errcode = '23514';
    end if;
    if private.is_forbidden_field_text(v_field ->> 'label') or private.is_forbidden_field_text(v_field ->> 'help') then
      raise exception 'forbidden_field' using errcode = '23514',
        detail = 'Forms cannot ask for government ID numbers, Social Security numbers or card data.';
    end if;
    if v_field ? 'required' and jsonb_typeof(v_field -> 'required') <> 'boolean' then
      raise exception 'invalid_field' using errcode = '23514';
    end if;
    if v_field ? 'sensitive' and jsonb_typeof(v_field -> 'sensitive') <> 'boolean' then
      raise exception 'invalid_field' using errcode = '23514';
    end if;

    if v_type in ('single_choice', 'multiple_choice', 'dropdown') then
      if coalesce(jsonb_typeof(v_field -> 'options'), '') <> 'array' or jsonb_array_length(v_field -> 'options') not between 1 and 50 then
        raise exception 'invalid_options' using errcode = '23514';
      end if;
      for v_opt in select value from jsonb_array_elements(v_field -> 'options') loop
        if jsonb_typeof(v_opt) <> 'object' or coalesce(jsonb_typeof(v_opt -> 'value'), '') <> 'string'
           or coalesce(jsonb_typeof(v_opt -> 'label'), '') <> 'string'
           or char_length(btrim(v_opt ->> 'value')) not between 1 and 100
           or char_length(btrim(v_opt ->> 'label')) not between 1 and 100
           or exists (select 1 from jsonb_object_keys(v_opt) k where k not in ('value', 'label')) then
          raise exception 'invalid_options' using errcode = '23514';
        end if;
      end loop;
      if (select count(distinct o ->> 'value') from jsonb_array_elements(v_field -> 'options') o)
         <> jsonb_array_length(v_field -> 'options') then
        raise exception 'duplicate_option' using errcode = '23514';
      end if;
    elsif v_field ? 'options' then
      raise exception 'invalid_options' using errcode = '23514';
    end if;

    if v_field ? 'validation' then
      if jsonb_typeof(v_field -> 'validation') <> 'object' then raise exception 'invalid_validation' using errcode = '23514'; end if;
      for v_vkey in select jsonb_object_keys(v_field -> 'validation') loop
        if not v_vkey = any (v_vkeys) then raise exception 'invalid_validation' using errcode = '23514'; end if;
      end loop;
      -- Free-form regexes are a ReDoS risk: only length and numeric bounds are supported.
      if v_field -> 'validation' ? 'pattern' then raise exception 'invalid_validation' using errcode = '23514'; end if;
      for v_vkey in select jsonb_object_keys(v_field -> 'validation') loop
        if jsonb_typeof(v_field -> 'validation' -> v_vkey) <> 'number' then
          raise exception 'invalid_validation' using errcode = '23514';
        end if;
      end loop;
    end if;

    if v_field ? 'show_if' then
      v_show := v_field -> 'show_if';
      -- A condition may only look at an EARLIER field (no cycles, no forward references).
      if jsonb_typeof(v_show) <> 'object' or coalesce(jsonb_typeof(v_show -> 'field'), '') <> 'string'
         or not (v_show ->> 'field') = any (v_ids)
         or exists (select 1 from jsonb_object_keys(v_show) k where k not in ('field', 'equals', 'in'))
         or (v_show ? 'equals') = (v_show ? 'in') then
        raise exception 'invalid_show_if' using errcode = '23514';
      end if;
      if v_show ? 'in' and (jsonb_typeof(v_show -> 'in') <> 'array' or jsonb_array_length(v_show -> 'in') not between 1 and 50) then
        raise exception 'invalid_show_if' using errcode = '23514';
      end if;
      if v_show ? 'equals' and jsonb_typeof(v_show -> 'equals') not in ('string', 'number', 'boolean') then
        raise exception 'invalid_show_if' using errcode = '23514';
      end if;
    end if;
    v_ids := v_ids || v_id;
  end loop;
end;
$$;

-- forms / form_versions -------------------------------------------------------------------------
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete cascade,
  club_id uuid references public.clubs (id) on delete cascade,
  name text not null constraint forms_name_length check (char_length(btrim(name)) between 1 and 100),
  -- Mutable working copy for the builder. Published copies live in form_versions.
  draft_schema jsonb not null default '{"fields": []}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forms_one_owner check (num_nonnulls(team_id, club_id) = 1)
);
create index forms_team_id_idx on public.forms (team_id) where team_id is not null;
create index forms_club_id_idx on public.forms (club_id) where club_id is not null;
create index forms_created_by_idx on public.forms (created_by) where created_by is not null;
create trigger forms_set_updated_at before update on public.forms
  for each row execute function public.set_updated_at();

create function private.guard_form()
returns trigger language plpgsql set search_path = ''
as $$
begin
  perform private.validate_form_schema(new.draft_schema);
  if tg_op = 'UPDATE' and (new.team_id is distinct from old.team_id or new.club_id is distinct from old.club_id) then
    raise exception 'form_owner_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger forms_guard before insert or update on public.forms
  for each row execute function private.guard_form();

create table public.form_versions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete restrict,
  version integer not null constraint form_versions_version_positive check (version >= 1),
  schema jsonb not null,
  published_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz not null default now(),
  unique (form_id, version)
);
create index form_versions_published_by_idx on public.form_versions (published_by) where published_by is not null;

-- Immutability: a version never changes and is never deleted. Defense in depth for every writer.
create function private.guard_immutable_version()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'version_immutable' using errcode = '23514',
    detail = 'Published versions cannot be modified or deleted. Publish a new version instead.';
end;
$$;
create function private.guard_form_version_insert()
returns trigger language plpgsql set search_path = ''
as $$
begin
  perform private.validate_form_schema(new.schema);
  return new;
end;
$$;
create trigger form_versions_validate before insert on public.form_versions
  for each row execute function private.guard_form_version_insert();
create trigger form_versions_immutable before update or delete on public.form_versions
  for each row execute function private.guard_immutable_version();
create trigger form_versions_no_truncate before truncate on public.form_versions
  for each statement execute function private.guard_immutable_version();

-- waivers / waiver_versions ----------------------------------------------------------------------
create table public.waivers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete cascade,
  club_id uuid references public.clubs (id) on delete cascade,
  title text not null constraint waivers_title_length check (char_length(btrim(title)) between 1 and 150),
  -- Restricted markdown, never HTML. Working copy; published copies live in waiver_versions.
  draft_body text not null default '' constraint waivers_draft_body_length check (char_length(draft_body) <= 50000),
  draft_requires_resign_after_days integer
    constraint waivers_draft_resign_range check (draft_requires_resign_after_days between 1 and 3650),
  created_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waivers_one_owner check (num_nonnulls(team_id, club_id) = 1)
);
create index waivers_team_id_idx on public.waivers (team_id) where team_id is not null;
create index waivers_club_id_idx on public.waivers (club_id) where club_id is not null;
create index waivers_created_by_idx on public.waivers (created_by) where created_by is not null;
create trigger waivers_set_updated_at before update on public.waivers
  for each row execute function public.set_updated_at();

create table public.waiver_versions (
  id uuid primary key default gen_random_uuid(),
  waiver_id uuid not null references public.waivers (id) on delete restrict,
  version integer not null constraint waiver_versions_version_positive check (version >= 1),
  title text not null constraint waiver_versions_title_length check (char_length(btrim(title)) between 1 and 150),
  body text not null constraint waiver_versions_body_length check (char_length(btrim(body)) between 1 and 50000),
  -- sha256 of the body, hex. Proves which text a signer saw; verified by trigger on insert.
  content_hash text not null constraint waiver_versions_hash_format check (content_hash ~ '^[0-9a-f]{64}$'),
  requires_resign_after_days integer
    constraint waiver_versions_resign_range check (requires_resign_after_days between 1 and 3650),
  published_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz not null default now(),
  unique (waiver_id, version)
);
create index waiver_versions_published_by_idx on public.waiver_versions (published_by) where published_by is not null;

create function private.guard_waiver_version_insert()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.content_hash <> encode(extensions.digest(convert_to(new.body, 'UTF8'), 'sha256'), 'hex') then
    raise exception 'content_hash_mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger waiver_versions_validate before insert on public.waiver_versions
  for each row execute function private.guard_waiver_version_insert();
create trigger waiver_versions_immutable before update or delete on public.waiver_versions
  for each row execute function private.guard_immutable_version();
create trigger waiver_versions_no_truncate before truncate on public.waiver_versions
  for each statement execute function private.guard_immutable_version();

-- Waivers every rostered player of a team must have signed (feeds waiver_compliance).
create table public.team_required_waivers (
  team_id uuid not null references public.teams (id) on delete cascade,
  waiver_id uuid not null references public.waivers (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, waiver_id)
);
create index team_required_waivers_waiver_id_idx on public.team_required_waivers (waiver_id);
create index team_required_waivers_created_by_idx on public.team_required_waivers (created_by) where created_by is not null;

-- The waiver must belong to the team itself or to the club the team is linked to.
create function private.guard_team_required_waiver()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.waivers w
    join public.teams t on t.id = new.team_id
    where w.id = new.waiver_id
      and (w.team_id = t.id or (w.club_id is not null and w.club_id = t.club_id))) then
    raise exception 'waiver_wrong_owner' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger team_required_waivers_guard before insert on public.team_required_waivers
  for each row execute function private.guard_team_required_waiver();

-- Read helpers ------------------------------------------------------------------------------------
create function private.can_read_form_version(p_version_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.form_versions v join public.forms f on f.id = v.form_id
    where v.id = p_version_id and private.is_issuer_staff(f.team_id, f.club_id));
$$;

create function private.can_read_waiver_version(p_version_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.waiver_versions v join public.waivers w on w.id = v.waiver_id
    where v.id = p_version_id and private.is_issuer_staff(w.team_id, w.club_id));
$$;

-- RLS ------------------------------------------------------------------------------------------------
alter table public.forms enable row level security;
alter table public.form_versions enable row level security;
alter table public.waivers enable row level security;
alter table public.waiver_versions enable row level security;
alter table public.team_required_waivers enable row level security;
revoke all on public.forms, public.form_versions, public.waivers, public.waiver_versions,
  public.team_required_waivers from anon, authenticated;
grant select on public.forms, public.form_versions, public.waivers, public.waiver_versions,
  public.team_required_waivers to authenticated;

create policy "Issuer staff read forms" on public.forms
  for select to authenticated using (private.is_issuer_staff(team_id, club_id));
create policy "Issuer staff read form versions" on public.form_versions
  for select to authenticated using (private.can_read_form_version(id));
create policy "Issuer staff read waivers" on public.waivers
  for select to authenticated using (private.is_issuer_staff(team_id, club_id));
create policy "Waiver version readers read versions" on public.waiver_versions
  for select to authenticated using (private.can_read_waiver_version(id));
create policy "Team staff read required waivers" on public.team_required_waivers
  for select to authenticated using (private.is_team_staff(team_id));

-- Functions -------------------------------------------------------------------------------------------
create function public.create_form(
  p_team_id uuid default null, p_club_id uuid default null, p_name text default null,
  p_schema jsonb default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if num_nonnulls(p_team_id, p_club_id) <> 1 or not private.is_issuer_manager(p_team_id, p_club_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.forms (team_id, club_id, name, draft_schema, created_by)
  values (p_team_id, p_club_id, btrim(p_name), coalesce(p_schema, '{"fields": []}'::jsonb), (select auth.uid()))
  returning id into v_id;
  perform private.write_audit('form.create', 'forms', v_id, p_team_id, p_club_id, null,
    jsonb_build_object('name', btrim(p_name)));
  return v_id;
end;
$$;

create function public.save_form_draft(p_form_id uuid, p_schema jsonb, p_name text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare f public.forms;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into f from public.forms where id = p_form_id for update;
  if not found or not private.is_issuer_manager(f.team_id, f.club_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.forms set draft_schema = p_schema, name = coalesce(nullif(btrim(p_name), ''), name)
  where id = p_form_id;
end;
$$;

-- Publish the draft as the next immutable version. Returns the new version id.
create function public.publish_form_version(p_form_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare f public.forms; v_next integer; v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into f from public.forms where id = p_form_id for update;
  if not found or not private.is_issuer_manager(f.team_id, f.club_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if f.archived_at is not null then raise exception 'form_archived' using errcode = '23514'; end if;
  select coalesce(max(version), 0) + 1 into v_next from public.form_versions where form_id = p_form_id;
  insert into public.form_versions (form_id, version, schema, published_by)
  values (p_form_id, v_next, f.draft_schema, (select auth.uid()))
  returning id into v_id;
  perform private.write_audit('form.publish', 'form_versions', v_id, f.team_id, f.club_id, null,
    jsonb_build_object('form_id', p_form_id, 'version', v_next));
  return v_id;
end;
$$;

create function public.create_waiver(
  p_team_id uuid default null, p_club_id uuid default null, p_title text default null,
  p_body text default '', p_requires_resign_after_days integer default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if num_nonnulls(p_team_id, p_club_id) <> 1 or not private.is_issuer_manager(p_team_id, p_club_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.waivers (team_id, club_id, title, draft_body, draft_requires_resign_after_days, created_by)
  values (p_team_id, p_club_id, btrim(p_title), coalesce(p_body, ''), p_requires_resign_after_days, (select auth.uid()))
  returning id into v_id;
  perform private.write_audit('waiver.create', 'waivers', v_id, p_team_id, p_club_id, null,
    jsonb_build_object('title', btrim(p_title)));
  return v_id;
end;
$$;

create function public.save_waiver_draft(
  p_waiver_id uuid, p_title text, p_body text, p_requires_resign_after_days integer default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare w public.waivers;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into w from public.waivers where id = p_waiver_id for update;
  if not found or not private.is_issuer_manager(w.team_id, w.club_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.waivers set title = btrim(p_title), draft_body = coalesce(p_body, ''),
    draft_requires_resign_after_days = p_requires_resign_after_days
  where id = p_waiver_id;
end;
$$;

create function public.publish_waiver_version(p_waiver_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare w public.waivers; v_next integer; v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into w from public.waivers where id = p_waiver_id for update;
  if not found or not private.is_issuer_manager(w.team_id, w.club_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if w.archived_at is not null then raise exception 'waiver_archived' using errcode = '23514'; end if;
  if char_length(btrim(w.draft_body)) = 0 then raise exception 'empty_waiver' using errcode = '23514'; end if;
  select coalesce(max(version), 0) + 1 into v_next from public.waiver_versions where waiver_id = p_waiver_id;
  insert into public.waiver_versions (waiver_id, version, title, body, content_hash, requires_resign_after_days, published_by)
  values (p_waiver_id, v_next, w.title, w.draft_body,
          encode(extensions.digest(convert_to(w.draft_body, 'UTF8'), 'sha256'), 'hex'),
          w.draft_requires_resign_after_days, (select auth.uid()))
  returning id into v_id;
  perform private.write_audit('waiver.publish', 'waiver_versions', v_id, w.team_id, w.club_id, null,
    jsonb_build_object('waiver_id', p_waiver_id, 'version', v_next));
  return v_id;
end;
$$;

-- Mark a waiver as required (or not) for every rostered player of a team. Team admin/manager only.
create function public.set_team_required_waiver(p_team_id uuid, p_waiver_id uuid, p_required boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.is_issuer_manager(p_team_id, null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_required then
    insert into public.team_required_waivers (team_id, waiver_id, created_by)
    values (p_team_id, p_waiver_id, (select auth.uid())) on conflict do nothing;
  else
    delete from public.team_required_waivers where team_id = p_team_id and waiver_id = p_waiver_id;
  end if;
  perform private.write_audit('waiver.required', 'waivers', p_waiver_id, p_team_id, null, null,
    jsonb_build_object('required', p_required));
end;
$$;

-- Execute grants ---------------------------------------------------------------------------------------
revoke execute on function
  private.is_issuer_manager(uuid, uuid), private.is_forbidden_field_text(text), private.validate_form_schema(jsonb),
  private.guard_form(), private.guard_immutable_version(), private.guard_form_version_insert(),
  private.guard_waiver_version_insert(), private.guard_team_required_waiver(),
  private.can_read_form_version(uuid), private.can_read_waiver_version(uuid)
  from public, anon, authenticated;
grant execute on function private.is_issuer_manager(uuid, uuid), private.can_read_form_version(uuid),
  private.can_read_waiver_version(uuid) to authenticated;

revoke execute on function
  public.create_form(uuid, uuid, text, jsonb), public.save_form_draft(uuid, jsonb, text), public.publish_form_version(uuid),
  public.create_waiver(uuid, uuid, text, text, integer), public.save_waiver_draft(uuid, text, text, integer),
  public.publish_waiver_version(uuid), public.set_team_required_waiver(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function
  public.create_form(uuid, uuid, text, jsonb), public.save_form_draft(uuid, jsonb, text), public.publish_form_version(uuid),
  public.create_waiver(uuid, uuid, text, text, integer), public.save_waiver_draft(uuid, text, text, integer),
  public.publish_waiver_version(uuid), public.set_team_required_waiver(uuid, uuid, boolean)
  to authenticated;
