-- Messages redesign (1/5): per-person pin and archive.
--
-- thread_participants gains pinned_at and archived_at, both on the caller's OWN row and
-- written only through the two functions below (clients can only select, as with muted_until).
-- "Archived for me" is computed, never stored as a flag: archived_at >= threads.last_message_at,
-- so a new message returns the thread to the inbox with no trigger. Archiving never blocks
-- posting. The existing set_thread_archived stays thread-wide and manager-only.
--
-- Announcements have no participant list: like set_thread_mute these upsert a read_only row
-- that only carries personal state and grants nothing (can_read_thread/can_post_thread never
-- look at read_only rows for announcements, and a stranger fails the can_read_thread gate first).

alter table public.thread_participants
  add column pinned_at timestamptz,
  add column archived_at timestamptz;

create function public.set_thread_pinned(p_thread_id uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  t public.threads;
  v_rows int;
  v_pins int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into t from public.threads where id = p_thread_id;
  if t.id is null or not private.can_read_thread(p_thread_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_pinned then
    select count(*) into v_pins from public.thread_participants tp
      where tp.profile_id = v_uid and tp.pinned_at is not null and tp.left_at is null
        and tp.thread_id <> p_thread_id;
    if v_pins >= 5 then
      raise exception 'pin_limit_reached' using errcode = 'P0001',
        detail = 'You can pin up to 5 conversations.';
    end if;
  end if;

  if t.type = 'announcement' then
    insert into public.thread_participants (thread_id, profile_id, role, pinned_at)
      values (p_thread_id, v_uid, 'read_only', case when p_pinned then now() end)
      on conflict (thread_id, profile_id) do update set pinned_at = excluded.pinned_at;
  else
    update public.thread_participants set pinned_at = case when p_pinned then now() end
      where thread_id = p_thread_id and profile_id = v_uid and left_at is null;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'not_a_participant' using errcode = 'P0001'; end if;
  end if;
end;
$$;

create function public.set_thread_archived_for_me(p_thread_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  t public.threads;
  v_rows int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into t from public.threads where id = p_thread_id;
  if t.id is null or not private.can_read_thread(p_thread_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if t.type = 'announcement' then
    insert into public.thread_participants (thread_id, profile_id, role, archived_at)
      values (p_thread_id, v_uid, 'read_only', case when p_archived then now() end)
      on conflict (thread_id, profile_id) do update set archived_at = excluded.archived_at;
  else
    update public.thread_participants set archived_at = case when p_archived then now() end
      where thread_id = p_thread_id and profile_id = v_uid and left_at is null;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'not_a_participant' using errcode = 'P0001'; end if;
  end if;
end;
$$;

revoke execute on function public.set_thread_pinned(uuid, boolean), public.set_thread_archived_for_me(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_thread_pinned(uuid, boolean), public.set_thread_archived_for_me(uuid, boolean)
  to authenticated;
