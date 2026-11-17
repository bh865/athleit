-- Phase 3 (2/6): attachments, read state, reactions, reports, attachment bucket
-- Read-only for clients; writes go through functions (next migrations).

-- Can the caller see this message (thread access + join-time rule)?
create function private.can_read_message_id(p_message_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.messages m
    where m.id = p_message_id and private.can_read_message(m.thread_id, m.created_at));
$$;

-- Read receipts: participants see them in group/direct threads; in announcements only staff do.
create function private.can_see_reads(p_thread_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.can_read_thread(p_thread_id)
    and exists (select 1 from public.threads t
                where t.id = p_thread_id and (t.type <> 'announcement' or private.is_team_staff(t.team_id)));
$$;

-- Staff of the team a message's thread belongs to (moderation queue access).
create function private.is_staff_of_message(p_message_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.messages m join public.threads t on t.id = m.thread_id
    where m.id = p_message_id and private.is_team_staff(t.team_id));
$$;

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  storage_path text not null unique constraint message_attachments_path_length check (char_length(storage_path) <= 300),
  mime_type text not null constraint message_attachments_mime_check
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf')),
  size_bytes bigint not null constraint message_attachments_size_check check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);
create index message_attachments_message_idx on public.message_attachments (message_id);

create table public.message_reads (
  thread_id uuid not null references public.threads (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_message_id uuid references public.messages (id) on delete set null,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, profile_id)
);
create index message_reads_profile_idx on public.message_reads (profile_id);
create index message_reads_last_message_idx on public.message_reads (last_read_message_id)
  where last_read_message_id is not null;

-- Reactions use a small fixed set of keys (rendered as icons by the apps).
create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null constraint message_reactions_emoji_check
    check (emoji in ('thumbs_up', 'heart', 'laugh', 'celebrate', 'clap', 'wow')),
  -- Denormalized so Realtime clients can filter by thread.
  thread_id uuid not null references public.threads (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id, emoji)
);
create index message_reactions_profile_idx on public.message_reactions (profile_id);
create index message_reactions_thread_idx on public.message_reactions (thread_id);

create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  reporter_profile_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null constraint message_reports_reason_length check (char_length(btrim(reason)) between 1 and 500),
  status text not null default 'open' constraint message_reports_status_check
    check (status in ('open', 'actioned', 'dismissed')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id, reporter_profile_id)
);
create index message_reports_reporter_idx on public.message_reports (reporter_profile_id);
create index message_reports_reviewed_by_idx on public.message_reports (reviewed_by) where reviewed_by is not null;
create index message_reports_open_idx on public.message_reports (created_at) where status = 'open';

alter table public.message_attachments enable row level security;
alter table public.message_reads enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_reports enable row level security;
revoke all on public.message_attachments, public.message_reads, public.message_reactions, public.message_reports
  from anon, authenticated;
grant select on public.message_attachments, public.message_reads, public.message_reactions,
  public.message_reports to authenticated;

create policy "Read attachments of messages you can read" on public.message_attachments
  for select to authenticated using (private.can_read_message_id(message_id));
create policy "Read your own read state and, where allowed, your thread's" on public.message_reads
  for select to authenticated
  using (profile_id = (select auth.uid()) or private.can_see_reads(thread_id));
create policy "Read reactions on messages you can read" on public.message_reactions
  for select to authenticated using (private.can_read_message_id(message_id));
create policy "Read your own reports; staff read their team's" on public.message_reports
  for select to authenticated
  using (reporter_profile_id = (select auth.uid()) or private.is_staff_of_message(message_id));

-- Storage: private bucket. Object path: <thread_id>/<uuid>/<filename>. -------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('message-attachments', 'message-attachments', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

create function private.attachment_thread_id(p_name text)
returns uuid language sql immutable set search_path = ''
as $$
  select case when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end;
$$;

create policy "Message attachments: thread readers can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'message-attachments' and private.can_read_thread(private.attachment_thread_id(name)));
create policy "Message attachments: thread posters can upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'message-attachments' and private.can_post_thread(private.attachment_thread_id(name)));

revoke execute on function
  private.can_read_message_id(uuid), private.can_see_reads(uuid), private.is_staff_of_message(uuid),
  private.attachment_thread_id(text) from public, anon, authenticated;
grant execute on function
  private.can_read_message_id(uuid), private.can_see_reads(uuid), private.is_staff_of_message(uuid),
  private.attachment_thread_id(text) to authenticated;
