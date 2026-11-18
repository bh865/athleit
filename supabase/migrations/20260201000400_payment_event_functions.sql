-- Phase 4 (A5): payment event lifecycle functions (all SECURITY DEFINER, audited)
--
--   create_payment_event / update_payment_event (draft only)
--   publish_payment_event      requires charges_enabled; one request per audience player; notifies households
--   cancel_payment_event       issuer admins; unpaid requests cancelled, paid ones untouched
--   waive_request              staff
--   record_offline_payment     staff
--   send_payment_reminders     staff, at most once per request per 24 hours
-- Staff = admin/coach/manager of the issuing team (club admin for club-issued events). Cancelling
-- a published event is admin-only because it affects money already collected or in flight.

-- Players on the issuer's active rosters (team: its own roster; club: every team linked to it).
create function private.event_audience(p_team_id uuid, p_club_id uuid)
returns table (player_id uuid, household_id uuid)
language sql stable security definer set search_path = ''
as $$
  select distinct p.id, p.household_id
  from public.team_players tp
  join public.teams t on t.id = tp.team_id
  join public.players p on p.id = tp.player_id
  where tp.status = 'active'
    and ((p_team_id is not null and tp.team_id = p_team_id)
      or (p_club_id is not null and t.club_id = p_club_id));
$$;

-- One notification per guardian of a household, however many children are billed.
create function private.notify_payment(
  p_household_id uuid, p_kind text, p_title text, p_body text, p_payload jsonb, p_dedupe_base text)
returns void language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  for r in select hm.profile_id from public.household_members hm
           where hm.household_id = p_household_id and hm.relationship = 'guardian' loop
    perform private.enqueue_notification(r.profile_id, 'payments',
      p_payload || jsonb_build_object('kind', 'payment', 'change', p_kind, 'title', left(p_title, 100), 'body', p_body),
      p_dedupe_base || ':' || r.profile_id);
  end loop;
end;
$$;

create function private.money_text(p_cents bigint)
returns text language sql immutable set search_path = ''
as $$ select '$' || (p_cents / 100)::text || '.' || lpad((p_cents % 100)::text, 2, '0'); $$;

