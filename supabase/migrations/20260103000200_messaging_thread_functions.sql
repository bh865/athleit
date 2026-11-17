-- Phase 3 (3/6): thread functions and the youth-safety rules
-- All SECURITY DEFINER, pinned search_path, audited, authenticated only.

-- Profile-argument helpers. Only called from other SECURITY DEFINER code: no API grants.
create function private.is_member_of(p_team_id uuid, p_profile_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.team_memberships tm
                 where tm.team_id = p_team_id and tm.profile_id = p_profile_id and tm.status = 'active');
$$;

create function private.is_staff_of(p_team_id uuid, p_profile_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.team_memberships tm
                 where tm.team_id = p_team_id and tm.profile_id = p_profile_id and tm.status = 'active'
                   and tm.role in ('admin', 'coach', 'manager'));
$$;

-- A minor is a player (with a login, so 13-17) under 18.
create function private.is_minor(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.players p
                 where p.profile_id = p_profile_id
                   and p.date_of_birth > (current_date - interval '18 years')::date);
$$;

create function private.is_guardian_of_profile(p_guardian uuid, p_minor uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.players p
                 join public.household_members hm on hm.household_id = p.household_id
                 where p.profile_id = p_minor and hm.profile_id = p_guardian);
$$;

-- Group threads with any minor need two staff adults, or one staff adult plus a guardian of a
-- minor in the thread. Raised on create, add and remove.
create function private.assert_thread_safety(p_thread_id uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
declare
  t public.threads;
  v_minors int; v_staff int; v_guardians int;
begin
  select * into t from public.threads where id = p_thread_id;
  if t.id is null or t.type <> 'group' then return; end if;
  select count(*) into v_minors from public.thread_participants tp
    where tp.thread_id = p_thread_id and tp.left_at is null and private.is_minor(tp.profile_id);
  if v_minors = 0 then return; end if;
  select count(*) into v_staff from public.thread_participants tp
    where tp.thread_id = p_thread_id and tp.left_at is null
      and not private.is_minor(tp.profile_id) and private.is_staff_of(t.team_id, tp.profile_id);
  select count(*) into v_guardians from public.thread_participants tp
    where tp.thread_id = p_thread_id and tp.left_at is null and not private.is_minor(tp.profile_id)
      and exists (select 1 from public.thread_participants m
                  where m.thread_id = p_thread_id and m.left_at is null
                    and private.is_guardian_of_profile(tp.profile_id, m.profile_id));
  if not (v_staff >= 2 or (v_staff >= 1 and v_guardians >= 1)) then
    raise exception 'minor_group_needs_two_adults'
      using detail = 'A group with a minor needs two staff adults, or a staff member and a guardian.';
  end if;
end;
$$;

-- Staff who may manage a group thread: its owner, or a team admin.
create function private.can_manage_thread(p_thread_id uuid, p_profile_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = p_thread_id and private.is_staff_of(t.team_id, p_profile_id)
      and (exists (select 1 from public.team_memberships tm
                   where tm.team_id = t.team_id and tm.profile_id = p_profile_id
                     and tm.status = 'active' and tm.role = 'admin')
           or exists (select 1 from public.thread_participants tp
                      where tp.thread_id = t.id and tp.profile_id = p_profile_id
                        and tp.left_at is null and tp.role = 'owner')));
$$;

create function public.create_thread(
  p_team_id uuid, p_type text, p_title text, p_participant_ids uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_ids uuid[];
  v_id uuid;
  v_other uuid;
  v_pid uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_type is null or p_type not in ('announcement', 'group', 'direct') then
    raise exception 'invalid_thread_type' using errcode = '23514';
  end if;
  if not private.is_member_of(p_team_id, v_uid) then raise exception 'forbidden' using errcode = '42501'; end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids
  from unnest(coalesce(p_participant_ids, '{}')) x where x is not null and x <> v_uid;
  foreach v_pid in array v_ids loop
    if not private.is_member_of(p_team_id, v_pid) then
      raise exception 'participant_not_in_team' using errcode = 'P0001';
    end if;
  end loop;

  if p_type = 'announcement' then
    if not private.is_staff_of(p_team_id, v_uid) then raise exception 'forbidden' using errcode = '42501'; end if;
    if v_title is null then raise exception 'title_required' using errcode = '23514'; end if;
    insert into public.threads (team_id, type, title, created_by)
      values (p_team_id, 'announcement', v_title, v_uid) returning id into v_id;

  elsif p_type = 'group' then
    -- Only staff create groups; players (13-17) and parents join groups staff create.
    if not private.is_staff_of(p_team_id, v_uid) then raise exception 'forbidden' using errcode = '42501'; end if;
    if v_title is null then raise exception 'title_required' using errcode = '23514'; end if;
    if cardinality(v_ids) < 1 then raise exception 'group_needs_participants' using errcode = 'P0001'; end if;
    insert into public.threads (team_id, type, title, created_by)
      values (p_team_id, 'group', v_title, v_uid) returning id into v_id;
    insert into public.thread_participants (thread_id, profile_id, role) values (v_id, v_uid, 'owner');
    insert into public.thread_participants (thread_id, profile_id, role)
      select v_id, x, 'member' from unnest(v_ids) x;
    perform private.assert_thread_safety(v_id);

  else
    if cardinality(v_ids) <> 1 then raise exception 'direct_needs_one_participant' using errcode = 'P0001'; end if;
    v_other := v_ids[1];
    -- A minor can only be in a 1:1 thread with their own guardian.
    if (private.is_minor(v_uid) and not private.is_guardian_of_profile(v_other, v_uid))
       or (private.is_minor(v_other) and not private.is_guardian_of_profile(v_uid, v_other)) then
      raise exception 'direct_minor_guardian_only'
        using errcode = 'P0001', detail = 'Message the minor''s guardian instead.';
    end if;
    select t.id into v_id from public.threads t
    where t.team_id = p_team_id and t.type = 'direct'
      and exists (select 1 from public.thread_participants a where a.thread_id = t.id and a.profile_id = v_uid)
      and exists (select 1 from public.thread_participants b where b.thread_id = t.id and b.profile_id = v_other)
    limit 1;
    if v_id is not null then return v_id; end if;
    insert into public.threads (team_id, type, created_by) values (p_team_id, 'direct', v_uid) returning id into v_id;
    insert into public.thread_participants (thread_id, profile_id, role)
      values (v_id, v_uid, 'owner'), (v_id, v_other, 'member');
  end if;

  perform private.write_audit('thread.create', 'threads', v_id, p_team_id, null, null,
    jsonb_build_object('type', p_type, 'participants', coalesce(to_jsonb(v_ids), '[]'::jsonb)));
  return v_id;
end;
$$;

create function public.add_participant(p_thread_id uuid, p_profile_id uuid, p_role text default 'member')
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  t public.threads;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into t from public.threads where id = p_thread_id;
  if t.id is null or not private.can_manage_thread(p_thread_id, v_uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if t.type <> 'group' then raise exception 'not_a_group' using errcode = 'P0001'; end if;
  if t.archived_at is not null then raise exception 'thread_archived' using errcode = 'P0001'; end if;
  if p_role not in ('member', 'read_only') then raise exception 'invalid_role' using errcode = '23514'; end if;
  if not private.is_member_of(t.team_id, p_profile_id) then
    raise exception 'participant_not_in_team' using errcode = 'P0001';
  end if;
  -- Re-adding resets joined_at, so history from the gap stays hidden from non-staff.
  insert into public.thread_participants (thread_id, profile_id, role)
    values (p_thread_id, p_profile_id, p_role)
    on conflict (thread_id, profile_id) do update
      set role = excluded.role, left_at = null, joined_at = now()
      where public.thread_participants.left_at is not null;
  perform private.assert_thread_safety(p_thread_id);
  perform private.write_audit('thread.add_participant', 'threads', p_thread_id, t.team_id, null, null,
    jsonb_build_object('profile_id', p_profile_id, 'role', p_role));
end;
$$;

create function public.remove_participant(p_thread_id uuid, p_profile_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  t public.threads;
  v_rows int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into t from public.threads where id = p_thread_id;
  if t.id is null or not (p_profile_id = v_uid or private.can_manage_thread(p_thread_id, v_uid)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if t.type <> 'group' then raise exception 'not_a_group' using errcode = 'P0001'; end if;
  update public.thread_participants set left_at = now()
    where thread_id = p_thread_id and profile_id = p_profile_id and left_at is null;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'not_a_participant' using errcode = 'P0001'; end if;
  perform private.assert_thread_safety(p_thread_id);
  perform private.write_audit('thread.remove_participant', 'threads', p_thread_id, t.team_id, null,
    jsonb_build_object('profile_id', p_profile_id), null);
end;
$$;

-- Mute a thread (null unmutes). For announcements a participant row only carries the mute.
create function public.set_thread_mute(p_thread_id uuid, p_until timestamptz)
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
    insert into public.thread_participants (thread_id, profile_id, role, muted_until)
      values (p_thread_id, v_uid, 'read_only', p_until)
      on conflict (thread_id, profile_id) do update set muted_until = excluded.muted_until;
  else
    update public.thread_participants set muted_until = p_until
      where thread_id = p_thread_id and profile_id = v_uid and left_at is null;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'not_a_participant' using errcode = 'P0001'; end if;
  end if;
end;
$$;

create function public.set_thread_archived(p_thread_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  t public.threads;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into t from public.threads where id = p_thread_id;
  if t.id is null or not (private.can_manage_thread(p_thread_id, v_uid)
      or (t.type = 'announcement' and private.is_staff_of(t.team_id, v_uid))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.threads set archived_at = case when p_archived then now() end where id = p_thread_id;
  perform private.write_audit('thread.archive', 'threads', p_thread_id, t.team_id, null, null,
    jsonb_build_object('archived', p_archived));
end;
$$;

-- Names for a thread's members (profiles are own-row only under RLS). Announcement threads
-- list only the team's staff (the possible authors), never families.
create function public.get_thread_members(p_thread_id uuid)
returns table (profile_id uuid, display_name text, role text, joined_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select tp.profile_id, pr.display_name, tp.role, tp.joined_at
  from public.threads t
  join public.thread_participants tp on tp.thread_id = t.id and tp.left_at is null
  join public.profiles pr on pr.id = tp.profile_id
  where t.id = p_thread_id and t.type <> 'announcement' and private.can_read_thread(t.id)
  union all
  select tm.profile_id, pr.display_name, 'staff', min(tm.created_at)
  from public.threads t
  join public.team_memberships tm on tm.team_id = t.team_id and tm.status = 'active'
       and tm.role in ('admin', 'coach', 'manager')
  join public.profiles pr on pr.id = tm.profile_id
  where t.id = p_thread_id and t.type = 'announcement' and private.can_read_thread(t.id)
  group by tm.profile_id, pr.display_name;
$$;

revoke execute on function
  private.is_member_of(uuid, uuid), private.is_staff_of(uuid, uuid), private.is_minor(uuid),
  private.is_guardian_of_profile(uuid, uuid), private.assert_thread_safety(uuid),
  private.can_manage_thread(uuid, uuid) from public, anon, authenticated;

revoke execute on function
  public.create_thread(uuid, text, text, uuid[]), public.add_participant(uuid, uuid, text),
  public.remove_participant(uuid, uuid), public.set_thread_mute(uuid, timestamptz),
  public.set_thread_archived(uuid, boolean), public.get_thread_members(uuid)
  from public, anon, authenticated;
grant execute on function
  public.create_thread(uuid, text, text, uuid[]), public.add_participant(uuid, uuid, text),
  public.remove_participant(uuid, uuid), public.set_thread_mute(uuid, timestamptz),
  public.set_thread_archived(uuid, boolean), public.get_thread_members(uuid)
  to authenticated;
