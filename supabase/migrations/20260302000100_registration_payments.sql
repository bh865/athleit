-- Phase 5 (B2): registration payments (reuses Phase 4) and registrant emails
--
-- Phase 4 changes, all backward compatible (existing rows and tests are unaffected):
--   payment_events   + kind ('roster' default | 'registration'), + registration_event_id (one payment_event per
--                      registration event, created lazily with the same fee snapshot rules as publish_payment_event),
--                      audience may be 'registration'.
--   payment_requests + registration_id (one request per registration). The (event, player) uniqueness now applies
--                      to roster requests only, so a child can register again after a cancelled attempt.
--   guard_payment_request also freezes registration_id.
-- Amounts always come from registration_events.price_cents, never from a client.
--
-- A request is created (private.ensure_registration_payment) when the registration has a linked player + household:
--   at_submission    : right after a signed-in submission (and when a waitlisted registration is promoted); the spot is
--                      held until hold_expires_at; the registration cannot be accepted until the request is paid.
--   after_acceptance : when staff accept (or promotion accepts) the registration; due in 7 days.
-- Declining or withdrawing cancels an UNPAID request. A PAID one is left for staff to refund through refund-payment.

alter table public.payment_events
  add column kind text not null default 'roster' constraint payment_events_kind check (kind in ('roster', 'registration')),
  add column registration_event_id uuid references public.registration_events (id) on delete restrict;
alter table public.payment_events drop constraint payment_events_audience;
alter table public.payment_events drop constraint payment_events_audience_ids;
alter table public.payment_events add constraint payment_events_audience
  check (audience in ('all_active_roster', 'selected_players', 'registration'));
alter table public.payment_events add constraint payment_events_audience_ids check (
  (audience = 'selected_players' and coalesce(cardinality(audience_player_ids), 0) between 1 and 2000)
  or (audience in ('all_active_roster', 'registration') and audience_player_ids is null));
alter table public.payment_events add constraint payment_events_kind_consistency check (
  (kind = 'registration') = (registration_event_id is not null) and (kind = 'registration') = (audience = 'registration'));
create unique index payment_events_registration_event_uidx
  on public.payment_events (registration_event_id) where registration_event_id is not null;

alter table public.payment_requests add column registration_id uuid references public.registrations (id) on delete restrict;
alter table public.payment_requests drop constraint payment_requests_payment_event_id_player_id_key;
create unique index payment_requests_event_player_roster_uidx
  on public.payment_requests (payment_event_id, player_id) where registration_id is null;
create unique index payment_requests_registration_id_uidx
  on public.payment_requests (registration_id) where registration_id is not null;

create or replace function private.guard_payment_request()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.amount_cents is distinct from old.amount_cents
     or new.player_id is distinct from old.player_id
     or new.household_id is distinct from old.household_id
     or new.payment_event_id is distinct from old.payment_event_id
     or new.registration_id is distinct from old.registration_id
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

