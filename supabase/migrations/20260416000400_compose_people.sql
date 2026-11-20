-- Messages redesign (5/5): who the caller can start a conversation with, and whether a DIRECT
-- thread is allowed. The rule "a minor is only in a 1:1 thread with their own guardian" is
-- factored into private.can_direct_message, used by create_thread (the authority) and by
-- get_compose_people, so the clients never re-implement it.

create function private.can_direct_message(p_from uuid, p_to uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select not ((private.is_minor(p_from) and not private.is_guardian_of_profile(p_to, p_from))
              or (private.is_minor(p_to) and not private.is_guardian_of_profile(p_from, p_to)));
$$;
revoke execute on function private.can_direct_message(uuid, uuid) from public, anon, authenticated;
grant execute on function private.can_direct_message(uuid, uuid) to authenticated;

create or replace function public.create_thread(
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
    if not private.can_direct_message(v_uid, v_other) then
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

revoke execute on function public.create_thread(uuid, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.create_thread(uuid, text, text, uuid[]) to authenticated;

-- Same people as get_messageable_people, plus can_direct and a reason code.
create function public.get_compose_people(p_team_id uuid)
returns table (
  profile_id uuid, display_name text, role public.team_role, is_minor boolean,
  can_direct boolean, reason text)
language sql stable security definer set search_path = ''
as $$
  select p.profile_id, p.display_name, p.role, p.is_minor,
         private.can_direct_message((select auth.uid()), p.profile_id),
         case when private.can_direct_message((select auth.uid()), p.profile_id) then null
              else 'direct_minor_guardian_only' end
  from public.get_messageable_people(p_team_id) p
  order by p.display_name;
$$;
revoke execute on function public.get_compose_people(uuid) from public, anon, authenticated;
grant execute on function public.get_compose_people(uuid) to authenticated;
