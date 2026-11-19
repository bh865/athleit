-- Waivers polish: reminders for missing or expired signatures (rate limited, staff-only) and archiving a waiver.
--
-- remind_waiver_signers: managers and admins nudge the guardians of players whose required waiver is missing or
--   expired. One reminder per player per waiver per 24 hours, enforced by waiver_reminders. The notification names the
--   waiver only (never the child), like the expiry notices.
-- archive_waiver / unarchive_waiver: hides a waiver from the library. Published versions are immutable and stay
--   readable, so signatures already collected keep pointing at the text they signed.

create table public.waiver_reminders (
  id uuid primary key default gen_random_uuid(),
  waiver_id uuid not null references public.waivers (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  sent_by uuid references public.profiles (id) on delete set null,
  sent_at timestamptz not null default now()
);
create index waiver_reminders_lookup_idx on public.waiver_reminders (waiver_id, player_id, sent_at desc);
create index waiver_reminders_team_id_idx on public.waiver_reminders (team_id);
create index waiver_reminders_player_id_idx on public.waiver_reminders (player_id);
create index waiver_reminders_sent_by_idx on public.waiver_reminders (sent_by) where sent_by is not null;

alter table public.waiver_reminders enable row level security;
revoke all on public.waiver_reminders from public, anon, authenticated;
grant select on public.waiver_reminders to authenticated;
-- Staff read when each reminder went out (to show "Reminded today"); nobody writes except the function below.
create policy "Team staff read waiver reminders" on public.waiver_reminders
  for select to authenticated using (private.is_team_staff(team_id));

create function public.remind_waiver_signers(
  p_team_id uuid, p_waiver_id uuid default null, p_player_id uuid default null)
returns integer language plpgsql security definer set search_path = ''
as $$
declare r record; g record; v_id uuid; v_sent integer := 0;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_team_id is null or not private.is_issuer_manager(p_team_id, null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for r in
    select c.player_id, c.waiver_id, c.waiver_title, p.household_id
    from public.waiver_compliance(p_team_id) c
    join public.players p on p.id = c.player_id
    where c.status <> 'current'
      and (p_waiver_id is null or c.waiver_id = p_waiver_id)
      and (p_player_id is null or c.player_id = p_player_id)
  loop
    -- One reminder per player per waiver per 24 hours.
    continue when exists (
      select 1 from public.waiver_reminders wr
      where wr.waiver_id = r.waiver_id and wr.player_id = r.player_id and wr.sent_at > now() - interval '24 hours');
    insert into public.waiver_reminders (waiver_id, player_id, team_id, sent_by)
    values (r.waiver_id, r.player_id, p_team_id, (select auth.uid())) returning id into v_id;
    for g in select hm.profile_id from public.household_members hm
             where hm.household_id = r.household_id and hm.relationship = 'guardian' loop
      perform private.enqueue_notification(g.profile_id, 'registration',
        jsonb_build_object('kind', 'registration', 'title', 'Waiver needs your signature',
          'body', left(r.waiver_title, 100) || ' is waiting for you', 'team_id', p_team_id, 'audience', 'family'),
        'waiverremind:' || v_id || ':' || g.profile_id);
    end loop;
    v_sent := v_sent + 1;
  end loop;
  perform private.write_audit('waiver.remind', 'teams', p_team_id, p_team_id, null, null,
    jsonb_build_object('waiver_id', p_waiver_id, 'player_id', p_player_id, 'reminded', v_sent));
  return v_sent;
end;
$$;

create function public.archive_waiver(p_waiver_id uuid, p_archived boolean default true)
returns void language plpgsql security definer set search_path = ''
as $$
declare w public.waivers;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into w from public.waivers where id = p_waiver_id for update;
  if not found or not private.is_issuer_manager(w.team_id, w.club_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.waivers
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
  where id = p_waiver_id;
  perform private.write_audit(case when p_archived then 'waiver.archive' else 'waiver.unarchive' end, 'waivers',
    p_waiver_id, w.team_id, w.club_id, null, null);
end;
$$;

revoke execute on function
  public.remind_waiver_signers(uuid, uuid, uuid), public.archive_waiver(uuid, boolean)
  from public, anon, authenticated;
grant execute on function
  public.remind_waiver_signers(uuid, uuid, uuid), public.archive_waiver(uuid, boolean)
  to authenticated;
