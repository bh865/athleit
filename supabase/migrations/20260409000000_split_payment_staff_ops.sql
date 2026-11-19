-- Split payments, step 2d: staff operations on installments.
--  * Offline payment, waive an installment, waive the remaining balance, retry a failed charge now, send a reminder (max once per 24h),
--    restructure the remaining installments (dates or count, never the total). Every action is audited and limited to issuer staff.
--  * Cancelling an event cancels its unpaid and scheduled installments (paid ones untouched); removing a player from the team roster
--    cancels that player's open installments for the team's events.
--  * A plan request is waived / paid offline by installment only (the roll-up sets the request status).
--  * Account deletion is blocked while a household has an active payment plan.

alter table public.offline_payments add column installment_id uuid references public.payment_request_installments (id) on delete restrict;
alter table public.offline_payments drop constraint offline_payments_payment_request_id_key;
create unique index offline_payments_one_per_request on public.offline_payments (payment_request_id) where installment_id is null;
create unique index offline_payments_one_per_installment on public.offline_payments (installment_id) where installment_id is not null;
create index offline_payments_installment_idx on public.offline_payments (installment_id) where installment_id is not null;

create or replace function private.guard_payment_request()
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
  if new.plan_count is distinct from old.plan_count and old.plan_count is not null
     and current_setting('athleit.restructure', true) is distinct from 'on'
     and not (new.plan_count is null and not exists (select 1 from public.payment_request_installments i where i.request_id = old.id)) then
    raise exception 'payment_request_immutable' using errcode = '23514', detail = 'A plan cannot change size once chosen.';
  end if;
  -- A plan request is waived / paid offline installment by installment (the roll-up sets the request status itself).
  if new.status is distinct from old.status and new.status in ('waived', 'paid_offline') and old.plan_count is not null
     and current_setting('athleit.rollup', true) is distinct from 'on' then
    raise exception 'plan_request_use_installments' using errcode = '23514', detail = 'This request is on a payment plan: act on its installments.';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'unpaid' and new.status in ('processing', 'partially_paid', 'paid', 'paid_offline', 'waived', 'cancelled'))
    or (old.status = 'processing' and new.status in ('unpaid', 'partially_paid', 'paid', 'cancelled'))
    or (old.status = 'partially_paid' and new.status in ('paid', 'waived', 'cancelled', 'partially_refunded', 'refunded'))
    or (old.status = 'paid' and new.status in ('partially_refunded', 'refunded'))
    or (old.status = 'partially_refunded' and new.status in ('refunded'))) then
    raise exception 'invalid_status_transition' using errcode = '23514',
      detail = format('%s -> %s', old.status, new.status);
  end if;
  return new;
end;
$$;
create or replace function private.rollup_request_from_installments()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_req uuid := coalesce(new.request_id, old.request_id);
  c record;
  v_new text;
  v_cur text;
begin
  select count(*) as total,
         count(*) filter (where status in ('paid', 'paid_offline')) as settled,
         count(*) filter (where status in ('paid')) as paid,
         count(*) filter (where status in ('refunded', 'partially_refunded')) as refunded,
         count(*) filter (where status = 'partially_refunded') as part_refunded,
         count(*) filter (where status = 'waived') as waived,
         count(*) filter (where status = 'cancelled') as cancelled,
         count(*) filter (where status = 'processing') as processing,
         count(*) filter (where status in ('scheduled', 'due', 'processing', 'failed')) as open
    into c from public.payment_request_installments where request_id = v_req;
  select status into v_cur from public.payment_requests where id = v_req for update;
  v_new := case
    when c.refunded > 0 then
      case when c.part_refunded = 0 and c.open = 0 and c.settled = 0 then 'refunded' else 'partially_refunded' end
    when c.open = 0 and c.waived > 0 then 'waived'
    when c.open = 0 and c.cancelled > 0 then 'cancelled'
    when c.open = 0 then case when c.paid > 0 then 'paid' else 'paid_offline' end
    when c.settled > 0 then 'partially_paid'
    when c.processing > 0 then 'processing'
    else 'unpaid' end;
  if v_new is distinct from v_cur then
    perform set_config('athleit.rollup', 'on', true);
    update public.payment_requests
      set status = v_new,
          paid_at = case when v_new in ('paid', 'paid_offline') then coalesce(paid_at, now()) else paid_at end
      where id = v_req;
    perform set_config('athleit.rollup', 'off', true);
  end if;
  return null;
