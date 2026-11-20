-- Support center (3/3): staff functions, the sweep, the public help values.
-- Reads and routine work [support]: private.assert_platform_admin('support'), no MFA, no reason, recorded in support_events.
-- Sensitive work [admin]: private.assert_platform_admin_write (aal2), a reason of 10+ characters, platform_audit_log.
-- Nothing here returns a message body from the app, a registration answer or card data: only what the requester wrote to us.

-- Signed-out requesters have no profile, so their emails are queued here and sent by the send-support-emails Edge Function.
create table public.support_email_queue (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests (id) on delete cascade,
  message_id uuid references public.support_messages (id) on delete cascade,
  kind text not null constraint support_email_kind check (kind in ('received', 'reply')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text constraint support_email_error_len check (char_length(last_error) <= 300)
);
create index support_email_queue_pending_idx on public.support_email_queue (created_at) where sent_at is null;
create index support_email_queue_request_idx on public.support_email_queue (request_id);
create index support_email_queue_message_idx on public.support_email_queue (message_id) where message_id is not null;
alter table public.support_email_queue enable row level security;
revoke all on public.support_email_queue from anon, authenticated;

-- Helpers -----------------------------------------------------------------------------------------------------------
create function private.support_get(p_id uuid)
returns public.support_requests language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  select * into r from public.support_requests where id = p_id for update;
  if not found then raise exception 'unknown_request' using errcode = 'P0002'; end if;
  return r;
end;
$$;

create function private.support_overdue(r public.support_requests)
returns boolean language sql stable security definer set search_path = ''
as $$
  select r.first_reply_at is null and r.status in ('new', 'open') and not r.held and not r.spam
    and r.created_at < now() - make_interval(hours => private.setting_int('support.first_reply_target_hours'));
$$;

-- Reads [support] ----------------------------------------------------------------------------------------------------
create function public.admin_list_support_requests(
  p_view text default null, p_status text default null, p_type text default null, p_priority text default null,
  p_search text default null, p_cursor timestamptz default null, p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_limit integer := private.admin_limit(p_limit); v_uid uuid := (select auth.uid()); v_like text := private.admin_like(p_search);
begin
  perform private.assert_platform_admin('support');
  if p_view is not null and p_view not in ('mine', 'unassigned', 'waiting', 'billing', 'ideas', 'overdue', 'held', 'spam') then
    raise exception 'invalid_view' using errcode = '22023';
  end if;
  return jsonb_build_object('as_of', now(), 'first_reply_target_hours', private.setting_int('support.first_reply_target_hours'),
    'items', coalesce((select jsonb_agg(row_to_json(t)::jsonb order by t.last_activity_at desc) from (
      select r.id, r.ref, r.subject, r.type, r.status, r.priority, r.held, r.created_at, r.first_reply_at, r.last_activity_at,
        r.requester_name, r.requester_profile_id is not null as signed_in, r.diagnostics ->> 'role' as requester_role,
        (select t.name from public.teams t where t.id = r.team_id) as team_name,
        (select p.display_name from public.profiles p where p.id = r.assignee_profile_id) as assignee_name,
        r.assignee_profile_id, private.support_overdue(r) as overdue
      from public.support_requests r
      where r.merged_into is null
        and ((p_view = 'spam') = r.spam)
        and (p_cursor is null or r.last_activity_at < p_cursor)
        and (p_status is null or r.status = p_status)
        and (p_type is null or r.type = p_type)
        and (p_priority is null or r.priority = p_priority)
        and (p_view is distinct from 'mine' or r.assignee_profile_id = v_uid)
        and (p_view is distinct from 'unassigned' or (r.assignee_profile_id is null and r.status not in ('solved', 'closed')))
        and (p_view is distinct from 'waiting' or r.status = 'waiting_on_requester')
        and (p_view is distinct from 'billing' or r.type = 'billing')
        and (p_view is distinct from 'ideas' or r.type = 'feedback')
        and (p_view is distinct from 'overdue' or private.support_overdue(r))
        and (p_view is distinct from 'held' or r.held)
        and (p_search is null or r.ref ilike v_like or r.subject ilike v_like or r.requester_email ilike v_like
             or exists (select 1 from public.teams t where t.id = r.team_id and t.name ilike v_like))
      order by r.last_activity_at desc limit v_limit) t), '[]'::jsonb));
end;
$$;

create function public.admin_get_support_request(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  perform private.assert_platform_admin('support');
  select * into r from public.support_requests where id = p_id;
  if not found then raise exception 'unknown_request' using errcode = 'P0002'; end if;
  return jsonb_build_object('as_of', now(),
    'request', to_jsonb(r) - 'requester_read_at',
    'overdue', private.support_overdue(r),
    'requester', jsonb_build_object('name', r.requester_name, 'email', r.requester_email, 'profile_id', r.requester_profile_id,
      'signed_in', r.requester_profile_id is not null,
      'past_requests', (select count(*) from public.support_requests o where o.id <> r.id and
         ((r.requester_profile_id is not null and o.requester_profile_id = r.requester_profile_id)
          or (r.requester_email is not null and lower(o.requester_email) = lower(r.requester_email))))),
    'team', (select jsonb_build_object('id', t.id, 'name', t.name, 'billing_state', private.team_billing_state(t.id)) from public.teams t where t.id = r.team_id),
    'club', (select jsonb_build_object('id', c.id, 'name', c.name) from public.clubs c where c.id = r.club_id),
    'assignee_name', (select p.display_name from public.profiles p where p.id = r.assignee_profile_id),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'author_kind', m.author_kind, 'internal', m.internal,
        'author_name', (select p.display_name from public.profiles p where p.id = m.author_profile_id),
        'body', case when m.redacted_at is not null then '[removed by Athleit Support]' else m.body end,
        'redacted', m.redacted_at is not null, 'created_at', m.created_at) order by m.created_at)
      from public.support_messages m where m.request_id = r.id), '[]'::jsonb),
    'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'message_id', a.message_id, 'file_name', a.file_name,
        'mime_type', a.mime_type, 'size_bytes', a.size_bytes) order by a.created_at)
      from public.support_attachments a where a.request_id = r.id and a.deleted_at is null), '[]'::jsonb),
    'related', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'ref', o.ref, 'subject', o.subject, 'status', o.status) order by o.created_at desc)
      from (select * from public.support_requests o where o.id <> r.id and
         ((r.requester_profile_id is not null and o.requester_profile_id = r.requester_profile_id)
          or (r.requester_email is not null and lower(o.requester_email) = lower(r.requester_email))) limit 5) o), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'before', e.before, 'after', e.after, 'at', e.at,
        'actor_name', (select p.display_name from public.profiles p where p.id = e.actor_id)) order by e.at)
      from public.support_events e where e.request_id = r.id), '[]'::jsonb));
