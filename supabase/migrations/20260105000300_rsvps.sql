-- Phase 2 (4/9): rsvps
--
-- The RSVP belongs to the PLAYER (never the account). Who may write one is decided in the
-- set_rsvp / staff_set_rsvp functions (next migrations); clients only READ this table.
-- Privacy: staff of the event's team read every row (names and notes via their roster access);
-- a guardian reads the rows of their own household's children; a 13+ player with a login reads
-- their own. Parents, players and club admins never read another child's RSVP; they get
-- aggregate counts from event_rsvp_summary().

create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  player_id uuid not null references public.players (id) on delete cascade,
  -- denormalized from the event by trigger so policies and Realtime filters need no join
  team_id uuid not null references public.teams (id) on delete cascade,
  status text not null constraint rsvps_status_check check (status in ('going', 'not_going', 'maybe')),
  note text constraint rsvps_note_length check (char_length(note) <= 500),
  responded_by uuid references public.profiles (id) on delete set null,
  responded_at timestamptz not null default now(),
  set_by_staff boolean not null default false,
  unique (event_id, player_id)
);
create index rsvps_player_id_idx on public.rsvps (player_id);
create index rsvps_team_id_idx on public.rsvps (team_id);
create index rsvps_responded_by_idx on public.rsvps (responded_by);

-- Only ACTIVE roster players of the event's team can have an RSVP.
create function private.validate_rsvp()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_team uuid;
begin
  select e.team_id into v_team from public.events e where e.id = new.event_id;
  if v_team is null then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if not exists (
      select 1 from public.team_players tp
      where tp.team_id = v_team and tp.player_id = new.player_id and tp.status = 'active') then
    raise exception 'player_not_on_roster' using errcode = '23514';
  end if;
  new.team_id := v_team;
  if tg_op = 'UPDATE' and (new.event_id <> old.event_id or new.player_id <> old.player_id) then
    raise exception 'rsvp_identity_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger rsvps_validate before insert or update on public.rsvps
  for each row execute function private.validate_rsvp();

alter table public.rsvps enable row level security;
revoke all on public.rsvps from anon, authenticated;
grant select on public.rsvps to authenticated;

create policy "Staff, guardians and the player read RSVPs" on public.rsvps
  for select to authenticated
  using (private.is_team_staff(team_id) or private.is_guardian_of(player_id) or private.is_player_self(player_id));

-- Live counts for staff (Realtime respects the policy above).
do $$
declare t text;
begin
  foreach t in array array['rsvps', 'events'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

revoke execute on function private.validate_rsvp() from public, anon, authenticated;
