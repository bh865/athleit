-- Support center (1/3): tables, row level security, attachments bucket, the `support` notification category, settings.
-- Requesters read their own rows through RLS and the requester functions (next migration). anon has no table access:
-- signed-out flows go through Edge Functions with the service role. Staff never read these tables directly; they use
-- the admin_* security definer functions.

create sequence public.support_ref_seq start 1001 minvalue 1 no cycle; -- never reused: sequences do not roll back
revoke all on sequence public.support_ref_seq from public, anon, authenticated;

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('SUP-' || lpad(nextval('public.support_ref_seq')::text, 6, '0'))
    constraint support_requests_ref_format check (ref ~ '^SUP-[0-9]{6,}$'),
  type text not null constraint support_requests_type check (type in ('question', 'problem', 'billing', 'feedback')),
  subject text not null constraint support_requests_subject_len check (char_length(btrim(subject)) between 1 and 120),
  status text not null default 'new'
    constraint support_requests_status check (status in ('new', 'open', 'waiting_on_requester', 'solved', 'closed')),
  priority text not null default 'normal' constraint support_requests_priority check (priority in ('low', 'normal', 'high', 'urgent')),
  requester_profile_id uuid references public.profiles (id) on delete set null,
  requester_email text constraint support_requests_email_len check (char_length(requester_email) <= 254),
  requester_name text constraint support_requests_name_len check (char_length(requester_name) <= 120),
  team_id uuid references public.teams (id) on delete set null,
  club_id uuid references public.clubs (id) on delete set null,
  assignee_profile_id uuid references public.profiles (id) on delete set null,
  source_article text constraint support_requests_article_len check (char_length(source_article) <= 120),
  source_route text constraint support_requests_route_len check (char_length(source_route) <= 200),
  -- Validated keys only: app_version, platform, os, browser, route, role, at. Never message text or payment data.
  diagnostics jsonb not null default '{}'
    constraint support_requests_diag check (
      jsonb_typeof(diagnostics) = 'object'
      and diagnostics - array['app_version', 'platform', 'os', 'browser', 'route', 'role', 'at'] = '{}'::jsonb
      and octet_length(diagnostics::text) <= 1000),
  tags text[] not null default '{}' constraint support_requests_tags_len check (cardinality(tags) <= 20),
  held boolean not null default false,
  held_reason text constraint support_requests_held_len check (char_length(held_reason) <= 200),
  merged_into uuid references public.support_requests (id) on delete set null,
  feedback_status text constraint support_requests_feedback_status
    check (feedback_status in ('new', 'considering', 'planned', 'shipped', 'wont_do')),
  spam boolean not null default false,
  first_reply_at timestamptz,
  solved_at timestamptz,
  closed_at timestamptz,
  reopened_count integer not null default 0,
  satisfaction text constraint support_requests_satisfaction check (satisfaction in ('yes', 'no')),
  satisfaction_comment text constraint support_requests_sat_comment_len check (char_length(satisfaction_comment) <= 1000),
  requester_read_at timestamptz,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  last_requester_activity_at timestamptz not null default now(),
  constraint support_requests_feedback_only check (feedback_status is null or type = 'feedback'),
  constraint support_requests_requester check (requester_profile_id is not null or requester_email is not null)
);
create index support_requests_requester_idx on public.support_requests (requester_profile_id, last_activity_at desc) where requester_profile_id is not null;
create index support_requests_email_idx on public.support_requests (lower(requester_email)) where requester_email is not null;
create index support_requests_queue_idx on public.support_requests (status, last_activity_at desc);
create index support_requests_assignee_idx on public.support_requests (assignee_profile_id) where assignee_profile_id is not null;
create index support_requests_team_idx on public.support_requests (team_id) where team_id is not null;
create index support_requests_club_idx on public.support_requests (club_id) where club_id is not null;
create index support_requests_merged_idx on public.support_requests (merged_into) where merged_into is not null;
create index support_requests_article_idx on public.support_requests (source_article) where source_article is not null;

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests (id) on delete cascade,
  author_kind text not null constraint support_messages_kind check (author_kind in ('requester', 'staff', 'system')),
  author_profile_id uuid references public.profiles (id) on delete set null,
  body text not null constraint support_messages_body_len check (char_length(body) between 1 and 5000),
  internal boolean not null default false,
  created_at timestamptz not null default now(),
  redacted_at timestamptz,
  constraint support_messages_internal_staff check (not internal or author_kind = 'staff')
);
create index support_messages_request_idx on public.support_messages (request_id, created_at);
create index support_messages_author_idx on public.support_messages (author_profile_id) where author_profile_id is not null;

