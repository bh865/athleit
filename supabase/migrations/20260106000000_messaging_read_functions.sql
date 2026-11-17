-- Phase 3 UI read helpers (no new tables): the thread list and unread badge.

create function public.get_thread_list(p_team_id uuid)
returns table (
  thread_id uuid, type text, title text, archived_at timestamptz, last_message_at timestamptz,
  last_message_id uuid, last_body text, last_sender_id uuid, last_sender_name text,
  last_deleted boolean, last_hidden boolean, last_created_at timestamptz,
  unread_count integer, member_count integer, other_name text, muted_until timestamptz)
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
         me.muted_until
  from public.threads t
  left join lateral (
    select m.* from public.messages m
    where m.thread_id = t.id and private.can_read_message(m.thread_id, m.created_at)
    order by m.created_at desc, m.id desc limit 1) lm on true
  left join public.profiles sp on sp.id = lm.sender_profile_id
  left join public.message_reads mr on mr.thread_id = t.id and mr.profile_id = (select auth.uid())
  left join public.messages rm on rm.id = mr.last_read_message_id
  left join public.thread_participants me on me.thread_id = t.id and me.profile_id = (select auth.uid())
  where t.team_id = p_team_id and private.can_read_thread(t.id)
  order by t.last_message_at desc, t.id;
$$;

-- Unread messages across every team, excluding muted threads (sidebar / tab badge).
create function public.get_unread_total()
returns integer language sql stable security definer set search_path = ''
as $$
  select coalesce(count(*), 0)::int
  from public.threads t
  left join public.message_reads mr on mr.thread_id = t.id and mr.profile_id = (select auth.uid())
  left join public.messages rm on rm.id = mr.last_read_message_id
  left join public.thread_participants me on me.thread_id = t.id and me.profile_id = (select auth.uid())
  join public.messages m on m.thread_id = t.id
  where private.can_read_thread(t.id)
    and (me.muted_until is null or me.muted_until <= now())
    and m.sender_profile_id is distinct from (select auth.uid())
    and private.can_read_message(m.thread_id, m.created_at)
    and m.created_at > coalesce(rm.created_at, '-infinity'::timestamptz);
$$;

revoke execute on function public.get_thread_list(uuid), public.get_unread_total() from public, anon, authenticated;
grant execute on function public.get_thread_list(uuid), public.get_unread_total() to authenticated;
