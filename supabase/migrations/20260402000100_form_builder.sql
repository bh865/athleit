-- Form builder: two optional per-question settings (placeholder text and half/full width) and a way to archive
-- forms. Existing forms are untouched: both new keys are optional, so every stored schema stays valid.

create or replace function private.validate_form_schema(p_schema jsonb)
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
  v_sens text[] := '{}';
  v_types constant text[] := array['short_text', 'long_text', 'email', 'phone', 'number', 'date',
    'single_choice', 'multiple_choice', 'dropdown', 'checkbox', 'consent_checkbox', 'address'];
  v_field_keys constant text[] := array['id', 'type', 'label', 'help', 'required', 'options', 'validation', 'show_if', 'sensitive', 'placeholder', 'width'];
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
    if v_field ? 'placeholder' and (jsonb_typeof(v_field -> 'placeholder') <> 'string' or char_length(v_field ->> 'placeholder') > 120) then
      raise exception 'invalid_field' using errcode = '23514';
    end if;
    if v_field ? 'width' and (jsonb_typeof(v_field -> 'width') <> 'string' or (v_field ->> 'width') not in ('half', 'full')) then
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
        if private.is_forbidden_field_text(v_opt ->> 'label') then
          raise exception 'forbidden_field' using errcode = '23514';
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
      -- An ordinary field shown only when a SENSITIVE answer is given would reveal that answer to anyone who reads ordinary answers.
      if jsonb_typeof(v_show) = 'object' and (v_show ->> 'field') = any (v_sens)
         and coalesce((v_field ->> 'sensitive')::boolean, false) = false then
        raise exception 'show_if_leaks_sensitive' using errcode = '23514';
      end if;
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
    if coalesce((v_field ->> 'sensitive')::boolean, false) then v_sens := v_sens || v_id; end if;
    v_ids := v_ids || v_id;
  end loop;
end;
$$;

-- Archiving hides a form from the library and from the registration form picker. Published versions are
-- immutable and registrations keep pointing at them, so nothing a parent already saw changes.
create function public.archive_form(p_form_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare f public.forms;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into f from public.forms where id = p_form_id for update;
  if not found or not private.is_issuer_manager(f.team_id, f.club_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.forms set archived_at = coalesce(archived_at, now()) where id = p_form_id;
end;
$$;

create function public.unarchive_form(p_form_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare f public.forms;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into f from public.forms where id = p_form_id for update;
  if not found or not private.is_issuer_manager(f.team_id, f.club_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.forms set archived_at = null where id = p_form_id;
end;
$$;

revoke execute on function public.archive_form(uuid), public.unarchive_form(uuid) from public, anon, authenticated;
grant execute on function public.archive_form(uuid), public.unarchive_form(uuid) to authenticated;