create table public.support_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests (id) on delete cascade,
  message_id uuid references public.support_messages (id) on delete set null,
  storage_path text not null unique constraint support_attachments_path_len check (char_length(storage_path) <= 300),
  file_name text not null constraint support_attachments_name_len check (char_length(file_name) <= 200),
  mime_type text not null constraint support_attachments_mime check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf')),
  size_bytes integer not null constraint support_attachments_size check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index support_attachments_request_idx on public.support_attachments (request_id);
create index support_attachments_message_idx on public.support_attachments (message_id) where message_id is not null;

create table public.support_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.support_requests (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null constraint support_events_kind check (kind in
    ('created', 'reply', 'note', 'assign', 'status', 'priority', 'tag', 'link_article', 'merge', 'spam', 'redact',
     'delete_attachment', 'export', 'hold_release', 'feedback_status', 'satisfaction', 'reopen', 'auto_solve', 'auto_close')),
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index support_events_request_idx on public.support_events (request_id, at);
create index support_events_actor_idx on public.support_events (actor_id) where actor_id is not null;

create table public.support_canned_replies (
  id uuid primary key default gen_random_uuid(),
  title text not null constraint support_canned_title_len check (char_length(btrim(title)) between 1 and 120),
  shortcut text not null unique constraint support_canned_shortcut check (shortcut ~ '^[a-z0-9-]{1,30}$'),
  body text not null constraint support_canned_body_len check (char_length(btrim(body)) between 1 and 5000),
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index support_canned_replies_created_by_idx on public.support_canned_replies (created_by) where created_by is not null;

-- Signed-out requesters reach a request through an emailed link. Only the sha256 of the token is stored.
create table public.support_access_tokens (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests (id) on delete cascade,
  token_hash bytea not null unique constraint support_tokens_hash_len check (octet_length(token_hash) = 32),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index support_access_tokens_request_idx on public.support_access_tokens (request_id);

create table public.help_article_feedback (
  id bigint generated always as identity primary key,
  article_slug text not null constraint haf_slug_len check (char_length(article_slug) between 1 and 120),
  helpful boolean not null,
  comment text constraint haf_comment_len check (char_length(comment) <= 500),
  profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index help_article_feedback_slug_idx on public.help_article_feedback (article_slug, created_at desc);
create index help_article_feedback_profile_idx on public.help_article_feedback (profile_id) where profile_id is not null;

-- Counts by day, no profile ids. Queries that look like emails or long digit runs are dropped by the recorder.
create table public.help_search_misses (
  query text not null constraint hsm_query_len check (char_length(query) between 2 and 100),
  day date not null default ((now() at time zone 'utc')::date),
  hits integer not null default 1,
  primary key (query, day)
);

-- Written only by the docs pipeline (report-docs-status, service role).
create table public.help_article_status (
  slug text primary key,
  stale boolean not null default false,
  stale_paths text[] not null default '{}',
  checked_at timestamptz not null default now()
);

alter table public.support_requests enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_attachments enable row level security;
alter table public.support_events enable row level security;
alter table public.support_canned_replies enable row level security;
alter table public.support_access_tokens enable row level security;
alter table public.help_article_feedback enable row level security;
alter table public.help_search_misses enable row level security;
alter table public.help_article_status enable row level security;
revoke all on public.support_requests, public.support_messages, public.support_attachments, public.support_events,
  public.support_canned_replies, public.support_access_tokens, public.help_article_feedback,
  public.help_search_misses, public.help_article_status from anon, authenticated;
-- Requesters may READ their own rows; every write goes through a function.
grant select on public.support_requests, public.support_messages, public.support_attachments to authenticated;

create policy "Support requests: read own"
  on public.support_requests for select to authenticated
  using (requester_profile_id = (select auth.uid()));
create policy "Support messages: read own, never internal"
  on public.support_messages for select to authenticated
  using (not internal and exists (
    select 1 from public.support_requests r where r.id = request_id and r.requester_profile_id = (select auth.uid())));
create policy "Support attachments: read own"
  on public.support_attachments for select to authenticated
  using (deleted_at is null and exists (
    select 1 from public.support_requests r where r.id = request_id and r.requester_profile_id = (select auth.uid())));

-- Storage: private bucket. Object path: <request_id>/<uuid>/<filename>. Requester of that request only. -----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-attachments', 'support-attachments', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

create function private.support_attachment_request_id(p_name text)
returns uuid language sql immutable set search_path = ''
as $$
  select case when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end;
$$;
create function private.owns_support_request(p_request uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.support_requests r
    where r.id = p_request and r.requester_profile_id = (select auth.uid()) and r.status <> 'closed');
$$;
create policy "Support attachments: requester can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'support-attachments' and private.owns_support_request(private.support_attachment_request_id(name)));
create policy "Support attachments: requester can upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'support-attachments' and private.owns_support_request(private.support_attachment_request_id(name)));
revoke execute on function private.support_attachment_request_id(text), private.owns_support_request(uuid) from public, anon;
grant execute on function private.support_attachment_request_id(text), private.owns_support_request(uuid) to authenticated, service_role;

-- Notification category `support` (drop and re-add, keeping every earlier value) -----------------------------------
alter table public.notification_preferences drop constraint notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category in ('messages', 'announcements', 'schedule', 'payments', 'registration', 'billing', 'payments_reserved', 'support'));
alter table public.notification_outbox drop constraint notification_outbox_category_check;
alter table public.notification_outbox add constraint notification_outbox_category_check
  check (category in ('messages', 'announcements', 'schedule', 'payments', 'registration', 'billing', 'payments_reserved', 'support'));
create or replace function private.seed_notification_preferences(p_profile_id uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into public.notification_preferences (profile_id, channel, category)
  select p_profile_id, ch, cat
  from unnest(array['push', 'email']) ch,
       unnest(array['messages', 'announcements', 'schedule', 'payments', 'registration', 'billing', 'support']) cat
  on conflict do nothing;
$$;
insert into public.notification_preferences (profile_id, channel, category)
select p.id, ch, 'support' from public.profiles p, unnest(array['push', 'email']) ch
on conflict do nothing;
drop policy "Create own preferences (implemented channels and categories only)" on public.notification_preferences;
create policy "Create own preferences (implemented channels and categories only)" on public.notification_preferences
  for insert to authenticated
  with check (profile_id = (select auth.uid()) and channel in ('push', 'email')
              and category in ('messages', 'announcements', 'schedule', 'payments', 'registration', 'billing', 'support'));

-- Support settings (generated Settings renders them). Every number below is a Placeholder to confirm with the business. ----
insert into public.platform_setting_definitions
  (key, label, description, setting_group, value_type, min_value, max_value, unit, default_value, write_role, sort_order) values
  ('support.first_reply_target_hours', 'First reply target', 'Hours before an unanswered ticket is marked overdue in the queue. A staff target, never promised to requesters.', 'Support', 'integer', 1, 336, 'hours', '24', 'admin', 10),
  ('support.auto_solve_days', 'Auto-solve after waiting', 'Days a ticket can wait on the requester before it is marked solved automatically.', 'Support', 'integer', 1, 60, 'days', '7', 'admin', 20),
  ('support.reopen_days', 'Reopen window', 'Days after a ticket is solved during which the requester can reopen it. Solved tickets close after this window.', 'Support', 'integer', 1, 90, 'days', '14', 'admin', 30),
  ('support.max_attachment_mb', 'Maximum attachment size', 'Largest single attachment, in megabytes. The storage bucket enforces a hard limit of 10 MB.', 'Support', 'integer', 1, 10, 'MB', '10', 'admin', 40),
  ('support.max_attachments', 'Maximum attachments per message', 'How many files a requester can attach to one message.', 'Support', 'integer', 0, 5, 'files', '3', 'admin', 50),
  ('support.public_tickets_enabled', 'Public ticket creation', 'Turn off to stop signed-out people from creating tickets (for example during abuse). Signed-in requests keep working.', 'Support', 'boolean', null, null, null, 'false', 'owner', 60),
  ('support.contact_email', 'Contact email shown', 'The address shown on the contact page and in emails. Leave empty to show none.', 'Support', 'text', null, null, null, '""', 'owner', 70),
  ('support.retention_months', 'Retention after closing', 'Months after a ticket closes before its attachments are deleted and the requester is anonymized.', 'Support', 'integer', 1, 60, 'months', '24', 'owner', 80);
insert into public.platform_settings (key, value)
  select key, default_value from public.platform_setting_definitions where setting_group = 'Support';
