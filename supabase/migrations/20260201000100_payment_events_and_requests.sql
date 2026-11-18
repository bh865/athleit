-- Phase 4 (A2): payment_events and payment_requests
--
-- A team issues to players on its roster; a club issues to players on any team linked to it.
-- The event is the "what and how much"; one payment_request per player is generated when the
-- event is published. Amounts, players and fee snapshots are immutable after publish.

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete restrict,
  club_id uuid references public.clubs (id) on delete restrict,
  -- Resolved at publish (the issuer's connected account); null while draft.
  connected_account_id uuid references public.connected_accounts (id) on delete restrict,
  title text not null constraint payment_events_title_length check (char_length(btrim(title)) between 1 and 100),
  description text constraint payment_events_description_length check (char_length(description) <= 1000),
  -- Default per-player amount in integer cents. 50c is Stripe's USD minimum charge.
  amount_cents integer not null
    constraint payment_events_amount_range check (amount_cents between 50 and 5000000),
  currency text not null default 'usd' constraint payment_events_currency check (currency = 'usd'),
  due_at timestamptz not null,
  audience text not null default 'all_active_roster'
    constraint payment_events_audience check (audience in ('all_active_roster', 'selected_players')),
  -- Only for audience = selected_players. Validated against the roster at publish.
  audience_player_ids uuid[]
    constraint payment_events_audience_ids check (
      (audience = 'selected_players' and coalesce(cardinality(audience_player_ids), 0) between 1 and 2000)
      or (audience = 'all_active_roster' and audience_player_ids is null)),
  fee_policy text not null default 'absorb'
    constraint payment_events_fee_policy check (fee_policy in ('absorb', 'pass_on')),
  -- Snapshot of the active fee_config at publish: later pricing changes never touch an issued event.
  fee_config jsonb,
  status text not null default 'draft'
    constraint payment_events_status check (status in ('draft', 'published', 'closed', 'cancelled')),
  created_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_events_one_issuer check (num_nonnulls(team_id, club_id) = 1),
  constraint payment_events_published_has_snapshot check (
    status = 'draft' or (fee_config is not null and connected_account_id is not null) or status = 'cancelled')
);
create index payment_events_team_id_idx on public.payment_events (team_id) where team_id is not null;
create index payment_events_club_id_idx on public.payment_events (club_id) where club_id is not null;
create index payment_events_connected_account_id_idx on public.payment_events (connected_account_id) where connected_account_id is not null;
create index payment_events_created_by_idx on public.payment_events (created_by) where created_by is not null;
create trigger payment_events_set_updated_at before update on public.payment_events
  for each row execute function public.set_updated_at();

-- Money-defining fields are frozen once an event leaves draft.
create function private.guard_payment_event()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.status <> 'draft' and (
       new.amount_cents is distinct from old.amount_cents
       or new.currency is distinct from old.currency
       or new.fee_policy is distinct from old.fee_policy
       or new.fee_config is distinct from old.fee_config
       or new.audience is distinct from old.audience
       or new.audience_player_ids is distinct from old.audience_player_ids
       or new.team_id is distinct from old.team_id
       or new.club_id is distinct from old.club_id
       or new.connected_account_id is distinct from old.connected_account_id) then
    raise exception 'payment_event_locked' using errcode = '23514',
      detail = 'Amount, audience and fee terms cannot change after publishing.';
  end if;
  if old.status in ('cancelled') and new.status <> old.status then
    raise exception 'invalid_status_transition' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger payment_events_guard before update on public.payment_events
  for each row execute function private.guard_payment_event();

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  payment_event_id uuid not null references public.payment_events (id) on delete restrict,
  player_id uuid not null references public.players (id) on delete restrict,
  household_id uuid not null references public.households (id) on delete restrict,
  amount_cents integer not null constraint payment_requests_amount_range check (amount_cents between 50 and 5000000),
  status text not null default 'unpaid'
    constraint payment_requests_status check (status in
      ('unpaid', 'processing', 'paid', 'paid_offline', 'partially_refunded', 'refunded', 'waived', 'cancelled')),
  due_at timestamptz not null,
  display_id text not null unique constraint payment_requests_display_id_format check (display_id ~ '^PR-[0-9]{4,}$'),
  paid_at timestamptz,
  waived_by uuid references public.profiles (id) on delete set null,
  waived_at timestamptz,
  note text constraint payment_requests_note_length check (char_length(note) <= 300),
  -- A chargeback/dispute is open on the payment for this request (set by the webhook).
  disputed boolean not null default false,
  -- Reminder bookkeeping: manual reminders at most once per 24h; the cron notices once each.
  last_reminded_at timestamptz,
  due_soon_notified_at timestamptz,
  overdue_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_event_id, player_id)
);
create index payment_requests_player_id_idx on public.payment_requests (player_id);
create index payment_requests_household_id_idx on public.payment_requests (household_id);
create index payment_requests_waived_by_idx on public.payment_requests (waived_by) where waived_by is not null;
create index payment_requests_open_due_idx on public.payment_requests (due_at) where status = 'unpaid';
create trigger payment_requests_set_updated_at before update on public.payment_requests
  for each row execute function public.set_updated_at();