-- Create (once) the payment request for a registration. Returns its id, or null when nothing is due yet
-- (free event, player not linked, wrong status for the event's timing, or payouts not set up).
create function private.ensure_registration_payment(p_registration_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  r public.registrations; e public.registration_events; v_account public.connected_accounts; v_cfg public.fee_config;
  v_pe uuid; v_req uuid; v_due timestamptz;
begin
  select * into r from public.registrations where id = p_registration_id for update;
  if not found then return null; end if;
  if r.payment_request_id is not null then return r.payment_request_id; end if;
  select * into e from public.registration_events where id = r.registration_event_id;
  if e.price_cents is null or r.player_id is null or r.household_id is null then return null; end if;
  if not ((e.payment_timing = 'at_submission' and r.status = 'submitted')
          or (e.payment_timing = 'after_acceptance' and r.status in ('accepted', 'placed'))) then
    return null;
  end if;
  select * into v_account from public.connected_accounts ca
    where ca.team_id is not distinct from e.team_id and ca.club_id is not distinct from e.club_id;
  if not found then return null; end if;

  select id into v_pe from public.payment_events where registration_event_id = e.id;
  if v_pe is null then
    select * into v_cfg from public.fee_config where is_active;
    insert into public.payment_events (team_id, club_id, connected_account_id, title, amount_cents, due_at, audience, fee_policy,
      fee_config, status, published_at, kind, registration_event_id, created_by)
    values (e.team_id, e.club_id, v_account.id, left('Registration: ' || e.title, 100), e.price_cents,
      coalesce(e.closes_at, now()) + interval '30 days', 'registration', v_account.default_fee_policy,
      jsonb_build_object(
        'platform_fee_flat_cents', v_cfg.platform_fee_flat_cents, 'platform_fee_bps', v_cfg.platform_fee_bps,
        'stripe_fee_bps', v_cfg.stripe_fee_bps, 'stripe_fee_fixed_cents', v_cfg.stripe_fee_fixed_cents,
        'refund_athleit_charge_on_full', v_cfg.refund_athleit_charge_on_full,
        'refund_athleit_charge_on_partial', v_cfg.refund_athleit_charge_on_partial,
        'refund_service_fee_on_full', v_cfg.refund_service_fee_on_full,
        'refund_service_fee_on_partial', v_cfg.refund_service_fee_on_partial, 'config_id', v_cfg.id),
      'published', now(), 'registration', e.id, e.created_by)
    on conflict (registration_event_id) where registration_event_id is not null do nothing;
    select id into v_pe from public.payment_events where registration_event_id = e.id;
  end if;

  v_due := case when e.payment_timing = 'at_submission'
                then coalesce(r.hold_expires_at, now() + make_interval(mins => e.payment_hold_minutes))
                else now() + interval '7 days' end;
  insert into public.payment_requests (payment_event_id, player_id, household_id, amount_cents, due_at, display_id, registration_id)
  values (v_pe, r.player_id, r.household_id, e.price_cents, v_due, private.next_request_display_id(), r.id)
  returning id into v_req;
  update public.registrations set payment_request_id = v_req,
    hold_expires_at = case when e.payment_timing = 'at_submission' then v_due else hold_expires_at end
  where id = r.id;
  perform private.write_audit('registration.payment_request', 'registrations', r.id, e.team_id, e.club_id, null,
    jsonb_build_object('payment_request_id', v_req, 'timing', e.payment_timing));
  return v_req;
end;
$$;

-- Registration guards: a paid at-submission event needs a linked child; such a registration is accepted only once paid.
create function private.guard_registration_payment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare e public.registration_events;
begin
  select * into e from public.registration_events where id = new.registration_event_id;
  if e.price_cents is null or e.payment_timing <> 'at_submission' then return new; end if;
  if tg_op = 'INSERT' and new.status = 'submitted' and new.player_id is null then
    raise exception 'player_required' using errcode = '23514', detail = 'Choose or add the child before paying.';
  end if;
  if tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' and not exists (
       select 1 from public.payment_requests q where q.id = new.payment_request_id and q.status in ('paid', 'paid_offline', 'waived')) then
    raise exception 'payment_required' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger registrations_payment_guard before insert or update on public.registrations
  for each row execute function private.guard_registration_payment();

-- Side effects of status changes: transactional email to the registrant (never depends on preferences),
-- payment requests, and cancelling an unpaid request when the registration ends.
create function private.registration_side_effects()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  e public.registration_events; v_issuer text; v_payload jsonb; v_kind text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  select * into e from public.registration_events where id = new.registration_event_id;
  select coalesce(t.name, c.name) into v_issuer from (select 1) o
    left join public.teams t on t.id = e.team_id left join public.clubs c on c.id = e.club_id;
  v_payload := jsonb_build_object('display_id', new.display_id, 'event_title', left(e.title, 120), 'issuer_name', left(v_issuer, 100),
    'player_first_name', left(new.player_first_name, 60), 'status', new.status, 'price_cents', e.price_cents,
    'payment_timing', e.payment_timing, 'hold_minutes', e.payment_hold_minutes, 'needs_account', new.submitted_by is null,
    'note', left(new.decision_note, 1000), 'registration_event_id', e.id);

  if tg_op = 'INSERT' then
    if new.status in ('submitted', 'waitlisted') and new.submitted_by is not null then
      perform private.enqueue_registration_email(new.guardian_email, 'received', v_payload, new.id || ':received');
    end if;
    if new.status = 'submitted' and e.price_cents is not null and e.payment_timing = 'at_submission' then
      perform private.ensure_registration_payment(new.id);
    end if;
    return null;
  end if;

  if old.status = 'pending_verification' and new.status in ('submitted', 'waitlisted') then
    perform private.enqueue_registration_email(new.guardian_email, 'received', v_payload, new.id || ':received');
  elsif old.status = 'waitlisted' and new.status in ('submitted', 'accepted') then
    perform private.enqueue_registration_email(new.guardian_email, 'promoted', v_payload, new.id || ':promoted');
    perform private.ensure_registration_payment(new.id);
  elsif new.status = 'accepted' then
    perform private.enqueue_registration_email(new.guardian_email, 'decision', v_payload, new.id || ':accepted');
    perform private.ensure_registration_payment(new.id);
  elsif new.status = 'waitlisted' then
    perform private.enqueue_registration_email(new.guardian_email, 'decision', v_payload, new.id || ':waitlisted');
  elsif new.status = 'declined' then
    perform private.enqueue_registration_email(new.guardian_email, 'decision', v_payload, new.id || ':declined');
  elsif new.status = 'withdrawn' and new.decision_note = 'payment_expired' then
    perform private.enqueue_registration_email(new.guardian_email, 'hold_expired', v_payload, new.id || ':hold_expired');
  end if;

  if new.status in ('declined', 'withdrawn') and new.payment_request_id is not null then
    update public.payment_requests set status = 'cancelled' where id = new.payment_request_id and status = 'unpaid';
  end if;
  return null;
end;
$$;
create trigger registrations_side_effects after insert or update of status on public.registrations
  for each row execute function private.registration_side_effects();

-- Once the request is paid the hold is lifted: the spot is the registrant's.
create function private.registration_payment_settled()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.registration_id is not null and new.status in ('paid', 'paid_offline', 'waived') and old.status is distinct from new.status then
    update public.registrations set hold_expires_at = null where id = new.registration_id and hold_expires_at is not null;
  end if;
  return null;
end;
$$;
create trigger payment_requests_registration_settled after update of status on public.payment_requests
  for each row execute function private.registration_payment_settled();

-- Payment state for one registration (family or issuer staff). `refundable`: it is paid and the registration ended,
-- so staff should be offered a refund through the existing refund function.
create function public.registration_payment_status(p_registration_id uuid)
returns table (payment_request_id uuid, request_display_id text, request_status text, amount_cents integer, refundable boolean)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.display_id, q.status, q.amount_cents,
         q.status in ('paid', 'partially_refunded') and r.status in ('declined', 'withdrawn')
  from public.registrations r
  join public.payment_requests q on q.id = r.payment_request_id
  where r.id = p_registration_id and (select auth.uid()) is not null and private.can_view_registration(r.id);
$$;

-- A signed-in family links the registered child (after claiming an account, or when the child was added later).
-- This is what lets a payment request exist for a registration that began anonymously.
create function public.link_registration_player(p_registration_id uuid, p_player_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare r public.registrations; v_household uuid; v_req uuid; e public.registration_events;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into r from public.registrations where id = p_registration_id for update;
  if not found or not private.is_registration_family(p_registration_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not private.is_guardian_of(p_player_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status in ('declined', 'withdrawn') then raise exception 'invalid_status_transition' using errcode = '23514'; end if;
  if r.player_id is not null and r.player_id <> p_player_id then raise exception 'already_linked' using errcode = '23514'; end if;
  select household_id into v_household from public.players where id = p_player_id;
  update public.registrations set player_id = p_player_id, household_id = v_household,
    submitted_by = coalesce(submitted_by, (select auth.uid())) where id = p_registration_id;
  select * into e from public.registration_events where id = r.registration_event_id;
  v_req := private.ensure_registration_payment(p_registration_id);
  if v_req is not null then
    perform private.enqueue_registration_email(r.guardian_email, 'payment_due',
      jsonb_build_object('display_id', r.display_id, 'event_title', left(e.title, 120), 'price_cents', e.price_cents,
                         'payment_timing', e.payment_timing, 'registration_event_id', e.id),
      r.id || ':payment_due');
  end if;
  perform private.write_audit('registration.link_player', 'registrations', p_registration_id, e.team_id, e.club_id, null, null);
  return v_req;
end;
$$;

revoke execute on function private.ensure_registration_payment(uuid), private.guard_registration_payment(),
  private.registration_side_effects(), private.registration_payment_settled(), private.guard_payment_request()
  from public, anon, authenticated;
revoke execute on function public.registration_payment_status(uuid), public.link_registration_player(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.registration_payment_status(uuid), public.link_registration_player(uuid, uuid) to authenticated;