end;
$$;

-- Authorises an attachment preview. The Edge Function signs a short lived URL for the returned path.
create function public.admin_support_attachment_path(p_attachment_id uuid)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare v_path text;
begin
  perform private.assert_platform_admin('support');
  select storage_path into v_path from public.support_attachments where id = p_attachment_id and deleted_at is null;
  if v_path is null then raise exception 'unknown_attachment' using errcode = 'P0002'; end if;
  return v_path;
end;
$$;

create function public.admin_list_canned_replies()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_platform_admin('support');
  return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'shortcut', c.shortcut, 'body', c.body, 'active', c.active) order by c.shortcut)
    from public.support_canned_replies c where c.active or private.is_platform_admin('admin')), '[]'::jsonb));
end;
$$;

create function public.admin_list_feedback(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_platform_admin('support');
  return jsonb_build_object('as_of', now(), 'items', coalesce((select jsonb_agg(row_to_json(g)::jsonb order by g.count desc, g.last_at desc) from (
    select coalesce(r.tags[1], r.subject) as label, r.tags[1] is not null as tagged, count(*)::int as count, max(r.last_activity_at) as last_at,
      (array_agg(r.feedback_status order by r.created_at desc))[1] as feedback_status,
      jsonb_agg(jsonb_build_object('id', r.id, 'ref', r.ref, 'subject', r.subject) order by r.created_at desc) as requests
    from public.support_requests r
    where r.type = 'feedback' and r.merged_into is null and not r.spam and (p_status is null or r.feedback_status = p_status)
    group by coalesce(r.tags[1], r.subject), r.tags[1] is not null) g), '[]'::jsonb));
end;
$$;

-- Stats per article slug; the page joins them with the generated articles.json (titles, categories, owners, covers).
create function public.admin_support_article_stats()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_platform_admin('support');
  return jsonb_build_object('as_of', now(),
    'feedback', coalesce((select jsonb_agg(jsonb_build_object('slug', slug, 'yes', yes, 'no', no)) from (
      select article_slug as slug, (count(*) filter (where helpful))::int as yes, (count(*) filter (where not helpful))::int as no
      from public.help_article_feedback group by article_slug) f), '[]'::jsonb),
    'tickets_30d', coalesce((select jsonb_agg(jsonb_build_object('slug', source_article, 'count', n)) from (
      select source_article, count(*)::int n from public.support_requests where source_article is not null and created_at > now() - interval '30 days' group by 1) s), '[]'::jsonb),
    'status', coalesce((select jsonb_agg(to_jsonb(s)) from public.help_article_status s), '[]'::jsonb),
    'misses', coalesce((select jsonb_agg(jsonb_build_object('query', query, 'hits', hits) order by hits desc) from (
      select query, sum(hits)::int hits from public.help_search_misses where day > current_date - 30 group by 1 order by 2 desc limit 50) m), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('slug', article_slug, 'comment', comment, 'at', created_at) order by created_at desc) from (
      select article_slug, comment, created_at from public.help_article_feedback where not helpful and comment is not null order by created_at desc limit 100) c), '[]'::jsonb));
