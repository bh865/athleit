-- Schedule redesign, 3c: staff can nudge families who have not replied.
-- Reuses the existing reminder path: the same 'schedule' category, the same 'reminder' change and copy
-- ("RSVP needed: Sat, Nov 21 · 10:00 AM"), delivered through private.enqueue_notification so each recipient's
-- notification preferences and quiet hours apply. The text never carries a child's name or anyone's reply.
-- One nudge per event per 6 hours, enforced here with a small log table (one row per event).

create table public.event_nudges (
  event_id uuid primary key references public.events (id) on delete cascade,
  nudged_at timestamptz not null default now(),
  nudged_by uuid references public.profiles (id) on delete set null,
  recipients integer not null default 0
);
alter table public.event_nudges enable row level security;
-- No policies and no grants: only nudge_rsvp_non_responders (security definer) touches it.
revoke all on public.event_nudges from public, anon, authenticated;

create function public.nudge_rsvp_non_responders(p_event_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  e public.events;
  v_claimed uuid;
  v_n integer := 0;
  v_stamp text;
  v_payload jsonb;
  r record;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.events where id = p_event_id;
  if e.id is null or not private.is_team_staff(e.team_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if e.status = 'cancelled' then raise exception 'event_cancelled' using errcode = '23514'; end if;
  if e.ends_at < now() then raise exception 'event_over' using errcode = '23514'; end if;

  -- Claim the 6-hour window atomically; a second nudge inside it matches no row.
  insert into public.event_nudges (event_id, nudged_at, nudged_by, recipients)
  values (e.id, now(), v_uid, 0)
  on conflict (event_id) do update
    set nudged_at = now(), nudged_by = v_uid, recipients = 0
    where public.event_nudges.nudged_at <= now() - interval '6 hours'
  returning event_id into v_claimed;
  if v_claimed is null then raise exception 'nudged_recently' using errcode = '23514'; end if;

  v_stamp := floor(extract(epoch from now()))::bigint::text;
  v_payload := jsonb_build_object('kind', 'schedule', 'change', 'reminder', 'event_id', e.id, 'team_id', e.team_id,
    'title', left(e.title, 100), 'count', 1,
    'body', 'RSVP needed: ' || to_char(e.starts_at at time zone e.timezone, 'Dy, Mon FMDD · FMHH12:MI AM'));

  -- Guardians of, and 13+ players with their own login for, active players with no reply.
  for r in
    select distinct x.profile_id from (
      select hm.profile_id
        from public.team_players tp
        join public.players p on p.id = tp.player_id
        join public.household_members hm on hm.household_id = p.household_id and hm.relationship = 'guardian'
        left join public.rsvps rs on rs.event_id = e.id and rs.player_id = p.id
        where tp.team_id = e.team_id and tp.status = 'active' and rs.id is null
      union all
      select p.profile_id
        from public.team_players tp
        join public.players p on p.id = tp.player_id
        left join public.rsvps rs on rs.event_id = e.id and rs.player_id = p.id
        where tp.team_id = e.team_id and tp.status = 'active' and rs.id is null and p.profile_id is not null
    ) x where x.profile_id is not null
  loop
    perform private.enqueue_notification(r.profile_id, 'schedule', v_payload,
      'sch:nudge:' || e.id || ':' || r.profile_id || ':' || v_stamp);
    v_n := v_n + 1;
  end loop;

  update public.event_nudges set recipients = v_n where event_id = e.id;
  perform private.write_audit('event.nudge', 'events', e.id, e.team_id, null, null,
    jsonb_build_object('recipients', v_n));
  return v_n;
end;
$$;
revoke execute on function public.nudge_rsvp_non_responders(uuid) from public, anon, authenticated;
grant execute on function public.nudge_rsvp_non_responders(uuid) to authenticated;
