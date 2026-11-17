-- Phase 3 (1/6): threads, thread participants, messages
--
-- Writes happen only through SECURITY DEFINER functions (next migrations); clients can only
-- read, and only what the helpers below allow. Nothing about who may read or post is stored on
-- a message: it is derived from team_memberships and thread_participants.
--
-- Announcement audience: an announcement thread has NO participant rows. Its audience is every
-- active member of the thread's team, evaluated live (private.is_team_member). A participant row
-- may exist for an announcement only to carry a personal mute (muted_until); it grants nothing.
-- Group and direct threads use thread_participants.

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  type text not null constraint threads_type_check check (type in ('announcement', 'group', 'direct')),
  title text constraint threads_title_length check (char_length(btrim(title)) between 1 and 100),
  created_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint threads_title_required check (type = 'direct' or title is not null)
);
create index threads_team_last_message_idx on public.threads (team_id, last_message_at desc);
create index threads_created_by_idx on public.threads (created_by) where created_by is not null;

create table public.thread_participants (
  thread_id uuid not null references public.threads (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null constraint thread_participants_role_check check (role in ('owner', 'member', 'read_only')),
  muted_until timestamptz,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (thread_id, profile_id)
);
create index thread_participants_profile_idx on public.thread_participants (profile_id, thread_id)
  where left_at is null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  sender_profile_id uuid references public.profiles (id) on delete set null,
  -- Emptied (never deleted) when a message is deleted or hidden; the original is kept in audit_log.
  body text not null default '' constraint messages_body_length check (char_length(body) <= 4000),
  reply_to_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null,
  hidden_at timestamptz,
  constraint messages_hidden_pair check ((hidden_by is null) = (hidden_at is null) or hidden_by is null)
);
-- Pagination (newest first within a thread) and the in-DB rate limit.
create index messages_thread_created_idx on public.messages (thread_id, created_at desc, id desc);
create index messages_sender_created_idx on public.messages (sender_profile_id, created_at desc);
create index messages_reply_to_idx on public.messages (reply_to_id) where reply_to_id is not null;
create index messages_hidden_by_idx on public.messages (hidden_by) where hidden_by is not null;

-- Helpers (SECURITY DEFINER, pinned search_path, never recurse into the tables they guard) ----

-- Can the caller see this thread at all?
--  * announcement: any active member of the team
--  * group/direct: an active participant who is still an active team member
--  * group (not direct): additionally team admins, for moderation oversight
create function private.can_read_thread(p_thread_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = p_thread_id
      and (
        (t.type = 'announcement' and private.is_team_member(t.team_id))
        or (t.type <> 'announcement' and private.is_team_member(t.team_id)
            and exists (select 1 from public.thread_participants tp
                        where tp.thread_id = t.id and tp.profile_id = (select auth.uid())
                          and tp.left_at is null))
        or (t.type = 'group' and private.has_team_role(t.team_id, array['admin']::public.team_role[]))
      ));
$$;

-- Can the caller see a message created at p_created_at in this thread?
-- Non-staff only see messages from the time they joined onward; staff of the team see all history.
create function private.can_read_message(p_thread_id uuid, p_created_at timestamptz)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.can_read_thread(p_thread_id)
    and exists (
      select 1 from public.threads t
      where t.id = p_thread_id
        and (
          private.is_team_staff(t.team_id)
          or p_created_at >= case
            when t.type = 'announcement' then
              (select min(tm.created_at) from public.team_memberships tm
               where tm.team_id = t.team_id and tm.profile_id = (select auth.uid()) and tm.status = 'active')
            else
              (select tp.joined_at from public.thread_participants tp
               where tp.thread_id = t.id and tp.profile_id = (select auth.uid()) and tp.left_at is null)
          end
        ));
$$;

-- Can the caller post in this thread (not archived; staff in announcements; owner/member elsewhere)?
create function private.can_post_thread(p_thread_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = p_thread_id and t.archived_at is null
      and (
        (t.type = 'announcement' and private.is_team_staff(t.team_id))
        or (t.type <> 'announcement' and private.is_team_member(t.team_id)
            and exists (select 1 from public.thread_participants tp
                        where tp.thread_id = t.id and tp.profile_id = (select auth.uid())
                          and tp.left_at is null and tp.role in ('owner', 'member')))
      ));
$$;

-- May the caller see the other participants of this thread? (Never for announcements.)
create function private.can_see_participants(p_thread_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.can_read_thread(p_thread_id)
    and exists (select 1 from public.threads t where t.id = p_thread_id and t.type <> 'announcement');
$$;

-- RLS ------------------------------------------------------------------------
alter table public.threads enable row level security;
alter table public.thread_participants enable row level security;
alter table public.messages enable row level security;

revoke all on public.threads, public.thread_participants, public.messages from anon, authenticated;
grant select on public.threads, public.thread_participants, public.messages to authenticated;

create policy "Read threads you belong to" on public.threads
  for select to authenticated using (private.can_read_thread(id));

create policy "Read your own participation and your thread's participants" on public.thread_participants
  for select to authenticated
  using (profile_id = (select auth.uid()) or private.can_see_participants(thread_id));

create policy "Read messages from your join time onward" on public.messages
  for select to authenticated using (private.can_read_message(thread_id, created_at));

revoke execute on function
  private.can_read_thread(uuid), private.can_read_message(uuid, timestamptz),
  private.can_post_thread(uuid), private.can_see_participants(uuid)
  from public, anon, authenticated;
grant execute on function
  private.can_read_thread(uuid), private.can_read_message(uuid, timestamptz),
  private.can_post_thread(uuid), private.can_see_participants(uuid)
  to authenticated;
