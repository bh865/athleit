-- Phase 3 (4/6): message functions
-- send/edit/delete/hide/report/review/read/react. All SECURITY DEFINER, pinned search_path,
-- authenticated only. Soft delete only: delete and hide empty the body and keep the original in
-- audit_log.before, which only team admins can read.

-- Attachments and reactions of a removed message disappear for everyone except team admins.
create function private.can_read_message_content(p_message_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.messages m join public.threads t on t.id = m.thread_id
    where m.id = p_message_id and private.can_read_message(m.thread_id, m.created_at)
      and ((m.deleted_at is null and m.hidden_at is null)
           or private.has_team_role(t.team_id, array['admin']::public.team_role[])));
$$;
revoke execute on function private.can_read_message_content(uuid) from public, anon, authenticated;
grant execute on function private.can_read_message_content(uuid) to authenticated;

drop policy "Read attachments of messages you can read" on public.message_attachments;
create policy "Read attachments of messages you can read" on public.message_attachments
  for select to authenticated using (private.can_read_message_content(message_id));

create function public.send_message(
  p_thread_id uuid, p_body text, p_reply_to uuid default null, p_attachments jsonb default '[]')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  t public.threads;
  v_body text := btrim(coalesce(p_body, ''));
  v_atts jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_id uuid;
  a jsonb;
  v_path text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into t from public.threads where id = p_thread_id;
  if t.id is null or not private.can_read_thread(p_thread_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if t.archived_at is not null then raise exception 'thread_archived' using errcode = 'P0001'; end if;
  if not private.can_post_thread(p_thread_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(v_body) > 4000 then raise exception 'body_too_long' using errcode = '23514'; end if;
  if jsonb_typeof(v_atts) <> 'array' or jsonb_array_length(v_atts) > 5 then
    raise exception 'invalid_attachments' using errcode = '23514';
  end if;
  if v_body = '' and jsonb_array_length(v_atts) = 0 then raise exception 'empty_message' using errcode = '23514'; end if;
  -- Simple per-user rate limit: at most 30 messages per rolling minute.
  if (select count(*) from public.messages m
      where m.sender_profile_id = v_uid and m.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if p_reply_to is not null and not exists (
      select 1 from public.messages r where r.id = p_reply_to and r.thread_id = p_thread_id) then
    raise exception 'invalid_reply_to' using errcode = 'P0001';
  end if;

  insert into public.messages (thread_id, sender_profile_id, body, reply_to_id)
    values (p_thread_id, v_uid, v_body, p_reply_to) returning id into v_id;

  for a in select * from jsonb_array_elements(v_atts) loop
    v_path := a ->> 'storage_path';
    if v_path is null or split_part(v_path, '/', 1) <> p_thread_id::text
       or not exists (select 1 from storage.objects o
                      where o.bucket_id = 'message-attachments' and o.name = v_path) then
      raise exception 'invalid_attachment_path' using errcode = 'P0001';
    end if;
    insert into public.message_attachments (message_id, storage_path, mime_type, size_bytes)
      values (v_id, v_path, a ->> 'mime_type', (a ->> 'size_bytes')::bigint);
  end loop;

  update public.threads set last_message_at = now() where id = p_thread_id;
  -- Sending implies having read up to here.
  insert into public.message_reads (thread_id, profile_id, last_read_message_id)
    values (p_thread_id, v_uid, v_id)
    on conflict (thread_id, profile_id) do update
      set last_read_message_id = excluded.last_read_message_id, last_read_at = now();
  return v_id;
end;
$$;

create function public.edit_message(p_message_id uuid, p_body text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  m public.messages;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into m from public.messages where id = p_message_id;
  if m.id is null or m.sender_profile_id is distinct from v_uid
     or not private.can_post_thread(m.thread_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if m.deleted_at is not null or m.hidden_at is not null then raise exception 'message_removed' using errcode = 'P0001'; end if;
  if v_body = '' or char_length(v_body) > 4000 then raise exception 'invalid_body' using errcode = '23514'; end if;
  update public.messages set body = v_body, edited_at = now() where id = p_message_id;
end;
$$;

create function public.delete_message(p_message_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  m public.messages;
  v_team uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into m from public.messages where id = p_message_id;
  if m.id is null or m.sender_profile_id is distinct from v_uid
     or not private.can_read_message(m.thread_id, m.created_at) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if m.deleted_at is not null or m.hidden_at is not null then return; end if;
  select team_id into v_team from public.threads where id = m.thread_id;
  update public.messages set body = '', deleted_at = now() where id = p_message_id;
  perform private.write_audit('message.delete', 'messages', p_message_id, v_team, null,
    jsonb_build_object('body', m.body, 'thread_id', m.thread_id, 'sender', m.sender_profile_id), null);
end;
$$;

create function public.hide_message(p_message_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  m public.messages;
  v_team uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into m from public.messages where id = p_message_id;
  if m.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select team_id into v_team from public.threads where id = m.thread_id;
  if not private.is_team_staff(v_team) or not private.can_read_message(m.thread_id, m.created_at) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if m.hidden_at is not null then return; end if;
  update public.messages set body = '', hidden_by = v_uid, hidden_at = now() where id = p_message_id;
  perform private.write_audit('message.hide', 'messages', p_message_id, v_team, null,
    jsonb_build_object('body', m.body, 'thread_id', m.thread_id, 'sender', m.sender_profile_id),
    jsonb_build_object('reason', left(coalesce(p_reason, ''), 500)));
end;
$$;

-- Team admins only: the original text of a hidden or deleted message.
create function public.get_hidden_message(p_message_id uuid)
returns table (body text, sender_profile_id uuid, removed_by uuid, removed_at timestamptz, how text)
language sql stable security definer set search_path = ''
as $$
  select a.before ->> 'body', (a.before ->> 'sender')::uuid, a.actor_id, a.created_at,
         case a.action when 'message.hide' then 'hidden' else 'deleted' end
  from public.audit_log a
  where a.target_id = p_message_id and a.action in ('message.hide', 'message.delete')
    and a.team_id is not null and private.has_team_role(a.team_id, array['admin']::public.team_role[])
  order by a.created_at desc, a.id desc
  limit 1;
$$;

create function public.report_message(p_message_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  m public.messages;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into m from public.messages where id = p_message_id;
  if m.id is null or not private.can_read_message(m.thread_id, m.created_at) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if m.sender_profile_id = v_uid then raise exception 'cannot_report_own_message' using errcode = 'P0001'; end if;
  if v_reason = '' or char_length(v_reason) > 500 then raise exception 'invalid_reason' using errcode = '23514'; end if;
  insert into public.message_reports (message_id, reporter_profile_id, reason)
    values (p_message_id, v_uid, v_reason) returning id into v_id;
  return v_id;
end;
$$;

create function public.review_report(p_report_id uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r public.message_reports;
  v_team uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_status not in ('actioned', 'dismissed') then raise exception 'invalid_status' using errcode = '23514'; end if;
  select * into r from public.message_reports where id = p_report_id;
  if r.id is null or not private.is_staff_of_message(r.message_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.message_reports set status = p_status, reviewed_by = v_uid, reviewed_at = now() where id = p_report_id;
  select t.team_id into v_team from public.messages m join public.threads t on t.id = m.thread_id where m.id = r.message_id;
  perform private.write_audit('message.report_review', 'message_reports', p_report_id, v_team, null,
    jsonb_build_object('status', r.status), jsonb_build_object('status', p_status));
end;
$$;

-- Read pointer only moves forward.
create function public.mark_thread_read(p_thread_id uuid, p_message_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  m public.messages;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into m from public.messages where id = p_message_id and thread_id = p_thread_id;
  if m.id is null or not private.can_read_message(m.thread_id, m.created_at) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.message_reads (thread_id, profile_id, last_read_message_id)
    values (p_thread_id, v_uid, p_message_id)
    on conflict (thread_id, profile_id) do update
      set last_read_message_id = excluded.last_read_message_id, last_read_at = now()
      where public.message_reads.last_read_message_id is null
         or m.created_at >= (select p.created_at from public.messages p
                             where p.id = public.message_reads.last_read_message_id);
end;
$$;

-- Returns true when the reaction was added, false when it was removed.
create function public.toggle_reaction(p_message_id uuid, p_emoji text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  m public.messages;
  v_rows int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into m from public.messages where id = p_message_id;
  if m.id is null or not private.can_read_message(m.thread_id, m.created_at)
     or m.deleted_at is not null or m.hidden_at is not null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.message_reactions where message_id = p_message_id and profile_id = v_uid and emoji = p_emoji;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then return false; end if;
  insert into public.message_reactions (message_id, profile_id, emoji, thread_id)
    values (p_message_id, v_uid, p_emoji, m.thread_id);
  return true;
end;
$$;

revoke execute on function
  public.send_message(uuid, text, uuid, jsonb), public.edit_message(uuid, text), public.delete_message(uuid),
  public.hide_message(uuid, text), public.get_hidden_message(uuid), public.report_message(uuid, text),
  public.review_report(uuid, text), public.mark_thread_read(uuid, uuid), public.toggle_reaction(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.send_message(uuid, text, uuid, jsonb), public.edit_message(uuid, text), public.delete_message(uuid),
  public.hide_message(uuid, text), public.get_hidden_message(uuid), public.report_message(uuid, text),
  public.review_report(uuid, text), public.mark_thread_read(uuid, uuid), public.toggle_reaction(uuid, text)
  to authenticated;
