-- Support center: service-role functions used by the Edge Functions (signed-out submissions, token views, attachment
-- finalizing, article feedback and the email queue). Executable by service_role only; anon and authenticated cannot call them.

-- Mint an access token row for a request. The raw token exists only in the email being sent; only its sha256 is stored.
create function public.svc_support_mint_token(p_request uuid, p_hash bytea)
returns void language sql security definer set search_path = ''
as $$ insert into public.support_access_tokens (request_id, token_hash, expires_at) values (p_request, p_hash, now() + interval '30 days'); $$;

-- Signals for the hold-for-review heuristics. Counts only; no addresses leave the database.
create function public.svc_support_signals(p_email text, p_body text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'by_email_24h', (select count(*) from public.support_requests where lower(requester_email) = lower(p_email) and created_at > now() - interval '24 hours'),
    -- Only earlier support history counts, never whether an account exists (that would be an oracle).
    'known_email', (select count(*) from public.support_requests where lower(requester_email) = lower(p_email) and created_at < now() - interval '24 hours' and not spam),
    'identical_24h', (select count(*) from public.support_messages where author_kind = 'requester' and body = p_body and created_at > now() - interval '24 hours'));
$$;

create function public.svc_create_public_support_request(
  p_type text, p_subject text, p_body text, p_email text, p_name text, p_source_article text, p_source_route text,
  p_diagnostics jsonb, p_held boolean, p_held_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_ref text; v_msg uuid;
begin
  if p_type not in ('question', 'problem', 'billing', 'feedback') then raise exception 'invalid_type' using errcode = '22023'; end if;
  insert into public.support_requests (type, subject, requester_email, requester_name, source_article, source_route, diagnostics, held, held_reason, feedback_status)
    values (p_type, btrim(p_subject), lower(btrim(p_email)), nullif(left(btrim(coalesce(p_name, '')), 120), ''), left(p_source_article, 120),
      left(p_source_route, 200), coalesce(p_diagnostics, '{}'), coalesce(p_held, false), left(p_held_reason, 200), case when p_type = 'feedback' then 'new' end)
    returning id, ref into v_id, v_ref;
  insert into public.support_messages (request_id, author_kind, body) values (v_id, 'requester', btrim(p_body)) returning id into v_msg;
  perform private.support_event(v_id, null, 'created', null, jsonb_build_object('type', p_type, 'held', coalesce(p_held, false)));
  if not coalesce(p_held, false) then
    insert into public.support_email_queue (request_id, kind) values (v_id, 'received');
  end if;
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end;
$$;

-- Resolve a token to its request, extending the expiry on use. Returns null for unknown or expired tokens (same shape either way).
create function private.support_token_request(p_hash bytea)
returns public.support_requests language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests; t public.support_access_tokens;
begin
  select * into t from public.support_access_tokens where token_hash = p_hash and expires_at > now();
  if not found then return null; end if;
  update public.support_access_tokens set last_used_at = now(), expires_at = greatest(expires_at, now() + interval '30 days') where id = t.id;
  select * into r from public.support_requests where id = t.request_id;
  return r;
end;
$$;

create function public.svc_support_view_by_token(p_hash bytea)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  r := private.support_token_request(p_hash);
  if r.id is null then return null; end if;
  return jsonb_build_object('ref', r.ref, 'type', r.type, 'subject', r.subject, 'held', r.held,
    'status', case when r.status = 'new' then 'open' else r.status end, 'created_at', r.created_at, 'last_activity_at', r.last_activity_at,
    'can_reply', r.status <> 'closed' and (r.status <> 'solved' or private.support_reopen_open(r)),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'author_kind', m.author_kind,
        'author_name', case m.author_kind when 'staff' then coalesce(split_part((select display_name from public.profiles p where p.id = m.author_profile_id), ' ', 1), 'Support') end,
        'body', case when m.redacted_at is not null then '[removed by Athleit Support]' else m.body end, 'created_at', m.created_at) order by m.created_at)
      from public.support_messages m where m.request_id = r.id and not m.internal), '[]'::jsonb));
end;
$$;

