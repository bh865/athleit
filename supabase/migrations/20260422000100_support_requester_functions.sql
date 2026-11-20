-- Support center (2/3): shared helpers and the signed-in requester functions.
-- All security definer, search_path = '', rate limited with private.hit_rate_limit, ownership checked by requester_profile_id.

-- Helpers ----------------------------------------------------------------------------------------------
create function private.support_event(p_request uuid, p_actor uuid, p_kind text, p_before jsonb, p_after jsonb)
returns void language sql security definer set search_path = ''
as $$ insert into public.support_events (request_id, actor_id, kind, before, after) values (p_request, p_actor, p_kind, p_before, p_after); $$;

-- Enqueue the in-app row, the push and the email for a signed-in requester (retry and preferences live in deliver-notifications;
-- support email is transactional and is never silenced by a preference, push is).
create function private.support_notify_requester(p_request uuid, p_message uuid, p_title text, p_body text)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  select * into r from public.support_requests where id = p_request;
  if r.requester_profile_id is null then return; end if;
  insert into public.notification_outbox (profile_id, category, channel, payload, dedupe_key)
  select r.requester_profile_id, 'support', ch,
         jsonb_build_object('kind', 'support', 'title', p_title, 'body', left(p_body, 200), 'ref', r.ref),
         'support:' || p_message::text || ':' || ch
  from unnest(array['in_app', 'push', 'email']) ch
  on conflict (dedupe_key) do nothing;
end;
$$;

-- Days a solved ticket can still be replied to or reopened.
create function private.support_reopen_open(r public.support_requests)
returns boolean language sql stable security definer set search_path = ''
as $$
  select r.status = 'solved' and r.solved_at > now() - make_interval(days => private.setting_int('support.reopen_days'));
$$;

create function private.support_unread(r public.support_requests)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.support_messages m
    where m.request_id = r.id and m.author_kind = 'staff' and not m.internal
      and m.created_at > coalesce(r.requester_read_at, '-infinity'::timestamptz));
$$;

create function private.support_own(p_ref text)
returns public.support_requests language plpgsql stable security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into r from public.support_requests where ref = upper(btrim(p_ref)) and requester_profile_id = (select auth.uid());
  if not found then raise exception 'unknown_request' using errcode = 'P0002'; end if;
  return r;
end;
$$;

-- Create ---------------------------------------------------------------------------------------------------------
-- Attachments are uploaded after this returns (the storage policy needs the request id) and recorded by the
-- finalize-support-attachments Edge Function, which checks size, mime and magic bytes.
create function public.create_support_request(
  p_type text, p_subject text, p_body text, p_team_id uuid, p_club_id uuid,
  p_source_article text, p_source_route text, p_diagnostics jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := (select auth.uid()); v_id uuid; v_ref text; v_msg uuid; v_diag jsonb := coalesce(p_diagnostics, '{}');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_type not in ('question', 'problem', 'billing', 'feedback') then raise exception 'invalid_type' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 1 and 120 then raise exception 'invalid_subject' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 5000 then raise exception 'invalid_body' using errcode = '22023'; end if;
  if p_team_id is not null and not private.is_team_member(p_team_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_club_id is not null and not private.is_club_member(p_club_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not private.hit_rate_limit('support:create:' || v_uid::text, 5, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into public.support_requests (type, subject, requester_profile_id, requester_email, requester_name, team_id, club_id,
      source_article, source_route, diagnostics, feedback_status)
    values (p_type, btrim(p_subject), v_uid, (select email from auth.users where id = v_uid),
      (select display_name from public.profiles where id = v_uid), p_team_id, p_club_id,
      left(p_source_article, 120), left(p_source_route, 200), v_diag, case when p_type = 'feedback' then 'new' end)
    returning id, ref into v_id, v_ref;
  insert into public.support_messages (request_id, author_kind, author_profile_id, body)
    values (v_id, 'requester', v_uid, btrim(p_body)) returning id into v_msg;
  perform private.support_event(v_id, v_uid, 'created', null, jsonb_build_object('type', p_type));
  return jsonb_build_object('id', v_id, 'ref', v_ref, 'message_id', v_msg);
end;
$$;

-- Reply ------------------------------------------------------------------------------------------------------------
create function public.reply_to_support_request(p_ref text, p_body text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests; v_msg uuid; v_old text;
begin
  r := private.support_own(p_ref);
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 5000 then raise exception 'invalid_body' using errcode = '22023'; end if;
  if r.status = 'closed' or (r.status = 'solved' and not private.support_reopen_open(r)) then
    raise exception 'request_closed' using errcode = '22023';
  end if;
  if not private.hit_rate_limit('support:reply:' || r.requester_profile_id::text, 30, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into public.support_messages (request_id, author_kind, author_profile_id, body)
    values (r.id, 'requester', r.requester_profile_id, btrim(p_body)) returning id into v_msg;
  v_old := r.status;
  update public.support_requests set
    status = case when status in ('waiting_on_requester', 'solved', 'open') then 'open' else status end,
    solved_at = case when status = 'solved' then null else solved_at end,
    reopened_count = reopened_count + case when status = 'solved' then 1 else 0 end,
    last_activity_at = now(), last_requester_activity_at = now(), requester_read_at = now()
  where id = r.id;
  perform private.support_event(r.id, r.requester_profile_id, 'reply', jsonb_build_object('status', v_old), null);
  return v_msg;
end;
$$;

-- Lists and detail ---------------------------------------------------------------------------------------------------
create function public.get_my_support_requests(p_status text default null, p_cursor timestamptz default null, p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_uid uuid := (select auth.uid()); v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_status is not null and p_status not in ('open', 'waiting_on_requester', 'solved', 'closed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.last_activity_at desc) from (
      select r.ref, r.subject, r.type,
        -- the requester sees one "Open" for new and open
        case when r.status = 'new' then 'open' else r.status end as status,
        r.last_activity_at, private.support_unread(r) as unread
      from public.support_requests r
      where r.requester_profile_id = v_uid and r.merged_into is null and not r.spam
        and (p_cursor is null or r.last_activity_at < p_cursor)
        and (p_status is null or (case when r.status = 'new' then 'open' else r.status end) = p_status)
      order by r.last_activity_at desc limit v_limit) t), '[]'::jsonb),
    'unread_count', (select count(*) from public.support_requests r where r.requester_profile_id = v_uid and private.support_unread(r)));
end;
$$;

create function public.get_my_support_request(p_ref text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  r := private.support_own(p_ref);
  return jsonb_build_object(
    'ref', r.ref, 'type', r.type, 'subject', r.subject, 'held', r.held,
    'status', case when r.status = 'new' then 'open' else r.status end,
    'created_at', r.created_at, 'last_activity_at', r.last_activity_at, 'diagnostics', r.diagnostics,
    'satisfaction', r.satisfaction, 'can_reply', r.status <> 'closed' and (r.status <> 'solved' or private.support_reopen_open(r)),
    'can_reopen', private.support_reopen_open(r),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'author_kind', m.author_kind,
        'author_name', case m.author_kind when 'staff' then coalesce(split_part((select display_name from public.profiles p where p.id = m.author_profile_id), ' ', 1), 'Support') else null end,
        'body', case when m.redacted_at is not null then '[removed by Athleit Support]' else m.body end, 'created_at', m.created_at) order by m.created_at)
      from public.support_messages m where m.request_id = r.id and not m.internal), '[]'::jsonb),
    'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'message_id', a.message_id, 'file_name', a.file_name,
        'mime_type', a.mime_type, 'size_bytes', a.size_bytes, 'path', a.storage_path) order by a.created_at)
      from public.support_attachments a where a.request_id = r.id and a.deleted_at is null), '[]'::jsonb));
