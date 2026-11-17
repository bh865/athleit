-- Phase 2 (5/9): game_results
--
-- One result per game. period_scores is an array of {"us": n, "them": n} objects, one per
-- period (half / quarter / period / inning / set). For 'set' sports our_score and their_score
-- are SETS WON and every set needs a winner; for every other sport they are the sum of the
-- period scores. Ties are rejected where the sport config disallows them. All of this is
-- enforced by the trigger so no writer can bypass it; clients only read this table.

create table public.game_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events (id),
  our_score smallint not null constraint game_results_our_score_range check (our_score between 0 and 999),
  their_score smallint not null constraint game_results_their_score_range check (their_score between 0 and 999),
  outcome text generated always as (
    case when our_score > their_score then 'win' when our_score < their_score then 'loss' else 'tie' end) stored,
  period_scores jsonb,
  notes text constraint game_results_notes_length check (char_length(notes) <= 1000),
  entered_by uuid references public.profiles (id) on delete set null,
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index game_results_entered_by_idx on public.game_results (entered_by);
create trigger game_results_set_updated_at before update on public.game_results
  for each row execute function public.set_updated_at();

create function private.validate_game_result()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  cfg public.sport_configs;
  v_count int;
  v_max int;
  p jsonb;
  v_us int := 0;
  v_them int := 0;
  v_won_us int := 0;
  v_won_them int := 0;
  v_n int;
begin
  select * into e from public.events where id = new.event_id;
  if e.id is null then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if e.type <> 'game' then raise exception 'results_only_for_games' using errcode = '23514'; end if;
  select c.* into cfg from public.sport_configs c join public.teams t on t.sport = c.sport where t.id = e.team_id;

  if new.our_score = new.their_score and not cfg.ties_allowed then
    raise exception 'ties_not_allowed' using errcode = '23514',
      detail = format('%s games cannot end in a tie.', cfg.sport);
  end if;

  if new.period_scores is not null then
    if jsonb_typeof(new.period_scores) <> 'array' then
      raise exception 'invalid_period_scores' using errcode = '23514';
    end if;
    v_n := jsonb_array_length(new.period_scores);
    v_count := coalesce((e.game_format ->> 'period_count')::int, cfg.default_period_count);
    -- sets are best-of-N; every other period type may run over (overtime, extra innings)
    v_max := case when cfg.period_type = 'set' then v_count else v_count + 10 end;
    if v_n < 1 or v_n > v_max then
      raise exception 'invalid_period_scores' using errcode = '23514',
        detail = format('Expected between 1 and %s periods.', v_max);
    end if;
    for p in select * from jsonb_array_elements(new.period_scores) loop
      if jsonb_typeof(p) <> 'object'
         or exists (select 1 from jsonb_object_keys(p) k where k not in ('us', 'them'))
         or jsonb_typeof(p -> 'us') <> 'number' or jsonb_typeof(p -> 'them') <> 'number'
         or (p ->> 'us') !~ '^[0-9]{1,3}$' or (p ->> 'them') !~ '^[0-9]{1,3}$' then
        raise exception 'invalid_period_scores' using errcode = '23514';
      end if;
      v_us := v_us + (p ->> 'us')::int;
      v_them := v_them + (p ->> 'them')::int;
      if (p ->> 'us')::int > (p ->> 'them')::int then v_won_us := v_won_us + 1;
      elsif (p ->> 'us')::int < (p ->> 'them')::int then v_won_them := v_won_them + 1;
      elsif cfg.period_type = 'set' then
        raise exception 'invalid_period_scores' using errcode = '23514', detail = 'A set needs a winner.';
      end if;
    end loop;
    if cfg.period_type = 'set' then
      if v_won_us <> new.our_score or v_won_them <> new.their_score then
        raise exception 'period_scores_mismatch' using errcode = '23514';
      end if;
    elsif v_us <> new.our_score or v_them <> new.their_score then
      raise exception 'period_scores_mismatch' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger game_results_validate before insert or update on public.game_results
  for each row execute function private.validate_game_result();

alter table public.game_results enable row level security;
revoke all on public.game_results from anon, authenticated;
grant select on public.game_results to authenticated;

-- Everyone who can see the game (staff, rostered families, linked club admins) sees its result.
create policy "Schedule viewers read game results" on public.game_results
  for select to authenticated
  using (exists (select 1 from public.events e
                 where e.id = game_results.event_id and private.can_view_team_schedule(e.team_id)));

revoke execute on function private.validate_game_result() from public, anon, authenticated;