create function public.create_payment_event(
  p_team_id uuid, p_club_id uuid, p_title text, p_description text, p_amount_cents integer,
  p_due_at timestamptz, p_audience text default 'all_active_roster',
  p_audience_player_ids uuid[] default null, p_fee_policy text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_policy text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if num_nonnulls(p_team_id, p_club_id) <> 1 or not private.is_issuer_staff(p_team_id, p_club_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select ca.default_fee_policy into v_policy from public.connected_accounts ca
    where ca.team_id is not distinct from p_team_id and ca.club_id is not distinct from p_club_id;
  v_policy := coalesce(p_fee_policy, v_policy, 'absorb');
  insert into public.payment_events (team_id, club_id, title, description, amount_cents, due_at,
                                     audience, audience_player_ids, fee_policy, created_by)
  values (p_team_id, p_club_id, btrim(p_title), nullif(btrim(p_description), ''), p_amount_cents, p_due_at,
          p_audience, case when p_audience = 'selected_players' then p_audience_player_ids end, v_policy, v_uid)
  returning id into v_id;
  perform private.write_audit('payment_event.create', 'payment_events', v_id, p_team_id, p_club_id, null,
    jsonb_build_object('title', btrim(p_title), 'amount_cents', p_amount_cents, 'audience', p_audience, 'fee_policy', v_policy));
  return v_id;
end;
$$;

create function public.update_payment_event(
  p_event_id uuid, p_title text, p_description text, p_amount_cents integer, p_due_at timestamptz,
  p_audience text, p_audience_player_ids uuid[], p_fee_policy text)
returns void language plpgsql security definer set search_path = ''
as $$
declare e public.payment_events;
begin
  select * into e from public.payment_events where id = p_event_id for update;
  if not found or not private.is_issuer_staff(e.team_id, e.club_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if e.status <> 'draft' then
    raise exception 'not_draft' using errcode = '23514', detail = 'Only a draft can be edited.';
  end if;
  update public.payment_events set
    title = btrim(p_title), description = nullif(btrim(p_description), ''), amount_cents = p_amount_cents,
    due_at = p_due_at, audience = p_audience,
    audience_player_ids = case when p_audience = 'selected_players' then p_audience_player_ids end,
    fee_policy = p_fee_policy
  where id = p_event_id;
  perform private.write_audit('payment_event.update', 'payment_events', p_event_id, e.team_id, e.club_id,
    jsonb_build_object('title', e.title, 'amount_cents', e.amount_cents, 'fee_policy', e.fee_policy),
    jsonb_build_object('title', btrim(p_title), 'amount_cents', p_amount_cents, 'fee_policy', p_fee_policy));
end;
$$;

-- Publishing freezes the terms and issues one request per audience player.
create function public.publish_payment_event(p_event_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  e public.payment_events;
  v_account public.connected_accounts;
  v_cfg public.fee_config;
  v_count integer;
  v_issuer text;
  r record;
begin
  select * into e from public.payment_events where id = p_event_id for update;
  if not found or not private.is_issuer_staff(e.team_id, e.club_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if e.status <> 'draft' then
    raise exception 'not_draft' using errcode = '23514', detail = 'Only a draft can be published.';
  end if;
  select * into v_account from public.connected_accounts ca
    where ca.team_id is not distinct from e.team_id and ca.club_id is not distinct from e.club_id;
  if not found or not v_account.charges_enabled then
    raise exception 'charges_not_enabled' using errcode = '23514',
      detail = 'Finish payout setup before sending payment requests.';
  end if;
  select * into v_cfg from public.fee_config where is_active;

  -- Audience (selected players must be on the issuer's active roster; others are rejected, not dropped).
  if e.audience = 'selected_players' and exists (
      select 1 from unnest(e.audience_player_ids) sel(pid)
      where not exists (select 1 from private.event_audience(e.team_id, e.club_id) a where a.player_id = sel.pid)) then
    raise exception 'player_not_on_roster' using errcode = '23514';
  end if;

  update public.payment_events set status = 'published', published_at = now(),
    connected_account_id = v_account.id,
    fee_config = jsonb_build_object(
      'platform_fee_flat_cents', v_cfg.platform_fee_flat_cents, 'platform_fee_bps', v_cfg.platform_fee_bps,
      'stripe_fee_bps', v_cfg.stripe_fee_bps, 'stripe_fee_fixed_cents', v_cfg.stripe_fee_fixed_cents,
      'refund_athleit_charge_on_full', v_cfg.refund_athleit_charge_on_full,
      'refund_athleit_charge_on_partial', v_cfg.refund_athleit_charge_on_partial,
      'refund_service_fee_on_full', v_cfg.refund_service_fee_on_full,
      'refund_service_fee_on_partial', v_cfg.refund_service_fee_on_partial, 'config_id', v_cfg.id)
  where id = p_event_id;

  insert into public.payment_requests (payment_event_id, player_id, household_id, amount_cents, due_at, display_id)
  select p_event_id, a.player_id, a.household_id, e.amount_cents, e.due_at, private.next_request_display_id()
  from private.event_audience(e.team_id, e.club_id) a
  where e.audience = 'all_active_roster' or a.player_id = any (e.audience_player_ids)
  order by a.player_id;
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'empty_audience' using errcode = '23514'; end if;

  v_issuer := coalesce((select t.name from public.teams t where t.id = e.team_id),
                       (select c.name from public.clubs c where c.id = e.club_id));
  -- One notification per household (not per child).
  for r in
    select q.household_id, count(*) as n, min(q.id::text)::uuid as first_request, sum(q.amount_cents) as cents
    from public.payment_requests q where q.payment_event_id = p_event_id group by q.household_id
  loop
    perform private.notify_payment(r.household_id, 'request_published', e.title,
      case when r.n = 1 then format('%s due %s', private.money_text(r.cents), to_char(e.due_at, 'Mon FMDD'))
           else format('%s requests · %s due', r.n, private.money_text(r.cents)) end,
      jsonb_build_object('payment_event_id', p_event_id, 'team_id', e.team_id, 'club_id', e.club_id,
                         'request_id', case when r.n = 1 then r.first_request end, 'count', r.n, 'issuer', v_issuer),
      'pay:new:' || p_event_id || ':' || r.household_id);
  end loop;

  perform private.write_audit('payment_event.publish', 'payment_events', p_event_id, e.team_id, e.club_id, null,
    jsonb_build_object('requests', v_count, 'amount_cents', e.amount_cents, 'fee_policy', e.fee_policy));
  return v_count;
end;
$$;

-- Cancelling leaves paid / paid_offline / in-flight requests intact. Open (unpaid) requests are
-- cancelled, and any not-yet-confirmed payment on them is canceled so the intent can be voided.
create function public.cancel_payment_event(p_event_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  e public.payment_events;
  v_cancelled integer;
begin
  select * into e from public.payment_events where id = p_event_id for update;
  if not found or not private.is_issuer_admin(e.team_id, e.club_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if e.status in ('cancelled') then raise exception 'already_cancelled' using errcode = '23514'; end if;
  -- Void unconfirmed intents (nothing charged yet). Money in flight ('processing') is left to settle.
  update public.payments set status = 'canceled'
  where status = 'requires_payment_method' and id in (
    select i.payment_id from public.payment_items i
    join public.payment_requests q on q.id = i.payment_request_id
    where q.payment_event_id = p_event_id and i.is_active);
  update public.payment_requests set status = 'cancelled'
  where payment_event_id = p_event_id and status in ('unpaid', 'processing')
    and not exists (select 1 from public.payment_items i where i.payment_request_id = payment_requests.id and i.is_active);
  get diagnostics v_cancelled = row_count;
  update public.payment_events set status = 'cancelled', cancelled_at = now() where id = p_event_id;
  perform private.write_audit('payment_event.cancel', 'payment_events', p_event_id, e.team_id, e.club_id,
    jsonb_build_object('status', e.status), jsonb_build_object('status', 'cancelled', 'requests_cancelled', v_cancelled));
  return v_cancelled;
end;
$$;

create function public.waive_request(p_request_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  q public.payment_requests;
  e public.payment_events;
begin
  select * into q from public.payment_requests where id = p_request_id for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into e from public.payment_events where id = q.payment_event_id;
  if not private.is_issuer_staff(e.team_id, e.club_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if q.status <> 'unpaid' then
    raise exception 'request_not_unpaid' using errcode = '23514', detail = 'Only an unpaid request can be waived.';
  end if;
  update public.payment_requests set status = 'waived', waived_by = auth.uid(), waived_at = now(),
    note = nullif(left(btrim(p_note), 300), '') where id = p_request_id;
  perform private.write_audit('payment_request.waive', 'payment_requests', p_request_id, e.team_id, e.club_id,
    jsonb_build_object('status', q.status), jsonb_build_object('status', 'waived', 'display_id', q.display_id, 'amount_cents', q.amount_cents));
end;
$$;

create function public.record_offline_payment(p_request_id uuid, p_method text, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  q public.payment_requests;
  e public.payment_events;
begin
  select * into q from public.payment_requests where id = p_request_id for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into e from public.payment_events where id = q.payment_event_id;
  if not private.is_issuer_staff(e.team_id, e.club_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if q.status <> 'unpaid' then
    raise exception 'request_not_unpaid' using errcode = '23514',
      detail = 'Only an unpaid request can be marked paid offline.';
  end if;
  if p_method not in ('cash', 'check', 'other') then raise exception 'invalid_method' using errcode = '22023'; end if;
  insert into public.offline_payments (payment_request_id, method, note, recorded_by)
    values (p_request_id, p_method, nullif(left(btrim(p_note), 300), ''), auth.uid());
  update public.payment_requests set status = 'paid_offline', paid_at = now() where id = p_request_id;
  perform private.write_audit('payment_request.offline_payment', 'payment_requests', p_request_id, e.team_id, e.club_id,
    jsonb_build_object('status', q.status),
    jsonb_build_object('status', 'paid_offline', 'method', p_method, 'display_id', q.display_id, 'amount_cents', q.amount_cents));
end;
$$;

-- Remind families with unpaid requests. A request is reminded at most once per 24 hours;
-- one notification per household. Returns how many requests were reminded.
create function public.send_payment_reminders(p_event_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  e public.payment_events;
  v_count integer := 0;
  r record;
begin
  select * into e from public.payment_events where id = p_event_id for update;
  if not found or not private.is_issuer_staff(e.team_id, e.club_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if e.status <> 'published' then raise exception 'event_not_open' using errcode = '23514'; end if;

  for r in
    select q.household_id, count(*) as n, min(q.id::text)::uuid as first_request, sum(q.amount_cents) as cents
    from public.payment_requests q
    where q.payment_event_id = p_event_id and q.status = 'unpaid'
      and (q.last_reminded_at is null or q.last_reminded_at <= now() - interval '24 hours')
    group by q.household_id
  loop
    update public.payment_requests set last_reminded_at = now()
    where payment_event_id = p_event_id and household_id = r.household_id and status = 'unpaid'
      and (last_reminded_at is null or last_reminded_at <= now() - interval '24 hours');
    v_count := v_count + r.n;
    perform private.notify_payment(r.household_id, 'reminder', e.title,
      format('Reminder: %s due %s', private.money_text(r.cents), to_char(e.due_at, 'Mon FMDD')),
      jsonb_build_object('payment_event_id', p_event_id, 'team_id', e.team_id, 'club_id', e.club_id,
                         'request_id', case when r.n = 1 then r.first_request end, 'count', r.n),
      'pay:rem:' || p_event_id || ':' || r.household_id || ':' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'));
  end loop;
  if v_count > 0 then
    perform private.write_audit('payment_event.remind', 'payment_events', p_event_id, e.team_id, e.club_id, null,
      jsonb_build_object('requests_reminded', v_count));
  end if;
  return v_count;
end;
$$;

revoke execute on function private.event_audience(uuid, uuid), private.notify_payment(uuid, text, text, text, jsonb, text),
  private.money_text(bigint) from public, anon, authenticated;
revoke execute on function
  public.create_payment_event(uuid, uuid, text, text, integer, timestamptz, text, uuid[], text),
  public.update_payment_event(uuid, text, text, integer, timestamptz, text, uuid[], text),
  public.publish_payment_event(uuid), public.cancel_payment_event(uuid),
  public.waive_request(uuid, text), public.record_offline_payment(uuid, text, text),
  public.send_payment_reminders(uuid)
  from public, anon, authenticated;
grant execute on function
  public.create_payment_event(uuid, uuid, text, text, integer, timestamptz, text, uuid[], text),
  public.update_payment_event(uuid, text, text, integer, timestamptz, text, uuid[], text),
  public.publish_payment_event(uuid), public.cancel_payment_event(uuid),
  public.waive_request(uuid, text), public.record_offline_payment(uuid, text, text),
  public.send_payment_reminders(uuid)
  to authenticated;
