-- Phase 2 (2/9): event_series and events
--
-- Clients only READ these tables. Every write goes through the create_event / update_event /
-- cancel_event / delete_event functions (next migrations), which check roles and audit. The
-- triggers below are the last line of defence: whatever path writes a row, it is validated and
-- `revision` is bumped when something attendees care about changes.
--
-- Recurrence is MATERIALIZED: a series row stores the rule that created it, and every
-- occurrence is an events row (series_id set). Nothing evaluates a rule at query time.

create table public.event_series (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  type text not null constraint event_series_type_check check (type in ('game', 'practice', 'event')),
  -- ISO weekdays: 1 = Monday ... 7 = Sunday
  weekdays smallint[] not null
    constraint event_series_weekdays_check check (
      cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  interval_weeks smallint not null default 1 constraint event_series_interval_check check (interval_weeks between 1 and 4),
  starts_on date not null,
  -- exactly one of until_on / occurrence_count
  until_on date,
  occurrence_count smallint constraint event_series_count_check check (occurrence_count between 1 and 52),
  timezone text not null constraint event_series_timezone_length check (char_length(timezone) <= 64),
  local_start_time time not null,
  duration_minutes integer not null constraint event_series_duration_check check (duration_minutes between 1 and 1440),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint event_series_end_rule check ((until_on is null) <> (occurrence_count is null)),
  constraint event_series_until_after_start check (until_on is null or until_on >= starts_on)
);
create index event_series_team_id_idx on public.event_series (team_id);
create index event_series_created_by_idx on public.event_series (created_by);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  type text not null constraint events_type_check check (type in ('game', 'practice', 'event')),
  title text not null constraint events_title_length check (char_length(btrim(title)) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- IANA zone the event happens in; times are displayed in it by default
  timezone text not null constraint events_timezone_length check (char_length(timezone) <= 64),
  location_id uuid references public.locations (id) on delete restrict,
  location_text text constraint events_location_text_length check (char_length(location_text) <= 200),
  opponent_id uuid references public.opponents (id) on delete restrict,
  home_away text constraint events_home_away_check check (home_away in ('home', 'away', 'neutral')),
  notes text constraint events_notes_length check (char_length(notes) <= 2000),
  arrive_early_minutes smallint constraint events_arrive_early_check check (arrive_early_minutes between 0 and 240),
  status text not null default 'scheduled' constraint events_status_check check (status in ('scheduled', 'cancelled')),
  cancelled_reason text constraint events_cancelled_reason_length check (char_length(cancelled_reason) <= 300),
  series_id uuid references public.event_series (id) on delete cascade,
  -- per-game override of the sport's period count / length: {"period_count": 4, "period_minutes": 10}
  game_format jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- bumped (by trigger) on any change attendees should hear about
  revision integer not null default 1,
  constraint events_ends_after_start check (ends_at > starts_at),
  constraint events_game_only_fields check (type = 'game' or (opponent_id is null and home_away is null and game_format is null)),
  constraint events_one_location check (location_id is null or location_text is null),
  constraint events_cancel_consistency check (
    (status = 'scheduled' and cancelled_reason is null)
    or (status = 'cancelled' and char_length(btrim(cancelled_reason)) >= 1))
);
create index events_team_starts_idx on public.events (team_id, starts_at);
create index events_series_idx on public.events (series_id, starts_at);
create index events_location_id_idx on public.events (location_id);
create index events_opponent_id_idx on public.events (opponent_id);
create index events_created_by_idx on public.events (created_by);

create function private.validate_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_series public.event_series;
  v_count int;
  v_minutes int;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'invalid_timezone' using errcode = '23514';
  end if;
  if new.location_id is not null and not exists (
      select 1 from public.locations l where l.id = new.location_id and l.team_id = new.team_id) then
    raise exception 'location_wrong_team' using errcode = '23514';
  end if;
  if new.opponent_id is not null and not exists (
      select 1 from public.opponents o where o.id = new.opponent_id and o.team_id = new.team_id) then
    raise exception 'opponent_wrong_team' using errcode = '23514';
  end if;
  if new.series_id is not null then
    select * into v_series from public.event_series s where s.id = new.series_id;
    if v_series.team_id is distinct from new.team_id or v_series.type is distinct from new.type then
      raise exception 'series_mismatch' using errcode = '23514';
    end if;
  end if;
  if new.game_format is not null then
    if jsonb_typeof(new.game_format) <> 'object'
       or exists (select 1 from jsonb_object_keys(new.game_format) k where k not in ('period_count', 'period_minutes')) then
      raise exception 'invalid_game_format' using errcode = '23514';
    end if;
    if new.game_format ? 'period_count' then
      if jsonb_typeof(new.game_format -> 'period_count') <> 'number'
         or (new.game_format ->> 'period_count') !~ '^[0-9]{1,2}$' then
        raise exception 'invalid_game_format' using errcode = '23514';
      end if;
      v_count := (new.game_format ->> 'period_count')::int;
      if v_count not between 1 and 12 then raise exception 'invalid_game_format' using errcode = '23514'; end if;
    end if;
    if new.game_format ? 'period_minutes' and jsonb_typeof(new.game_format -> 'period_minutes') <> 'null' then
      if jsonb_typeof(new.game_format -> 'period_minutes') <> 'number'
         or (new.game_format ->> 'period_minutes') !~ '^[0-9]{1,3}$' then
        raise exception 'invalid_game_format' using errcode = '23514';
      end if;
      v_minutes := (new.game_format ->> 'period_minutes')::int;
      if v_minutes not between 1 and 120 then raise exception 'invalid_game_format' using errcode = '23514'; end if;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.team_id <> old.team_id or new.type <> old.type or new.series_id is distinct from old.series_id then
      raise exception 'event_identity_immutable' using errcode = '23514';
    end if;
    -- Time, place and status are what attendees plan around; title/notes/opponent edits do not bump.
    if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
       or new.timezone is distinct from old.timezone or new.location_id is distinct from old.location_id
       or new.location_text is distinct from old.location_text or new.status is distinct from old.status
       or new.arrive_early_minutes is distinct from old.arrive_early_minutes then
      new.revision := old.revision + 1;
    else
      new.revision := old.revision;
    end if;
  end if;
  return new;
end;
$$;
create trigger events_validate before insert or update on public.events
  for each row execute function private.validate_event();
create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- RLS ------------------------------------------------------------------------
alter table public.event_series enable row level security;
alter table public.events enable row level security;

revoke all on public.event_series, public.events from anon, authenticated;
grant select on public.event_series, public.events to authenticated;

create policy "Staff read their team's event series" on public.event_series
  for select to authenticated using (private.is_team_staff(team_id));
-- Staff, rostered families and linked club admins read events; nobody else, and no one writes
-- directly (all writes are SECURITY DEFINER functions).
create policy "Schedule viewers read events" on public.events
  for select to authenticated using (private.can_view_team_schedule(team_id));

revoke execute on function private.validate_event() from public, anon, authenticated;