end;
$$;

create function public.mark_support_read(p_ref text)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  r := private.support_own(p_ref);
  update public.support_requests set requester_read_at = now() where id = r.id;
end;
$$;

-- Solve, reopen, rate -----------------------------------------------------------------------------------------------------
create function public.mark_support_request_solved(p_ref text)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  r := private.support_own(p_ref);
  if r.status not in ('new', 'open', 'waiting_on_requester') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.support_requests set status = 'solved', solved_at = now(), last_activity_at = now(), last_requester_activity_at = now() where id = r.id;
  insert into public.support_messages (request_id, author_kind, body) values (r.id, 'system', 'Marked solved by the requester');
  perform private.support_event(r.id, r.requester_profile_id, 'status', jsonb_build_object('status', r.status), jsonb_build_object('status', 'solved'));
end;
$$;

create function public.reopen_support_request(p_ref text)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  r := private.support_own(p_ref);
  if not private.support_reopen_open(r) then raise exception 'reopen_window_passed' using errcode = '22023'; end if;
  update public.support_requests set status = 'open', solved_at = null, reopened_count = reopened_count + 1,
    last_activity_at = now(), last_requester_activity_at = now() where id = r.id;
  insert into public.support_messages (request_id, author_kind, body) values (r.id, 'system', 'Reopened by the requester');
  perform private.support_event(r.id, r.requester_profile_id, 'reopen', jsonb_build_object('status', 'solved'), jsonb_build_object('status', 'open'));
end;
$$;

create function public.rate_support_request(p_ref text, p_satisfaction text, p_comment text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  r := private.support_own(p_ref);
  if p_satisfaction not in ('yes', 'no') then raise exception 'invalid_satisfaction' using errcode = '22023'; end if;
  if r.status not in ('solved', 'closed') or r.solved_at is null and r.closed_at is null then raise exception 'not_solved' using errcode = '22023'; end if;
  if char_length(coalesce(p_comment, '')) > 1000 then raise exception 'invalid_comment' using errcode = '22023'; end if;
  update public.support_requests set satisfaction = p_satisfaction, satisfaction_comment = nullif(btrim(p_comment), '') where id = r.id;
  perform private.support_event(r.id, r.requester_profile_id, 'satisfaction', null, jsonb_build_object('satisfaction', p_satisfaction));
end;
$$;

-- Grants ------------------------------------------------------------------------------------------------------------------------------
revoke execute on function private.support_event(uuid, uuid, text, jsonb, jsonb), private.support_notify_requester(uuid, uuid, text, text),
  private.support_reopen_open(public.support_requests), private.support_unread(public.support_requests), private.support_own(text)
  from public, anon, authenticated;
grant execute on function private.support_event(uuid, uuid, text, jsonb, jsonb), private.support_notify_requester(uuid, uuid, text, text),
  private.support_reopen_open(public.support_requests), private.support_unread(public.support_requests), private.support_own(text) to service_role;
revoke execute on function
  public.create_support_request(text, text, text, uuid, uuid, text, text, jsonb), public.reply_to_support_request(text, text),
  public.get_my_support_requests(text, timestamptz, integer), public.get_my_support_request(text), public.mark_support_read(text),
  public.mark_support_request_solved(text), public.reopen_support_request(text), public.rate_support_request(text, text, text)
  from public, anon;
grant execute on function
  public.create_support_request(text, text, text, uuid, uuid, text, text, jsonb), public.reply_to_support_request(text, text),
  public.get_my_support_requests(text, timestamptz, integer), public.get_my_support_request(text), public.mark_support_read(text),
  public.mark_support_request_solved(text), public.reopen_support_request(text), public.rate_support_request(text, text, text)
  to authenticated;