end;
$$;
create or replace function public.account_deletion_blockers()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name)
      from public.team_memberships m
      join public.teams t on t.id = m.team_id
      where m.profile_id = v_uid and m.role = 'admin' and m.status = 'active'
        and not exists (
          select 1 from public.team_memberships o
          where o.team_id = m.team_id and o.role = 'admin' and o.status = 'active' and o.id <> m.id)
    ), '[]'::jsonb),
    'clubs', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
      from public.club_memberships m
      join public.clubs c on c.id = m.club_id
      where m.profile_id = v_uid and m.role = 'admin' and m.status = 'active'
        and not exists (
          select 1 from public.club_memberships o
          where o.club_id = m.club_id and o.role = 'admin' and o.status = 'active' and o.id <> m.id)
    ), '[]'::jsonb),
    'households', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name) order by h.name)
      from public.household_members hm
      join public.households h on h.id = hm.household_id
      where hm.profile_id = v_uid
        and exists (select 1 from public.players p where p.household_id = h.id)
        and not exists (
          select 1 from public.household_members o
          where o.household_id = hm.household_id and o.profile_id <> v_uid)
    ), '[]'::jsonb),
    -- An active payment plan (installments still to be paid) must be completed, cancelled or waived first.
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', e.title || ' · ' || r.display_id) order by e.title, r.display_id)
      from public.payment_requests r
      join public.payment_events e on e.id = r.payment_event_id
      where r.plan_count is not null
        and exists (select 1 from public.household_members hm where hm.household_id = r.household_id and hm.profile_id = v_uid)
        and exists (select 1 from public.payment_request_installments i where i.request_id = r.id and i.status in ('scheduled', 'due', 'processing', 'failed'))
    ), '[]'::jsonb)
  );
end;
$$;
-- Cancel open payments that cover these installments and free every installment they covered. A payment that is really in flight
-- at the processor (processing) cannot be voided: staff wait for it to settle.
create function private.void_open_installment_payments(p_ids uuid[])
returns void language plpgsql security definer set search_path = ''
as $$
declare v_pay uuid[];
begin
  if exists (select 1 from public.payment_items pi join public.payments p on p.id = pi.payment_id
             where pi.installment_id = any (p_ids) and pi.is_active and p.status = 'processing') then
    raise exception 'installment_processing' using errcode = '23514', detail = 'A payment for this installment is being processed. Try again shortly.';
  end if;
  select array_agg(distinct p.id) into v_pay from public.payment_items pi join public.payments p on p.id = pi.payment_id
    where pi.installment_id = any (p_ids) and pi.is_active and p.status in ('requires_payment_method', 'failed');
  if v_pay is null then return; end if;
  update public.payments set status = 'canceled' where id = any (v_pay);
  update public.payment_request_installments i set status = case when i.due_at <= now() then 'due' else 'scheduled' end
    where i.status = 'processing' and i.id in (select installment_id from public.payment_items where payment_id = any (v_pay) and installment_id is not null);
  perform private.kick_reconcile();
end;
$$;