create function public.svc_support_reply_by_token(p_hash bytea, p_body text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r public.support_requests;
begin
  r := private.support_token_request(p_hash);
  if r.id is null then return null; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 5000 then raise exception 'invalid_body' using errcode = '22023'; end if;
  if r.status = 'closed' or (r.status = 'solved' and not private.support_reopen_open(r)) then raise exception 'request_closed' using errcode = '22023'; end if;
  insert into public.support_messages (request_id, author_kind, body) values (r.id, 'requester', btrim(p_body));
  update public.support_requests set status = case when status in ('waiting_on_requester', 'solved', 'open') then 'open' else status end,
    solved_at = case when status = 'solved' then null else solved_at end, reopened_count = reopened_count + case when status = 'solved' then 1 else 0 end,
    last_activity_at = now(), last_requester_activity_at = now() where id = r.id;
  perform private.support_event(r.id, null, 'reply', jsonb_build_object('status', r.status), null);
  return jsonb_build_object('ok', true);
end;
$$;

-- Record an uploaded object after the Edge Function has checked size, mime and magic bytes.
create function public.svc_support_record_attachment(p_request uuid, p_path text, p_name text, p_mime text, p_size integer, p_max integer)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if p_path not like p_request::text || '/%' then raise exception 'invalid_path' using errcode = '22023'; end if;
  if (select count(*) from public.support_attachments where request_id = p_request and deleted_at is null) >= p_max then
    raise exception 'too_many_attachments' using errcode = '22023';
  end if;
  insert into public.support_attachments (request_id, message_id, storage_path, file_name, mime_type, size_bytes)
    values (p_request, (select id from public.support_messages where request_id = p_request order by created_at desc limit 1), p_path, left(p_name, 200), p_mime, p_size)
    returning id into v_id;
  return v_id;
end;
$$;

create function public.svc_record_article_feedback(p_slug text, p_helpful boolean, p_comment text, p_profile uuid)
returns void language sql security definer set search_path = ''
as $$ insert into public.help_article_feedback (article_slug, helpful, comment, profile_id) values (p_slug, p_helpful, nullif(left(btrim(coalesce(p_comment, '')), 500), ''), p_profile); $$;

create function public.svc_record_search_miss(p_query text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.help_search_misses (query) values (lower(btrim(p_query)))
  on conflict (query, day) do update set hits = public.help_search_misses.hits + 1;
$$;

-- Pending emails, oldest first. Claims by stamping attempts so two workers do not send the same row.
create function public.svc_support_claim_emails(p_limit integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ids uuid[];
begin
  select array_agg(s.id) into v_ids from (
    select q.id from public.support_email_queue q where q.sent_at is null and q.attempts < 5
    order by q.created_at limit least(greatest(p_limit, 1), 50) for update skip locked) s;
  if v_ids is null then return '[]'::jsonb; end if;
  update public.support_email_queue set attempts = attempts + 1 where id = any(v_ids);
  return coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'request_id', q.request_id, 'message_id', q.message_id,
      'ref', r.ref, 'email', r.requester_email, 'subject', r.subject,
      'body', (select case when m.redacted_at is null then m.body else '[removed by Athleit Support]' end from public.support_messages m where m.id = q.message_id)) order by q.created_at)
    from public.support_email_queue q join public.support_requests r on r.id = q.request_id where q.id = any(v_ids)), '[]'::jsonb);
end;
$$;

create function public.svc_support_email_done(p_id uuid, p_error text)
returns void language sql security definer set search_path = ''
as $$ update public.support_email_queue set sent_at = case when p_error is null then now() end, last_error = left(p_error, 300) where id = p_id; $$;

-- pg_cron kicks send-support-emails every 5 minutes through pg_net (same vault pattern as billing); a no-op until the secrets exist.
create function private.kick_support_emails()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'support_emails_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'reconcile_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(url := v_url, headers := jsonb_build_object('content-type', 'application/json', 'x-reconcile-secret', v_secret),
    body := '{}'::jsonb, timeout_milliseconds := 5000);
exception when others then null;
end;
$$;
select cron.schedule('support-emails', '*/5 * * * *', 'select private.kick_support_emails()');

revoke execute on function private.support_token_request(bytea), private.kick_support_emails() from public, anon, authenticated;
grant execute on function private.support_token_request(bytea), private.kick_support_emails() to service_role;
revoke execute on function
  public.svc_support_mint_token(uuid, bytea), public.svc_support_signals(text, text),
  public.svc_create_public_support_request(text, text, text, text, text, text, text, jsonb, boolean, text),
  public.svc_support_view_by_token(bytea), public.svc_support_reply_by_token(bytea, text),
  public.svc_support_record_attachment(uuid, text, text, text, integer, integer),
  public.svc_record_article_feedback(text, boolean, text, uuid), public.svc_record_search_miss(text),
  public.svc_support_claim_emails(integer), public.svc_support_email_done(uuid, text) from public, anon, authenticated;
grant execute on function
  public.svc_support_mint_token(uuid, bytea), public.svc_support_signals(text, text),
  public.svc_create_public_support_request(text, text, text, text, text, text, text, jsonb, boolean, text),
  public.svc_support_view_by_token(bytea), public.svc_support_reply_by_token(bytea, text),
  public.svc_support_record_attachment(uuid, text, text, text, integer, integer),
  public.svc_record_article_feedback(text, boolean, text, uuid), public.svc_record_search_miss(text),
  public.svc_support_claim_emails(integer), public.svc_support_email_done(uuid, text) to service_role;

-- Account deletion hook (delete-account Edge Function, service role).
create function public.svc_support_anonymize_profile(p_profile uuid)
returns integer language sql security definer set search_path = ''
as $$ select private.support_anonymize_profile(p_profile); $$;
revoke execute on function public.svc_support_anonymize_profile(uuid) from public, anon, authenticated;
grant execute on function public.svc_support_anonymize_profile(uuid) to service_role;