end;
$$;

create function public.admin_support_metrics(p_range text default '30d')
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_iv interval := private.admin_range_checked(p_range);
begin
  perform private.assert_platform_admin('support');
  return jsonb_build_object('as_of', now(), 'range', coalesce(p_range, '30d'),
    'per_week', coalesce((select jsonb_agg(jsonb_build_object('week', w, 'type', type, 'count', n) order by w) from (
      select date_trunc('week', created_at) w, type, count(*)::int n from public.support_requests
      where created_at > now() - v_iv and not spam group by 1, 2) s), '[]'::jsonb),
    'first_reply_hours', (select jsonb_build_object('median', round((percentile_cont(0.5) within group (order by extract(epoch from first_reply_at - created_at) / 3600))::numeric, 1),
        'p90', round((percentile_cont(0.9) within group (order by extract(epoch from first_reply_at - created_at) / 3600))::numeric, 1), 'n', count(*))
      from public.support_requests where first_reply_at is not null and created_at > now() - v_iv and not spam),
    'time_to_solve_hours', (select jsonb_build_object('median', round((percentile_cont(0.5) within group (order by extract(epoch from solved_at - created_at) / 3600))::numeric, 1), 'n', count(*))
      from public.support_requests where solved_at is not null and created_at > now() - v_iv and not spam),
    'open_by_age', jsonb_build_object(
      'lt_1d', (select count(*) from public.support_requests where status in ('new', 'open', 'waiting_on_requester') and not spam and created_at >= now() - interval '1 day'),
      'd1_3', (select count(*) from public.support_requests where status in ('new', 'open', 'waiting_on_requester') and not spam and created_at < now() - interval '1 day' and created_at >= now() - interval '3 days'),
      'd3_7', (select count(*) from public.support_requests where status in ('new', 'open', 'waiting_on_requester') and not spam and created_at < now() - interval '3 days' and created_at >= now() - interval '7 days'),
      'gt_7d', (select count(*) from public.support_requests where status in ('new', 'open', 'waiting_on_requester') and not spam and created_at < now() - interval '7 days')),
    'satisfaction', (select jsonb_build_object('yes', count(*) filter (where satisfaction = 'yes'), 'no', count(*) filter (where satisfaction = 'no'))
      from public.support_requests where satisfaction is not null and created_at > now() - v_iv),
    'top_articles', coalesce((select jsonb_agg(jsonb_build_object('slug', source_article, 'count', n) order by n desc) from (
      select source_article, count(*)::int n from public.support_requests where source_article is not null and created_at > now() - v_iv group by 1 order by 2 desc limit 10) a), '[]'::jsonb),
    'top_misses', coalesce((select jsonb_agg(jsonb_build_object('query', query, 'hits', n) order by n desc) from (
      select query, sum(hits)::int n from public.help_search_misses where day > (now() - v_iv)::date group by 1 order by 2 desc limit 10) a), '[]'::jsonb),
    'tickets_per_100_teams', (select round(100.0 * (select count(*) from public.support_requests where created_at > now() - v_iv and not spam) / greatest((select count(*) from public.teams), 1), 1)),
    'overview', jsonb_build_object(
      'open', (select count(*) from public.support_requests where status in ('new', 'open', 'waiting_on_requester') and not spam),
      'overdue', (select count(*) from public.support_requests r where private.support_overdue(r)),
      'oldest_unanswered', (select min(created_at) from public.support_requests where first_reply_at is null and status in ('new', 'open') and not held and not spam),
      'held', (select count(*) from public.support_requests where held and not spam),
      'stale_articles', (select count(*) from public.help_article_status where stale)));