-- State machine + immutability. Defense in depth: even the service role cannot skip a state.
-- See docs/payments.md for the diagram.
create function private.guard_payment_request()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.amount_cents is distinct from old.amount_cents
     or new.player_id is distinct from old.player_id
     or new.household_id is distinct from old.household_id
     or new.payment_event_id is distinct from old.payment_event_id
     or new.display_id is distinct from old.display_id then
    raise exception 'payment_request_immutable' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'unpaid' and new.status in ('processing', 'paid', 'paid_offline', 'waived', 'cancelled'))
    or (old.status = 'processing' and new.status in ('unpaid', 'paid', 'cancelled'))
    or (old.status = 'paid' and new.status in ('partially_refunded', 'refunded'))
    or (old.status = 'partially_refunded' and new.status in ('refunded'))) then
    raise exception 'invalid_status_transition' using errcode = '23514',
      detail = format('%s -> %s', old.status, new.status);
  end if;
  return new;
end;
$$;
create trigger payment_requests_guard before update on public.payment_requests
  for each row execute function private.guard_payment_request();

-- Helpers --------------------------------------------------------------------
create function private.is_event_staff(p_event_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.payment_events e
    where e.id = p_event_id and private.is_issuer_staff(e.team_id, e.club_id));
$$;

create function private.is_event_admin(p_event_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.payment_events e
    where e.id = p_event_id and private.is_issuer_admin(e.team_id, e.club_id));
$$;

-- A guardian of a billed household, or the (13+) player, may read the event behind their request.
create function private.is_event_payer(p_event_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.payment_requests r
    where r.payment_event_id = p_event_id
      and (private.is_household_guardian(r.household_id) or private.is_player_self(r.player_id)));
$$;

-- RLS ------------------------------------------------------------------------
alter table public.payment_events enable row level security;
alter table public.payment_requests enable row level security;
revoke all on public.payment_events, public.payment_requests from anon, authenticated;
grant select on public.payment_events, public.payment_requests to authenticated;

-- Staff of the issuing team / club admins (for club-issued events) read the event; so do the
-- families it was sent to. A club admin never sees a TEAM-issued event of a linked team.
create policy "Issuer staff and billed families read events" on public.payment_events
  for select to authenticated
  using (private.is_issuer_staff(team_id, club_id) or private.is_event_payer(id));

-- Staff read every request of their event (who paid / who hasn't); a household reads only its
-- own; a 13+ player reads (but cannot pay) their own.
create policy "Issuer staff and the billed household read requests" on public.payment_requests
  for select to authenticated
  using (private.is_household_guardian(household_id)
         or private.is_player_self(player_id)
         or private.is_event_staff(payment_event_id));

revoke execute on function private.guard_payment_event(), private.guard_payment_request(),
  private.is_event_staff(uuid), private.is_event_admin(uuid), private.is_event_payer(uuid)
  from public, anon, authenticated;
grant execute on function private.is_event_staff(uuid), private.is_event_admin(uuid), private.is_event_payer(uuid)
  to authenticated;
