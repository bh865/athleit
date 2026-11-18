-- Phase 5 (Part C): the waiver-expiry notices now say who they are for, so the app can open the right screen
-- (guardians: their registrations; staff: the team's waiver tracker). Same recipients, same dedupe keys, same counts.
create or replace function private.waiver_expiry_notices()
returns integer language plpgsql security definer set search_path = ''
as $$
declare r record; g record; s record; v_sent integer := 0;
begin
  for r in
    select distinct on (a.player_id, v.waiver_id) a.id as acceptance_id, a.player_id, w.title, tp.team_id, p.household_id,
           a.accepted_at + make_interval(days => v.requires_resign_after_days) as expires_at
    from public.waiver_acceptances a
    join public.waiver_versions v on v.id = a.waiver_version_id and v.requires_resign_after_days is not null
    join public.waivers w on w.id = v.waiver_id
    join public.players p on p.id = a.player_id
    join public.team_players tp on tp.player_id = a.player_id and tp.status = 'active'
    join public.team_required_waivers rw on rw.team_id = tp.team_id and rw.waiver_id = w.id
    where a.player_id is not null
    order by a.player_id, v.waiver_id, a.accepted_at desc
  loop
    continue when r.expires_at < now() or r.expires_at > now() + interval '14 days';
    for g in select hm.profile_id from public.household_members hm where hm.household_id = r.household_id and hm.relationship = 'guardian' loop
      perform private.enqueue_notification(g.profile_id, 'registration',
        jsonb_build_object('kind', 'registration', 'title', 'Waiver renewal needed', 'body', left(r.title, 100) || ' expires soon',
          'team_id', r.team_id, 'audience', 'family'),
        'waiverexp:' || r.acceptance_id || ':' || g.profile_id);
      v_sent := v_sent + 1;
    end loop;
  end loop;
  -- One batched notice per team for staff.
  for s in
    select tp.team_id, count(distinct (a.player_id, v.waiver_id))::int as n
    from public.waiver_acceptances a
    join public.waiver_versions v on v.id = a.waiver_version_id and v.requires_resign_after_days is not null
    join public.team_players tp on tp.player_id = a.player_id and tp.status = 'active'
    join public.team_required_waivers rw on rw.team_id = tp.team_id and rw.waiver_id = v.waiver_id
    where a.player_id is not null
      and a.accepted_at + make_interval(days => v.requires_resign_after_days) between now() and now() + interval '14 days'
      and not exists (select 1 from public.waiver_acceptances a2 join public.waiver_versions v2 on v2.id = a2.waiver_version_id
                      where a2.player_id = a.player_id and v2.waiver_id = v.waiver_id and a2.accepted_at > a.accepted_at)
    group by tp.team_id
  loop
    for g in select * from private.registration_managers(s.team_id, null) loop
      perform private.enqueue_notification(g.profile_id, 'registration',
        jsonb_build_object('kind', 'registration', 'title', 'Waivers expiring soon',
          'body', s.n || case when s.n = 1 then ' waiver expires' else ' waivers expire' end || ' within 14 days', 'team_id', s.team_id,
          'audience', 'staff'),
        'waiverexp-staff:' || s.team_id || ':' || g.profile_id || ':' || current_date);
      v_sent := v_sent + 1;
    end loop;
  end loop;
  return v_sent;
end;
$$;