end;
$$;

-- Routine work [support]: no MFA, no reason, recorded in support_events -----------------------------------------------------------
create function public.admin_reply_support_request(p_id uuid, p_body text, p_internal boolean default false, p_status text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests; v_msg uuid; v_uid uuid := (select auth.uid()); v_new text;
begin
  perform private.assert_platform_admin('support');
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 5000 then raise exception 'invalid_body' using errcode = '22023'; end if;
  if p_status is not null and p_status not in ('open', 'waiting_on_requester', 'solved') then raise exception 'invalid_status' using errcode = '22023'; end if;
  r := private.support_get(p_id);
  if r.status = 'closed' or r.spam then raise exception 'request_closed' using errcode = '22023'; end if;
  if r.held and not coalesce(p_internal, false) then raise exception 'request_held' using errcode = '22023'; end if;
  insert into public.support_messages (request_id, author_kind, author_profile_id, body, internal)
    values (r.id, 'staff', v_uid, btrim(p_body), coalesce(p_internal, false)) returning id into v_msg;
  if coalesce(p_internal, false) then
    update public.support_requests set last_activity_at = now() where id = r.id;
    perform private.support_event(r.id, v_uid, 'note', null, null);
    return v_msg;
  end if;
  v_new := coalesce(p_status, 'waiting_on_requester');
  update public.support_requests set status = v_new, first_reply_at = coalesce(first_reply_at, now()),
    solved_at = case when v_new = 'solved' then now() else null end, last_activity_at = now() where id = r.id;
  perform private.support_event(r.id, v_uid, 'reply', jsonb_build_object('status', r.status), jsonb_build_object('status', v_new));
  if r.requester_profile_id is not null then
    perform private.support_notify_requester(r.id, v_msg, 'Support replied to ' || r.ref, p_body);
  elsif r.requester_email is not null then
    insert into public.support_email_queue (request_id, message_id, kind) values (r.id, v_msg, 'reply');
  end if;
  return v_msg;
end;
$$;

create function public.admin_assign_support_request(p_id uuid, p_assignee uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  perform private.assert_platform_admin('support');
  if p_assignee is not null and not exists (select 1 from public.platform_admins where profile_id = p_assignee) then
    raise exception 'not_an_admin' using errcode = '22023';
  end if;
  r := private.support_get(p_id);
  update public.support_requests set assignee_profile_id = p_assignee, status = case when status = 'new' and p_assignee is not null then 'open' else status end,
    last_activity_at = now() where id = r.id;
  perform private.support_event(r.id, (select auth.uid()), 'assign', jsonb_build_object('assignee', r.assignee_profile_id), jsonb_build_object('assignee', p_assignee));
end;
$$;

create function public.admin_set_support_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  perform private.assert_platform_admin('support');
  if p_status not in ('open', 'waiting_on_requester', 'solved', 'closed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  r := private.support_get(p_id);
  if r.status = 'closed' then raise exception 'request_closed' using errcode = '22023'; end if;
  update public.support_requests set status = p_status,
    solved_at = case when p_status = 'solved' then now() else null end,
    closed_at = case when p_status = 'closed' then now() else null end, last_activity_at = now() where id = r.id;
  if p_status in ('solved', 'closed') then
    insert into public.support_messages (request_id, author_kind, body) values (r.id, 'system', 'Marked ' || p_status || ' by Athleit Support');
  end if;
  perform private.support_event(r.id, (select auth.uid()), 'status', jsonb_build_object('status', r.status), jsonb_build_object('status', p_status));
end;
$$;

create function public.admin_set_support_priority(p_id uuid, p_priority text)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  perform private.assert_platform_admin('support');
  if p_priority not in ('low', 'normal', 'high', 'urgent') then raise exception 'invalid_priority' using errcode = '22023'; end if;
  r := private.support_get(p_id);
  update public.support_requests set priority = p_priority where id = r.id;
  perform private.support_event(r.id, (select auth.uid()), 'priority', jsonb_build_object('priority', r.priority), jsonb_build_object('priority', p_priority));
end;
$$;

create function public.admin_tag_support_request(p_id uuid, p_tags text[])
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests; v_tags text[];
begin
  perform private.assert_platform_admin('support');
  select coalesce(array_agg(distinct lower(btrim(t))), '{}') into v_tags from unnest(coalesce(p_tags, '{}')) t where btrim(t) <> '';
  if cardinality(v_tags) > 20 or exists (select 1 from unnest(v_tags) t where t !~ '^[a-z0-9][a-z0-9 -]{0,29}$') then
    raise exception 'invalid_tags' using errcode = '22023';
  end if;
  r := private.support_get(p_id);
  update public.support_requests set tags = v_tags where id = r.id;
  perform private.support_event(r.id, (select auth.uid()), 'tag', to_jsonb(r.tags), to_jsonb(v_tags));
end;
$$;

create function public.admin_link_support_article(p_id uuid, p_slug text)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  perform private.assert_platform_admin('support');
  if p_slug is not null and p_slug !~ '^[a-z0-9-]{1,120}$' then raise exception 'invalid_slug' using errcode = '22023'; end if;
  r := private.support_get(p_id);
  update public.support_requests set source_article = p_slug where id = r.id;
  perform private.support_event(r.id, (select auth.uid()), 'link_article', jsonb_build_object('slug', r.source_article), jsonb_build_object('slug', p_slug));
end;
$$;

-- Releasing a held request is routine: it becomes visible to the normal queue and the confirmation email goes out.
create function public.admin_release_support_hold(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  perform private.assert_platform_admin('support');
  r := private.support_get(p_id);
  if not r.held then return; end if;
  update public.support_requests set held = false, held_reason = null, last_activity_at = now() where id = r.id;
  perform private.support_event(r.id, (select auth.uid()), 'hold_release', jsonb_build_object('held_reason', r.held_reason), null);
  if r.requester_profile_id is null and r.requester_email is not null then
    insert into public.support_email_queue (request_id, kind) values (r.id, 'received');
  end if;
end;
$$;

-- Sensitive work [admin]: aal2, reason, platform audit ---------------------------------------------------------------------------------
create function public.admin_merge_support_requests(p_source uuid, p_target uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_reason text; s public.support_requests; t public.support_requests; v_uid uuid := (select auth.uid());
begin
  perform private.assert_platform_admin_write('admin');
  v_reason := private.assert_admin_reason(p_reason);
  if p_source = p_target then raise exception 'same_request' using errcode = '22023'; end if;
  s := private.support_get(p_source);
  t := private.support_get(p_target);
  if s.merged_into is not null or t.merged_into is not null then raise exception 'already_merged' using errcode = '22023'; end if;
  update public.support_requests set merged_into = t.id, status = 'closed', closed_at = now(), last_activity_at = now() where id = s.id;
  insert into public.support_messages (request_id, author_kind, body) values (t.id, 'system', 'Merged from ' || s.ref);
  insert into public.support_messages (request_id, author_kind, body) values (s.id, 'system', 'Merged into ' || t.ref);
  update public.support_requests set last_activity_at = now() where id = t.id;
  perform private.support_event(s.id, v_uid, 'merge', jsonb_build_object('status', s.status), jsonb_build_object('merged_into', t.ref));
  perform private.support_event(t.id, v_uid, 'merge', null, jsonb_build_object('merged_from', s.ref));
  perform private.platform_audit('support.merge', 'support_requests', s.ref, s.team_id, jsonb_build_object('status', s.status),
    jsonb_build_object('merged_into', t.ref), v_reason, v_uid);
end;
$$;

create function public.admin_mark_support_spam(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_reason text; r public.support_requests; v_uid uuid := (select auth.uid());
begin
  perform private.assert_platform_admin_write('admin');
  v_reason := private.assert_admin_reason(p_reason);
  r := private.support_get(p_id);
  update public.support_requests set spam = true, status = 'closed', closed_at = now(), last_activity_at = now() where id = r.id;
  perform private.support_event(r.id, v_uid, 'spam', jsonb_build_object('status', r.status), jsonb_build_object('spam', true));
  perform private.platform_audit('support.spam', 'support_requests', r.ref, r.team_id, jsonb_build_object('status', r.status, 'spam', r.spam),
    jsonb_build_object('spam', true), v_reason, v_uid);
end;
$$;

-- Replaces the text, keeps who and why, does NOT keep the removed text anywhere (not in the event, not in the audit row).
create function public.admin_redact_support_message(p_message_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_reason text; m public.support_messages; r public.support_requests; v_uid uuid := (select auth.uid());
begin
  perform private.assert_platform_admin_write('admin');
  v_reason := private.assert_admin_reason(p_reason);
  select * into m from public.support_messages where id = p_message_id for update;
  if not found then raise exception 'unknown_message' using errcode = 'P0002'; end if;
  if m.redacted_at is not null then raise exception 'already_redacted' using errcode = '22023'; end if;
  select * into r from public.support_requests where id = m.request_id;
  update public.support_messages set body = '[removed by Athleit Support]', redacted_at = now() where id = m.id;
  perform private.support_event(m.request_id, v_uid, 'redact', jsonb_build_object('message_id', m.id, 'author_kind', m.author_kind), null);
  perform private.platform_audit('support.redact', 'support_messages', m.id::text, r.team_id, jsonb_build_object('request', r.ref, 'author_kind', m.author_kind),
    null, v_reason, v_uid);
end;
$$;

create function public.admin_delete_support_attachment(p_attachment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_reason text; a public.support_attachments; r public.support_requests; v_uid uuid := (select auth.uid());
begin
  perform private.assert_platform_admin_write('admin');
  v_reason := private.assert_admin_reason(p_reason);
  select * into a from public.support_attachments where id = p_attachment_id and deleted_at is null for update;
  if not found then raise exception 'unknown_attachment' using errcode = 'P0002'; end if;
  select * into r from public.support_requests where id = a.request_id;
  update public.support_attachments set deleted_at = now() where id = a.id;
  delete from storage.objects where bucket_id = 'support-attachments' and name = a.storage_path;
  perform private.support_event(a.request_id, v_uid, 'delete_attachment', jsonb_build_object('attachment_id', a.id, 'file_name', a.file_name), null);
  perform private.platform_audit('support.delete_attachment', 'support_attachments', a.id::text, r.team_id, jsonb_build_object('request', r.ref, 'file_name', a.file_name),
    null, v_reason, v_uid);
end;
$$;

-- Rows only: reference, type, status, dates, team and tags. Never message text.
create function public.admin_export_support_requests(p_range text, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_reason text; v_iv interval := private.admin_range_checked(p_range); v_items jsonb; v_uid uuid := (select auth.uid());
begin
  perform private.assert_platform_admin_write('admin');
  v_reason := private.assert_admin_reason(p_reason);
  select coalesce(jsonb_agg(jsonb_build_object('ref', r.ref, 'type', r.type, 'status', r.status, 'priority', r.priority, 'created_at', r.created_at,
      'first_reply_at', r.first_reply_at, 'solved_at', r.solved_at, 'satisfaction', r.satisfaction, 'tags', r.tags,
      'team', (select t.name from public.teams t where t.id = r.team_id), 'source_article', r.source_article) order by r.created_at), '[]'::jsonb)
    into v_items from public.support_requests r where r.created_at > now() - v_iv and not r.spam;
  perform private.platform_audit('support.export', 'support_requests', null, null, null,
    jsonb_build_object('range', coalesce(p_range, '30d'), 'rows', jsonb_array_length(v_items)), v_reason, v_uid);
  return jsonb_build_object('as_of', now(), 'items', v_items);
end;
$$;

create function public.admin_set_feedback_status(p_id uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_reason text; r public.support_requests; v_uid uuid := (select auth.uid());
begin
  perform private.assert_platform_admin_write('admin');
  v_reason := private.assert_admin_reason(p_reason);
  if p_status not in ('new', 'considering', 'planned', 'shipped', 'wont_do') then raise exception 'invalid_status' using errcode = '22023'; end if;
  r := private.support_get(p_id);
  if r.type <> 'feedback' then raise exception 'not_feedback' using errcode = '22023'; end if;
  update public.support_requests set feedback_status = p_status where id = r.id;
  perform private.support_event(r.id, v_uid, 'feedback_status', jsonb_build_object('status', r.feedback_status), jsonb_build_object('status', p_status));
  perform private.platform_audit('support.feedback_status', 'support_requests', r.ref, null, jsonb_build_object('status', r.feedback_status),
    jsonb_build_object('status', p_status), v_reason, v_uid);
end;
$$;

create function public.admin_save_canned_reply(p_id uuid, p_title text, p_shortcut text, p_body text, p_active boolean, p_reason text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_reason text; v_old jsonb; v_new uuid := p_id; v_uid uuid := (select auth.uid());
begin
  perform private.assert_platform_admin_write('admin');
  v_reason := private.assert_admin_reason(p_reason);
  if p_id is null then
    insert into public.support_canned_replies (title, shortcut, body, active, created_by) values (p_title, p_shortcut, p_body, coalesce(p_active, true), v_uid) returning id into v_new;
  else
    select to_jsonb(c) - 'body' into v_old from public.support_canned_replies c where id = p_id for update;
    if v_old is null then raise exception 'unknown_canned_reply' using errcode = 'P0002'; end if;
    update public.support_canned_replies set title = p_title, shortcut = p_shortcut, body = p_body, active = coalesce(p_active, active) where id = p_id;
  end if;
  perform private.platform_audit('support.canned_reply.save', 'support_canned_replies', v_new::text, null, v_old, jsonb_build_object('shortcut', p_shortcut, 'title', p_title), v_reason, v_uid);
  return v_new;
end;
$$;

create function public.admin_delete_canned_reply(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_reason text; v_old jsonb; v_uid uuid := (select auth.uid());
begin
  perform private.assert_platform_admin_write('admin');
  v_reason := private.assert_admin_reason(p_reason);
  select to_jsonb(c) - 'body' into v_old from public.support_canned_replies c where id = p_id;
  if v_old is null then raise exception 'unknown_canned_reply' using errcode = 'P0002'; end if;
  delete from public.support_canned_replies where id = p_id;
  perform private.platform_audit('support.canned_reply.delete', 'support_canned_replies', p_id::text, null, v_old, null, v_reason, v_uid);
end;
$$;

-- Sweep: auto-solve after waiting, auto-close after the reopen window. Retention is a separate, unscheduled function (see docs/support.md). ----
create function private.support_sweep()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_solved integer := 0; v_closed integer := 0; r record;
begin
  for r in select id from public.support_requests
    where status = 'waiting_on_requester' and last_activity_at < now() - make_interval(days => private.setting_int('support.auto_solve_days')) for update skip locked loop
    update public.support_requests set status = 'solved', solved_at = now(), last_activity_at = now() where id = r.id;
    insert into public.support_messages (request_id, author_kind, body) values (r.id, 'system', 'Marked solved automatically after no reply');
    perform private.support_event(r.id, null, 'auto_solve', jsonb_build_object('status', 'waiting_on_requester'), jsonb_build_object('status', 'solved'));
    v_solved := v_solved + 1;
  end loop;
  for r in select id from public.support_requests
    where status = 'solved' and solved_at < now() - make_interval(days => private.setting_int('support.reopen_days')) for update skip locked loop
    update public.support_requests set status = 'closed', closed_at = now() where id = r.id;
    perform private.support_event(r.id, null, 'auto_close', jsonb_build_object('status', 'solved'), jsonb_build_object('status', 'closed'));
    v_closed := v_closed + 1;
  end loop;
  return jsonb_build_object('solved', v_solved, 'closed', v_closed);
end;
$$;
select cron.schedule('support-sweep', '25 * * * *', 'select private.support_sweep()');

-- Retention: attachments deleted, requester anonymized, a set number of months after closing. NOT scheduled until the business confirms the period. ----
create function private.support_retention_sweep()
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_n integer;
begin
  delete from storage.objects o using public.support_attachments a
    where o.bucket_id = 'support-attachments' and o.name = a.storage_path
      and a.request_id in (select id from public.support_requests where status = 'closed'
        and closed_at < now() - make_interval(months => private.setting_int('support.retention_months')));
  update public.support_attachments set deleted_at = now() where deleted_at is null and request_id in
    (select id from public.support_requests where status = 'closed' and closed_at < now() - make_interval(months => private.setting_int('support.retention_months')));
  update public.support_requests set requester_profile_id = null, requester_email = null, requester_name = null
    where status = 'closed' and closed_at < now() - make_interval(months => private.setting_int('support.retention_months'))
      and (requester_profile_id is not null or requester_email is not null);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Account deletion: anonymize the requester and delete attachments now (called by the delete-account Edge Function, service role). ----------
create function private.support_anonymize_profile(p_profile uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_n integer;
begin
  delete from storage.objects o using public.support_attachments a
    where o.bucket_id = 'support-attachments' and o.name = a.storage_path
      and a.request_id in (select id from public.support_requests where requester_profile_id = p_profile);
  update public.support_attachments set deleted_at = now() where deleted_at is null
    and request_id in (select id from public.support_requests where requester_profile_id = p_profile);
  delete from public.support_access_tokens where request_id in (select id from public.support_requests where requester_profile_id = p_profile);
  update public.support_requests set requester_profile_id = null, requester_email = null, requester_name = null where requester_profile_id = p_profile;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Public-safe values for live numbers in articles. anon-callable, returns only non-secret settings. ---------------------------------------------
create function public.get_public_help_values()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'billing_enabled', private.setting_bool('team_subscription.enabled'),
    'price_cents', private.setting_int('team_subscription.price_cents'),
    'trial_days', private.setting_int('team_subscription.trial_days'),
    'grace_days', private.setting_int('team_subscription.grace_days'),
    'first_reply_target_hours', private.setting_int('support.first_reply_target_hours'),
    'reopen_days', private.setting_int('support.reopen_days'),
    'max_attachments', private.setting_int('support.max_attachments'),
    'max_attachment_mb', private.setting_int('support.max_attachment_mb'),
    'public_tickets_enabled', private.setting_bool('support.public_tickets_enabled'),
    'contact_email', nullif(btrim((select value #>> '{}' from public.platform_settings where key = 'support.contact_email')), ''),
    'fee', (select jsonb_build_object('flat_cents', f.platform_fee_flat_cents, 'bps', f.platform_fee_bps) from public.fee_config f where f.is_active));
$$;

-- Grants ------------------------------------------------------------------------------------------------------------------------------------------
revoke execute on function private.support_get(uuid), private.support_overdue(public.support_requests), private.support_sweep(),
  private.support_retention_sweep(), private.support_anonymize_profile(uuid) from public, anon, authenticated;
grant execute on function private.support_get(uuid), private.support_overdue(public.support_requests), private.support_sweep(),
  private.support_retention_sweep(), private.support_anonymize_profile(uuid) to service_role;
revoke execute on function
  public.admin_list_support_requests(text, text, text, text, text, timestamptz, integer), public.admin_get_support_request(uuid),
  public.admin_support_attachment_path(uuid), public.admin_list_canned_replies(), public.admin_list_feedback(text),
  public.admin_support_article_stats(), public.admin_support_metrics(text),
  public.admin_reply_support_request(uuid, text, boolean, text), public.admin_assign_support_request(uuid, uuid),
  public.admin_set_support_status(uuid, text), public.admin_set_support_priority(uuid, text), public.admin_tag_support_request(uuid, text[]),
  public.admin_link_support_article(uuid, text), public.admin_release_support_hold(uuid),
  public.admin_merge_support_requests(uuid, uuid, text), public.admin_mark_support_spam(uuid, text),
  public.admin_redact_support_message(uuid, text), public.admin_delete_support_attachment(uuid, text),
  public.admin_export_support_requests(text, text), public.admin_set_feedback_status(uuid, text, text),
  public.admin_save_canned_reply(uuid, text, text, text, boolean, text), public.admin_delete_canned_reply(uuid, text),
  public.get_public_help_values() from public, anon, authenticated;
grant execute on function
  public.admin_list_support_requests(text, text, text, text, text, timestamptz, integer), public.admin_get_support_request(uuid),
  public.admin_support_attachment_path(uuid), public.admin_list_canned_replies(), public.admin_list_feedback(text),
  public.admin_support_article_stats(), public.admin_support_metrics(text),
  public.admin_reply_support_request(uuid, text, boolean, text), public.admin_assign_support_request(uuid, uuid),
  public.admin_set_support_status(uuid, text), public.admin_set_support_priority(uuid, text), public.admin_tag_support_request(uuid, text[]),
  public.admin_link_support_article(uuid, text), public.admin_release_support_hold(uuid),
  public.admin_merge_support_requests(uuid, uuid, text), public.admin_mark_support_spam(uuid, text),
  public.admin_redact_support_message(uuid, text), public.admin_delete_support_attachment(uuid, text),
  public.admin_export_support_requests(text, text), public.admin_set_feedback_status(uuid, text, text),
  public.admin_save_canned_reply(uuid, text, text, text, boolean, text), public.admin_delete_canned_reply(uuid, text)
  to authenticated;
grant execute on function public.get_public_help_values() to anon, authenticated;
