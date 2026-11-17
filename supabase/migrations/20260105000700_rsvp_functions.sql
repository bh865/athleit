-- Phase 2 (8/9): RSVP functions
--
-- Who may RSVP for a player (set_rsvp): a guardian of the player (always, and the only way for
-- children under 13), or a 13+ player's own login. Staff use staff_set_rsvp, which marks the
-- row set_by_staff and audits it. The roster rule (active player on the event's team) is
-- enforced by the rsvps trigger. Parents, players and club admins get counts only.

create function public.set_rsvp(p_event_id uuid, p_player_id uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  e public.events;
  v_age_ok boolean;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.events where id = p_event_id;
  if e.id is null then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  select p.date_of_birth <= (current_date - interval '13 years')::date into v_age_ok
    from public.players p where p.id = p_player_id;
  if not (private.is_guardian_of(p_player_id) or (private.is_player_self(p_player_id) and coalesce(v_age_ok, false))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('going', 'not_going', 'maybe') then raise exception 'invalid_status' using errcode = '23514'; end if;
  if e.status = 'cancelled' then raise exception 'event_cancelled' using errcode = '23514'; end if;
  if e.ends_at < now() then raise exception 'event_over' using errcode = '23514'; end if;

  insert into public.rsvps (event_id, player_id, team_id, status, note, responded_by, responded_at, set_by_staff)
  values (p_event_id, p_player_id, e.team_id, p_status, nullif(btrim(p_note), ''), v_uid, now(), false)
  on conflict (event_id, player_id) do update
    set status = excluded.status, note = excluded.note, responded_by = excluded.responded_by,
        responded_at = excluded.responded_at, set_by_staff = false;
end;
$$;

create function public.staff_set_rsvp(p_event_id uuid, p_player_id uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  e public.events;
  v_prev text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.events where id = p_event_id;
  if e.id is null or not private.is_team_staff(e.team_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('going', 'not_going', 'maybe') then raise exception 'invalid_status' using errcode = '23514'; end if;
  if e.status = 'cancelled' then raise exception 'event_cancelled' using errcode = '23514'; end if;
  select r.status into v_prev from public.rsvps r where r.event_id = p_event_id and r.player_id = p_player_id;

  insert into public.rsvps (event_id, player_id, team_id, status, note, responded_by, responded_at, set_by_staff)
  values (p_event_id, p_player_id, e.team_id, p_status, nullif(btrim(p_note), ''), v_uid, now(), true)
  on conflict (event_id, player_id) do update
    set status = excluded.status, note = excluded.note, responded_by = excluded.responded_by,
        responded_at = excluded.responded_at, set_by_staff = true
  returning id into v_id;
  perform private.write_audit('rsvp.staff_set', 'rsvps', v_id, e.team_id, null,
    case when v_prev is null then null else jsonb_build_object('status', v_prev) end,
    jsonb_build_object('event_id', p_event_id, 'player_id', p_player_id, 'status', p_status));
end;
$$;

-- Counts over the ACTIVE roster: going / not_going / maybe, and no_reply = active players with no row.
create function private.rsvp_counts(p_event_id uuid, p_team_id uuid)
returns table (going integer, not_going integer, maybe integer, no_reply integer)
language sql stable security definer set search_path = ''
as $$
  select (count(*) filter (where r.status = 'going'))::int,
         (count(*) filter (where r.status = 'not_going'))::int,
         (count(*) filter (where r.status = 'maybe'))::int,
         (count(*) filter (where r.id is null))::int
  from public.team_players tp
  left join public.rsvps r on r.event_id = p_event_id and r.player_id = tp.player_id
  where tp.team_id = p_team_id and tp.status = 'active';
$$;

-- Any viewer of the event (staff, rostered families, linked club admins). Counts only, no names.
create function public.event_rsvp_summary(p_event_id uuid)
returns table (going integer, not_going integer, maybe integer, no_reply integer)
language sql stable security definer set search_path = ''
as $$
  select c.going, c.not_going, c.maybe, c.no_reply
  from public.events e
  cross join lateral private.rsvp_counts(e.id, e.team_id) c
  where e.id = p_event_id and private.can_view_team_schedule(e.team_id);
$$;

-- Staff only: every active rostered player with their status (null = no reply), names and notes.
create function public.event_rsvp_detail(p_event_id uuid)
returns table (player_id uuid, first_name text, last_name text, jersey_number smallint, status text,
               note text, responded_at timestamptz, set_by_staff boolean, responded_by_name text)
language plpgsql stable security definer set search_path = ''
as $$
declare v_team uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select e.team_id into v_team from public.events e where e.id = p_event_id;
  if v_team is null or not private.is_team_staff(v_team) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select p.id, p.first_name, p.last_name, tp.jersey_number, r.status, r.note, r.responded_at,
           r.set_by_staff, pr.display_name
    from public.team_players tp
    join public.players p on p.id = tp.player_id
    left join public.rsvps r on r.event_id = p_event_id and r.player_id = tp.player_id
    left join public.profiles pr on pr.id = r.responded_by
    where tp.team_id = v_team and tp.status = 'active'
    order by tp.jersey_number nulls last, p.first_name;
end;
$$;

revoke execute on function private.rsvp_counts(uuid, uuid) from public, anon, authenticated;
revoke execute on function
  public.set_rsvp(uuid, uuid, text, text), public.staff_set_rsvp(uuid, uuid, text, text),
  public.event_rsvp_summary(uuid), public.event_rsvp_detail(uuid) from public, anon, authenticated;
grant execute on function
  public.set_rsvp(uuid, uuid, text, text), public.staff_set_rsvp(uuid, uuid, text, text),
  public.event_rsvp_summary(uuid), public.event_rsvp_detail(uuid) to authenticated;