create function private.installment_staff(p_installment_id uuid)
returns table (inst public.payment_request_installments, req public.payment_requests, ev public.payment_events)
language plpgsql security definer set search_path = ''
as $$
begin
  select * into inst from public.payment_request_installments where id = p_installment_id for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into req from public.payment_requests where id = inst.request_id;
  select * into ev from public.payment_events where id = req.payment_event_id;
  if not private.is_issuer_staff(ev.team_id, ev.club_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return next;
end;
$$;

create function public.record_offline_installment(p_installment_id uuid, p_method text, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare s record;
begin
  select * into s from private.installment_staff(p_installment_id);
  perform private.void_open_installment_payments(array[p_installment_id]);
  if (select status from public.payment_request_installments where id = p_installment_id) not in ('scheduled', 'due', 'failed') then
    raise exception 'installment_not_open' using errcode = '23514', detail = 'Only an open installment can be marked paid offline.';
  end if;
  if p_method not in ('cash', 'check', 'other') then raise exception 'invalid_method' using errcode = '22023'; end if;
  insert into public.offline_payments (payment_request_id, installment_id, method, note, recorded_by)
    values ((s.inst).request_id, p_installment_id, p_method, nullif(left(btrim(p_note), 300), ''), auth.uid());
  update public.payment_request_installments set status = 'paid_offline', paid_at = now(), next_retry_at = null where id = p_installment_id;
  perform private.write_audit('installment.offline_payment', 'payment_request_installments', p_installment_id, (s.ev).team_id, (s.ev).club_id,
    jsonb_build_object('status', (s.inst).status),
    jsonb_build_object('status', 'paid_offline', 'method', p_method, 'display_id', (s.req).display_id, 'sequence', (s.inst).sequence, 'amount_cents', (s.inst).amount_cents));
end;
$$;

create function public.waive_installment(p_installment_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare s record;
begin
  select * into s from private.installment_staff(p_installment_id);
  perform private.void_open_installment_payments(array[p_installment_id]);
  if (select status from public.payment_request_installments where id = p_installment_id) not in ('scheduled', 'due', 'failed') then
    raise exception 'installment_not_open' using errcode = '23514', detail = 'Only an open installment can be waived.';
  end if;
  update public.payment_request_installments set status = 'waived', waived_by = auth.uid(), waived_at = now(),
    note = nullif(left(btrim(p_note), 300), ''), next_retry_at = null where id = p_installment_id;
  perform private.write_audit('installment.waive', 'payment_request_installments', p_installment_id, (s.ev).team_id, (s.ev).club_id,
    jsonb_build_object('status', (s.inst).status),
    jsonb_build_object('status', 'waived', 'display_id', (s.req).display_id, 'sequence', (s.inst).sequence, 'amount_cents', (s.inst).amount_cents));
end;
$$;

-- Waive everything still owed on a plan. Paid installments are untouched.
create function public.waive_remaining_balance(p_request_id uuid, p_note text default null)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  q public.payment_requests;
  e public.payment_events;
  v_ids uuid[];
begin
  select * into q from public.payment_requests where id = p_request_id for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into e from public.payment_events where id = q.payment_event_id;
  if not private.is_issuer_staff(e.team_id, e.club_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if q.plan_count is null then raise exception 'not_a_plan' using errcode = '23514'; end if;
  select array_agg(id) into v_ids from public.payment_request_installments where request_id = p_request_id and status in ('scheduled', 'due', 'processing', 'failed');
  if v_ids is null then raise exception 'nothing_to_waive' using errcode = '23514'; end if;
  perform private.void_open_installment_payments(v_ids);
  update public.payment_request_installments set status = 'waived', waived_by = auth.uid(), waived_at = now(),
    note = nullif(left(btrim(p_note), 300), ''), next_retry_at = null where request_id = p_request_id and status in ('scheduled', 'due', 'failed');
  perform private.write_audit('payment_request.waive_remaining', 'payment_requests', p_request_id, e.team_id, e.club_id, null,
    jsonb_build_object('display_id', q.display_id, 'installments', cardinality(v_ids)));
  return cardinality(v_ids);
end;
$$;

-- Retry a failed automatic charge on the next scheduler run. Allows one more attempt even after the last one failed.
create function public.retry_installment_charge(p_installment_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare s record;
begin
  select * into s from private.installment_staff(p_installment_id);
  if (s.inst).status <> 'failed' then raise exception 'installment_not_failed' using errcode = '23514'; end if;
  if not (s.req).autopay then raise exception 'autopay_off' using errcode = '23514', detail = 'The family pays this plan by hand.'; end if;
  update public.payment_request_installments set next_retry_at = now(), attempt_count = least(attempt_count, 2) where id = p_installment_id;
  perform private.write_audit('installment.retry', 'payment_request_installments', p_installment_id, (s.ev).team_id, (s.ev).club_id, null,
    jsonb_build_object('display_id', (s.req).display_id, 'sequence', (s.inst).sequence));
  perform private.kick_charge_installments();
end;
$$;

-- At most one reminder per installment per 24 hours.
create function public.send_installment_reminder(p_installment_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare s record;
begin
  select * into s from private.installment_staff(p_installment_id);
  if (s.inst).status not in ('scheduled', 'due', 'failed') then raise exception 'installment_not_open' using errcode = '23514'; end if;
  if (s.inst).last_reminded_at is not null and (s.inst).last_reminded_at > now() - interval '24 hours' then return false; end if;
  update public.payment_request_installments set last_reminded_at = now() where id = p_installment_id;
  perform private.notify_payment((s.req).household_id, 'reminder', (s.ev).title,
    format('Reminder: installment %s of %s (%s) is due %s', (s.inst).sequence, (s.req).plan_count, private.money_text((s.inst).amount_cents),
           to_char((s.inst).due_at at time zone 'UTC', 'Mon FMDD')),
    jsonb_build_object('payment_event_id', (s.ev).id, 'request_id', (s.req).id, 'installment_id', p_installment_id),
    'pay:inst-rem:' || p_installment_id || ':' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSUS'));
  perform private.write_audit('installment.remind', 'payment_request_installments', p_installment_id, (s.ev).team_id, (s.ev).club_id, null,
    jsonb_build_object('display_id', (s.req).display_id, 'sequence', (s.inst).sequence));
  return true;
end;
$$;

-- Re-lay the installments still owed: p_remaining of them, the first due p_next_due, spaced by the event cadence. The total never changes.
-- Only possible when everything already settled comes BEFORE what is still open (a plain suffix), nothing is in flight, and the plan
-- stays at six installments or fewer. Staff may choose dates after the event due date (it is their decision); the family is told.
create function public.restructure_plan(p_request_id uuid, p_remaining integer, p_next_due timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  q public.payment_requests;
  e public.payment_events;
  v_open uuid[];
  v_k integer;
  v_total integer;
begin
  select * into q from public.payment_requests where id = p_request_id for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into e from public.payment_events where id = q.payment_event_id;
  if not private.is_issuer_staff(e.team_id, e.club_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if q.plan_count is null then raise exception 'not_a_plan' using errcode = '23514'; end if;
  if p_remaining is null or p_remaining not between 1 and 5 or p_next_due is null or p_next_due < now() - interval '1 day' then
    raise exception 'invalid_restructure' using errcode = '22023';
  end if;
  if exists (select 1 from public.payment_request_installments where request_id = p_request_id and status = 'processing') then
    raise exception 'installment_processing' using errcode = '23514', detail = 'A payment is being processed. Try again shortly.';
  end if;
  select array_agg(id), coalesce(sum(amount_cents), 0) into v_open, v_total
    from public.payment_request_installments where request_id = p_request_id and status in ('scheduled', 'due', 'failed');
  if v_open is null then raise exception 'nothing_to_restructure' using errcode = '23514'; end if;
  select count(*) into v_k from public.payment_request_installments where request_id = p_request_id and id <> all (v_open);
  if v_k + p_remaining > 6 then raise exception 'plan_too_long' using errcode = '23514'; end if;
  if v_total < 50 * p_remaining then raise exception 'invalid_restructure' using errcode = '22023', detail = 'Each installment must be at least 50 cents.'; end if;
  if v_k > 0 and (select max(sequence) from public.payment_request_installments where request_id = p_request_id and id <> all (v_open))
                 > (select min(sequence) from public.payment_request_installments where id = any (v_open)) then
    raise exception 'restructure_not_possible' using errcode = '23514', detail = 'An installment after an open one is already settled.';
  end if;
  if exists (select 1 from public.payment_items pi join public.payments p on p.id = pi.payment_id
             where pi.installment_id = any (v_open) and p.status in ('succeeded', 'partially_refunded', 'refunded', 'processing')) then
    raise exception 'restructure_not_possible' using errcode = '23514';
  end if;
  perform private.void_open_installment_payments(v_open);
  delete from public.payment_items where installment_id = any (v_open) and not is_active;
  delete from public.offline_payments where installment_id = any (v_open);
  delete from public.payment_request_installments where id = any (v_open);
  perform set_config('athleit.restructure', 'on', true);
  update public.payment_requests set plan_count = v_k + p_remaining where id = p_request_id;
  perform set_config('athleit.restructure', 'off', true);
  insert into public.payment_request_installments (request_id, sequence, amount_cents, due_at)
    select p_request_id, v_k + g.sequence, g.amount_cents, g.due_at from private.generate_plan(v_total, p_remaining, e.plan_cadence, p_next_due) g;
  if p_note is not null then
    update public.payment_requests set note = nullif(left(btrim(p_note), 300), '') where id = p_request_id;
  end if;
  perform private.write_audit('payment_request.restructure', 'payment_requests', p_request_id, e.team_id, e.club_id,
    jsonb_build_object('plan_count', q.plan_count, 'open', cardinality(v_open)),
    jsonb_build_object('plan_count', v_k + p_remaining, 'open', p_remaining, 'remaining_cents', v_total, 'next_due', p_next_due, 'display_id', q.display_id));
  perform private.notify_payment(q.household_id, 'plan_restructured', e.title,
    format('Your payment plan was updated: %s still to pay in %s installment%s, next due %s.', private.money_text(v_total), p_remaining,
           case when p_remaining = 1 then '' else 's' end, to_char(p_next_due at time zone 'UTC', 'Mon FMDD')),
    jsonb_build_object('payment_event_id', e.id, 'request_id', q.id), 'pay:restructure:' || q.id || ':' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSUS'));
end;
$$;

-- Cancelling an event cancels what is still owed on its plans; paid installments are untouched.
create function private.cancel_installments_on_event_cancel()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.payment_request_installments set status = 'cancelled', next_retry_at = null
    where status in ('scheduled', 'due', 'failed')
      and request_id in (select id from public.payment_requests where payment_event_id = new.id);
  return null;
end;
$$;
create trigger payment_events_cancel_installments after update of status on public.payment_events
  for each row when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function private.cancel_installments_on_event_cancel();

-- A player leaving the roster stops what the team is still owed by them (paid installments stay for staff to refund).
create function private.cancel_installments_on_roster_exit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_team uuid := coalesce(old.team_id, new.team_id); v_player uuid := coalesce(old.player_id, new.player_id);
begin
  update public.payment_request_installments set status = 'cancelled', next_retry_at = null
    where status in ('scheduled', 'due', 'failed')
      and request_id in (select r.id from public.payment_requests r join public.payment_events e on e.id = r.payment_event_id
                         where r.player_id = v_player and e.team_id = v_team);
  return null;
end;
$$;
create trigger team_players_cancel_installments after update of status on public.team_players
  for each row when (new.status <> 'active' and old.status is distinct from new.status)
  execute function private.cancel_installments_on_roster_exit();
create trigger team_players_cancel_installments_delete after delete on public.team_players
  for each row execute function private.cancel_installments_on_roster_exit();

revoke execute on function private.void_open_installment_payments(uuid[]), private.installment_staff(uuid),
  private.cancel_installments_on_event_cancel(), private.cancel_installments_on_roster_exit() from public, anon, authenticated;
revoke execute on function public.record_offline_installment(uuid, text, text), public.waive_installment(uuid, text),
  public.waive_remaining_balance(uuid, text), public.retry_installment_charge(uuid), public.send_installment_reminder(uuid),
  public.restructure_plan(uuid, integer, timestamptz, text), public.account_deletion_blockers() from public, anon, authenticated;
grant execute on function public.record_offline_installment(uuid, text, text), public.waive_installment(uuid, text),
  public.waive_remaining_balance(uuid, text), public.retry_installment_charge(uuid), public.send_installment_reminder(uuid),
  public.restructure_plan(uuid, integer, timestamptz, text), public.account_deletion_blockers() to authenticated;
