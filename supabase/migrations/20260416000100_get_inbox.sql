-- Messages redesign (2/5): one inbox across every team.
--
-- The visibility logic lives in ONE place, private.inbox_rows: get_thread_list (per team, kept
-- for existing callers) and get_inbox (all teams) both read from it, so they cannot drift.
-- Unread excludes the caller's own messages and honours the join-time rule exactly as before.

create function private.inbox_rows(p_team_id uuid default null)
returns table (
  thread_id uuid, type text, title text, archived_at timestamptz, last_message_at timestamptz,
  last_message_id uuid, last_body text, last_sender_id uuid, last_sender_name text,
  last_deleted boolean, last_hidden boolean, last_created_at timestamptz,
  unread_count integer, member_count integer, other_name text, muted_until timestamptz,
  team_id uuid, pinned_at timestamptz, my_archived_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.type, t.title, t.archived_at, t.last_message_at,
         lm.id, lm.body, lm.sender_profile_id, sp.display_name,
         lm.deleted_at is not null, lm.hidden_at is not null, lm.created_at,
         (select count(*)::int from public.messages m2
          where m2.thread_id = t.id and m2.sender_profile_id is distinct from (select auth.uid())
            and private.can_read_message(m2.thread_id, m2.created_at)
            and m2.created_at > coalesce(rm.created_at, '-infinity'::timestamptz)),
         case when t.type = 'announcement'
              then (select count(distinct tm.profile_id)::int from public.team_memberships tm
                    where tm.team_id = t.team_id and tm.status = 'active')
              else (select count(*)::int from public.thread_participants tp
                    where tp.thread_id = t.id and tp.left_at is null) end,
         case when t.type = 'direct' then
              (select op.display_name from public.thread_participants tp2
               join public.profiles op on op.id = tp2.profile_id
               where tp2.thread_id = t.id and tp2.left_at is null
                 and tp2.profile_id <> (select auth.uid()) limit 1) end,
         me.muted_until,
         t.team_id, me.pinned_at, me.archived_at
  from public.threads t
  left join lateral (
    select m.* from public.messages m
    where m.thread_id = t.id and private.can_read_message(m.thread_id, m.created_at)
    order by m.created_at desc, m.id desc limit 1) lm on true
  left join public.profiles sp on sp.id = lm.sender_profile_id
  left join public.message_reads mr on mr.thread_id = t.id and mr.profile_id = (select auth.uid())
  left join public.messages rm on rm.id = mr.last_read_message_id
  left join public.thread_participants me on me.thread_id = t.id and me.profile_id = (select auth.uid())
  where (p_team_id is null or t.team_id = p_team_id) and private.can_read_thread(t.id);
$$;

revoke execute on function private.inbox_rows(uuid) from public, anon, authenticated;
grant execute on function private.inbox_rows(uuid) to authenticated;

-- Same signature and output as before; now a thin wrapper over the shared helper.
create or replace function public.get_thread_list(p_team_id uuid)
returns table (
  thread_id uuid, type text, title text, archived_at timestamptz, last_message_at timestamptz,
  last_message_id uuid, last_body text, last_sender_id uuid, last_sender_name text,
  last_deleted boolean, last_hidden boolean, last_created_at timestamptz,
  unread_count integer, member_count integer, other_name text, muted_until timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.thread_id, r.type, r.title, r.archived_at, r.last_message_at,
         r.last_message_id, r.last_body, r.last_sender_id, r.last_sender_name,
         r.last_deleted, r.last_hidden, r.last_created_at,
         r.unread_count, r.member_count, r.other_name, r.muted_until
  from private.inbox_rows(p_team_id) r
  where p_team_id is not null
  order by r.last_message_at desc, r.thread_id;
$$;

-- Pagination: the first page (no cursor) returns every pinned thread (at most 5) plus the first
-- p_limit others; later pages pass the last (last_message_at, thread_id) of the previous page
-- and return only unpinned threads older than that cursor.
create function public.get_inbox(
  p_limit integer default 50, p_before_at timestamptz default null, p_before_id uuid default null)
returns table (
  thread_id uuid, type text, title text, archived_at timestamptz, last_message_at timestamptz,
  last_message_id uuid, last_body text, last_sender_id uuid, last_sender_name text,
  last_deleted boolean, last_hidden boolean, last_created_at timestamptz,
  unread_count integer, member_count integer, other_name text, muted_until timestamptz,
  team_id uuid, team_name text, sport text, other_profile_id uuid,
  pinned_at timestamptz, archived_for_me boolean,
  last_read_count integer, last_read_total integer)
language sql stable security definer set search_path = ''
as $$
  with page as (
    select r.* from private.inbox_rows(null) r
    where (p_before_at is null and p_before_id is null and r.pinned_at is not null)
       or (r.pinned_at is null
           and (p_before_at is null
                or (r.last_message_at, r.thread_id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))))
    order by (r.pinned_at is null), r.pinned_at desc nulls last, r.last_message_at desc, r.thread_id desc
    limit greatest(1, least(coalesce(p_limit, 50), 100)) + case when p_before_at is null then 5 else 0 end
  )
  select r.thread_id, r.type, r.title, r.archived_at, r.last_message_at,
         r.last_message_id, r.last_body, r.last_sender_id, r.last_sender_name,
         r.last_deleted, r.last_hidden, r.last_created_at,
         r.unread_count, r.member_count, r.other_name, r.muted_until,
         r.team_id, tm.name, tm.sport::text,
         case when r.type = 'direct' then
              (select tp.profile_id from public.thread_participants tp
               where tp.thread_id = r.thread_id and tp.left_at is null
                 and tp.profile_id <> (select auth.uid()) limit 1) end,
         r.pinned_at,
         (r.my_archived_at is not null and r.my_archived_at >= r.last_message_at),
         rc.read_count, rc.read_total
  from page r
  join public.teams tm on tm.id = r.team_id
  left join lateral (
    -- Staff only, and only when the caller's own message is the newest one.
    select (select count(*)::int from public.message_reads mr2
            join public.messages rm2 on rm2.id = mr2.last_read_message_id
            where mr2.thread_id = r.thread_id and mr2.profile_id <> (select auth.uid())
              and rm2.created_at >= r.last_created_at
              and (r.type = 'announcement' and private.is_member_of(r.team_id, mr2.profile_id)
                   or r.type <> 'announcement' and exists (
                        select 1 from public.thread_participants p2
                        where p2.thread_id = r.thread_id and p2.profile_id = mr2.profile_id and p2.left_at is null))
           ) as read_count,
           case when r.type = 'announcement'
                then (select count(*)::int from public.team_memberships tm2
                      where tm2.team_id = r.team_id and tm2.status = 'active' and tm2.profile_id <> (select auth.uid()))
                else (select count(*)::int from public.thread_participants p3
                      where p3.thread_id = r.thread_id and p3.left_at is null and p3.profile_id <> (select auth.uid()))
           end as read_total
    where r.last_sender_id = (select auth.uid())
      and not r.last_deleted and not r.last_hidden
      and private.is_staff_of(r.team_id, (select auth.uid()))
  ) rc on true
  order by (r.pinned_at is null), r.pinned_at desc nulls last, r.last_message_at desc, r.thread_id desc;
$$;

revoke execute on function public.get_thread_list(uuid), public.get_inbox(integer, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.get_thread_list(uuid), public.get_inbox(integer, timestamptz, uuid)
  to authenticated;
