-- Phase 2 (9/9 part 1): record_game_result, clear_game_result, team_record
--
-- Validation against the sport (ties, period shapes, totals) is in the game_results trigger.
-- A result can only be entered once the game has started and while it is not cancelled.

create function public.record_game_result(
  p_event_id uuid, p_our_score integer, p_their_score integer,
  p_period_scores jsonb default null, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  e public.events;
  v_prev public.game_results;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.events where id = p_event_id;
  if e.id is null or not private.is_team_staff(e.team_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if e.type <> 'game' then raise exception 'results_only_for_games' using errcode = '23514'; end if;
  if e.status = 'cancelled' then raise exception 'event_cancelled' using errcode = '23514'; end if;
  if e.starts_at > now() then raise exception 'event_not_started' using errcode = '23514'; end if;
  select * into v_prev from public.game_results where event_id = p_event_id;

  insert into public.game_results (event_id, our_score, their_score, period_scores, notes, entered_by)
  values (p_event_id, p_our_score, p_their_score, p_period_scores, nullif(btrim(p_notes), ''), v_uid)
  on conflict (event_id) do update
    set our_score = excluded.our_score, their_score = excluded.their_score,
        period_scores = excluded.period_scores, notes = excluded.notes, entered_by = excluded.entered_by,
        entered_at = now()
  returning id into v_id;
  perform private.write_audit('game_result.record', 'game_results', v_id, e.team_id, null,
    case when v_prev.id is null then null
         else jsonb_build_object('our_score', v_prev.our_score, 'their_score', v_prev.their_score) end,
    jsonb_build_object('event_id', p_event_id, 'our_score', p_our_score, 'their_score', p_their_score));
  return v_id;
end;
$$;

create function public.clear_game_result(p_event_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  v_prev public.game_results;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into e from public.events where id = p_event_id;
  if e.id is null or not private.is_team_staff(e.team_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.game_results where event_id = p_event_id returning * into v_prev;
  if v_prev.id is null then raise exception 'no_result' using errcode = 'P0002'; end if;
  perform private.write_audit('game_result.clear', 'game_results', v_prev.id, e.team_id, null,
    jsonb_build_object('our_score', v_prev.our_score, 'their_score', v_prev.their_score), null);
end;
$$;

-- Win/loss/tie record from completed (resulted, not cancelled) games, for the team's season label.
-- A function rather than a view so it needs no extra table grants and works for every viewer.
create function public.team_record(p_team_id uuid)
returns table (season_label text, wins integer, losses integer, ties integer, games integer)
language sql stable security definer set search_path = ''
as $$
  select t.season_label,
         (count(*) filter (where g.outcome = 'win'))::int,
         (count(*) filter (where g.outcome = 'loss'))::int,
         (count(*) filter (where g.outcome = 'tie'))::int,
         count(g.id)::int
  from public.teams t
  left join public.events e on e.team_id = t.id and e.type = 'game' and e.status = 'scheduled'
  left join public.game_results g on g.event_id = e.id
  where t.id = p_team_id and private.can_view_team_schedule(p_team_id)
  group by t.season_label;
$$;

revoke execute on function
  public.record_game_result(uuid, integer, integer, jsonb, text), public.clear_game_result(uuid),
  public.team_record(uuid) from public, anon, authenticated;
grant execute on function
  public.record_game_result(uuid, integer, integer, jsonb, text), public.clear_game_result(uuid),
  public.team_record(uuid) to authenticated;
