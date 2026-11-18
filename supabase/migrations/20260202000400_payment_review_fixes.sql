-- Phase 4 (B5): fixes from the independent adversarial review of the money paths
--
--  1. A reused reservation re-checks payability; waive / offline / cancel void open payments first (and kick reconcile
--     so the Stripe intent is canceled within minutes, not hours).
--  2. A payment that succeeds after we canceled it gets its items back (so it can be refunded) and admins are told.
--  3. Webhook refunds adopt OUR reserved refund row (matched by metadata) instead of duplicating it.
--  4. payment_intent.succeeded is validated against the reserved amount / currency / destination / application fee.
--  5. Refunds are blocked while a payment is disputed; prepare_refund authorizes before revealing status.
--  6. Payers no longer read payment_events directly (it exposed audience ids and fee snapshots); they use household_payments.
--  7. Export no longer marks in-flight attempts as paid; svc_finish_event counts failed attempts.

-- Void unconfirmed payments holding these requests. A payment whose money is in flight cannot be voided.
create function private.void_open_payments(p_request_ids uuid[])
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.payments p join public.payment_items i on i.payment_id = p.id
             where i.payment_request_id = any (p_request_ids) and i.is_active and p.status = 'processing') then
    raise exception 'payment_in_flight' using errcode = '23514', detail = 'A payment is being processed for this request.';
  end if;
  update public.payments set status = 'canceled'
  where status in ('requires_payment_method', 'failed')
    and id in (select payment_id from public.payment_items where payment_request_id = any (p_request_ids) and is_active);
  update public.payment_requests set status = 'unpaid' where id = any (p_request_ids) and status = 'processing';
end;
$$;

-- An item may be re-activated only because its payment really succeeded.
create or replace function private.guard_payment_item()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.payment_id is distinct from old.payment_id or new.payment_request_id is distinct from old.payment_request_id
     or new.amount_cents is distinct from old.amount_cents
     or new.platform_fee_cents is distinct from old.platform_fee_cents
     or new.processing_fee_passthrough_cents is distinct from old.processing_fee_passthrough_cents
     or (old.is_active = false and new.is_active
         and not exists (select 1 from public.payments p where p.id = new.payment_id and p.status = 'succeeded')) then
    raise exception 'payment_item_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.svc_finish_event(p_event_id text, p_error text default null, p_final boolean default false)
returns void language sql security definer set search_path = ''
as $$
  update public.stripe_webhook_events
  set processed_at = case when p_error is null or p_final then now() else null end, error = left(p_error, 500),
      attempts = attempts + case when p_error is not null and not p_final then 1 else 0 end
  where stripe_event_id = p_event_id;
$$;

drop policy "Issuer staff and billed families read events" on public.payment_events;
create policy "Issuer staff read events" on public.payment_events
  for select to authenticated using (private.is_issuer_staff(team_id, club_id));

alter function public.svc_reconcile_candidates(interval) rename to svc_reconcile_candidates_base;
revoke execute on function public.svc_reconcile_candidates_base(interval) from public, anon, authenticated;
grant execute on function public.svc_reconcile_candidates_base(interval) to service_role;

-- Stuck events carry their Connect account so reconcile can re-fetch them as that account.
create or replace function public.svc_reconcile_candidates(p_stale interval default interval '15 minutes')
returns jsonb language sql stable security definer set search_path = ''
as $$
  select public.svc_reconcile_candidates_base(p_stale)
         || jsonb_build_object('stuck_events', coalesce((select jsonb_agg(jsonb_build_object('id', w.stripe_event_id, 'account', w.stripe_account_id))
              from (select stripe_event_id, stripe_account_id from public.stripe_webhook_events
                    where processed_at is null and received_at < now() - interval '10 minutes' and attempts < 12
                    order by received_at limit 50) w), '[]'::jsonb));
$$;

drop function public.svc_payment_succeeded(text, uuid, text, integer);
create function public.svc_payment_succeeded(
  p_pi text, p_payment_id uuid default null, p_charge text default null, p_stripe_fee integer default null,
  p_amount integer default null, p_currency text default null, p_destination text default null, p_application_fee integer default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v public.payments;
  v_issuer record;
  v_was text;
  v_acct text;
  r record;
begin
  v := private.lock_payment(p_pi, p_payment_id);
  if v.id is null then return 'unknown_payment'; end if;
  -- Defence in depth: what Stripe says was charged must be what we reserved (raising also rolls back any id attach).
  select stripe_account_id into v_acct from public.connected_accounts where id = v.connected_account_id;
  if (p_amount is not null and p_amount <> v.total_charged_cents)
     or (p_currency is not null and lower(p_currency) <> 'usd')
     or (p_destination is not null and p_destination <> v_acct)
     or (p_application_fee is not null and p_application_fee <> v.application_fee_cents) then
    raise exception 'payment_mismatch' using errcode = '23514';
  end if;
  if v.status in ('succeeded', 'partially_refunded', 'refunded') then
    update public.payments set stripe_charge_id = coalesce(stripe_charge_id, p_charge),
      stripe_fee_cents = coalesce(stripe_fee_cents, p_stripe_fee) where id = v.id;
    return 'noop';
  end if;
  v_was := v.status;
  update public.payments set status = 'succeeded', succeeded_at = now(),
    stripe_charge_id = coalesce(stripe_charge_id, p_charge), stripe_fee_cents = coalesce(p_stripe_fee, stripe_fee_cents),
    net_to_account_cents = total_charged_cents - application_fee_cents,
    receipt_display_id = coalesce(receipt_display_id, private.next_receipt_display_id())
  where id = v.id returning * into v;
  -- Money arrived for a payment we had already canceled: make its items refundable again (unless another live payment holds them).
  if v_was = 'canceled' then
    update public.payment_items i set is_active = true where i.payment_id = v.id and not i.is_active
      and not exists (select 1 from public.payment_items o where o.payment_request_id = i.payment_request_id and o.is_active);
  end if;

  update public.payment_requests set status = 'paid', paid_at = now()
  where status in ('unpaid', 'processing') and id in (select payment_request_id from public.payment_items where payment_id = v.id);

  select * into v_issuer from private.payment_issuer(v.id);
  -- A request that is cancelled / waived / already paid offline cannot become paid: flag it for a staff refund.
  for r in
    select q.id, q.display_id, q.status from public.payment_requests q
    join public.payment_items i on i.payment_request_id = q.id
    where i.payment_id = v.id and q.status in ('cancelled', 'waived', 'paid_offline')
  loop
    insert into public.audit_log (action, target_type, target_id, team_id, club_id, after)
    values ('payment.succeeded_on_closed_request', 'payment_requests', r.id, v_issuer.team_id, v_issuer.club_id,
            jsonb_build_object('payment_id', v.id, 'display_id', r.display_id, 'request_status', r.status, 'previous_payment_status', v_was));
    perform private.notify_issuer_admins(v_issuer.team_id, v_issuer.club_id, 'payment_needs_refund', coalesce(v_issuer.title, 'Payment'),
      format('A payment arrived for %s, which was already closed. Refund it from Payments.', r.display_id),
      jsonb_build_object('payment_id', v.id, 'payment_event_id', v_issuer.event_id), 'pay:closed:' || v.id || ':' || r.id);
  end loop;

  perform private.notify_payment(v.household_id, 'receipt', coalesce(v_issuer.title, 'Payment'),
    format('Paid %s · receipt %s', private.money_text(v.total_charged_cents), v.receipt_display_id),
    jsonb_build_object('payment_id', v.id, 'payment_event_id', v_issuer.event_id), 'pay:rcp:' || v.id);
  perform private.notify_issuer_admins(v_issuer.team_id, v_issuer.club_id, 'payment_received', coalesce(v_issuer.title, 'Payment'),
    format('%s received', private.money_text(v.base_cents)),
    jsonb_build_object('payment_id', v.id, 'payment_event_id', v_issuer.event_id), 'pay:got:' || v.id);
  return 'applied';
end;
$$;
create or replace function public.svc_refund_event(p_pi text, p_refunds jsonb, p_payment_id uuid default null, p_charge text default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v public.payments;
  v_issuer record;
  f jsonb;
  v_status text;
  v_old text;
  v_refunded bigint;
  v_all_full boolean;
  it record;
  v_item_refunded bigint;
  v_payment_level bigint;
  v_found boolean;
begin
  v := private.lock_payment(p_pi, p_payment_id);
  if v.id is null then return 'unknown_payment'; end if;
  -- A refund implies the charge succeeded; an out-of-order refund event converges by applying success first.
  if v.status in ('requires_payment_method', 'processing', 'failed', 'canceled') then
    perform public.svc_payment_succeeded(p_pi, v.id, p_charge, null);
    select * into v from public.payments where id = v.id;
  end if;
  select * into v_issuer from private.payment_issuer(v.id);

  for f in select * from jsonb_array_elements(coalesce(p_refunds, '[]'::jsonb)) loop
    v_status := case f ->> 'status' when 'succeeded' then 'succeeded' when 'failed' then 'failed'
                  when 'canceled' then 'canceled' else 'pending' end;
    v_old := null; v_found := false;
    select status into v_old from public.refunds where stripe_refund_id = f ->> 'id' for update;
    v_found := found;
    if not v_found and (f ->> 'ref') ~ '^[0-9a-f-]{36}$' then
      -- Our own reserved refund (the webhook beat svc_attach_refund): adopt Stripe's id instead of duplicating it.
      update public.refunds set stripe_refund_id = f ->> 'id'
        where id = (f ->> 'ref')::uuid and payment_id = v.id and stripe_refund_id is null returning status into v_old;
      v_found := found;
    end if;
    if not v_found then
      insert into public.refunds (payment_id, stripe_refund_id, amount_cents, reason, status)
      values (v.id, f ->> 'id', (f ->> 'amount')::int, 'Issued in Stripe', v_status);
      v_old := null;
    end if;
    if v_found and v_old is distinct from 'succeeded' then
      update public.refunds set status = v_status where stripe_refund_id = f ->> 'id';
    end if;
    if v_status = 'succeeded' and v_old is distinct from 'succeeded' then
      perform private.notify_payment(v.household_id, 'refund', coalesce(v_issuer.title, 'Payment'),
        format('Refund of %s issued', private.money_text((f ->> 'amount')::bigint)),
        jsonb_build_object('payment_id', v.id, 'payment_event_id', v_issuer.event_id), 'pay:rf:' || (f ->> 'id'));
    end if;
  end loop;

  select coalesce(sum(amount_cents), 0) into v_refunded from public.refunds where payment_id = v.id and status = 'succeeded';
  select coalesce(sum(amount_cents), 0) into v_payment_level from public.refunds
    where payment_id = v.id and status = 'succeeded' and payment_item_id is null;
  v_all_full := true;
  for it in select i.id, i.amount_cents, i.payment_request_id from public.payment_items i where i.payment_id = v.id and i.is_active loop
    select coalesce(sum(base_cents), 0) into v_item_refunded from public.refunds
      where payment_item_id = it.id and status = 'succeeded';
    if v_refunded >= v.total_charged_cents then v_item_refunded := it.amount_cents; end if;
    if v_item_refunded >= it.amount_cents then
      update public.payment_requests set status = 'refunded' where id = it.payment_request_id and status in ('paid', 'partially_refunded');
    elsif v_item_refunded > 0 or v_payment_level > 0 then
      v_all_full := false;
      update public.payment_requests set status = 'partially_refunded' where id = it.payment_request_id and status = 'paid';
    else
      v_all_full := false;
    end if;
  end loop;

  if v_refunded >= v.total_charged_cents or (v_all_full and v_refunded > 0) then
    if v.status <> 'refunded' then update public.payments set status = 'refunded' where id = v.id; end if;
  elsif v_refunded > 0 and v.status = 'succeeded' then
    update public.payments set status = 'partially_refunded' where id = v.id;
  end if;
  return 'applied';
end;
$$;

create or replace function public.prepare_refund(
  p_payment_id uuid, p_item_id uuid default null, p_base_cents integer default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v public.payments;
  e public.payment_events;
  it record;
  v_cfg jsonb;
  v_remaining integer;
  v_base integer;
  v_full boolean;
  v_ath integer;
  v_svc integer;
  v_ath_done integer;
  v_svc_done integer;
  v_id uuid;
  v_out jsonb := '[]'::jsonb;
  v_acct text;
begin
  select * into v from public.payments where id = p_payment_id for update;
  -- Authorize BEFORE revealing anything about the payment.
  if not found or not exists (
      select 1 from public.payment_items i join public.payment_requests q on q.id = i.payment_request_id
      join public.payment_events pe on pe.id = q.payment_event_id
      where i.payment_id = v.id and private.is_issuer_admin(pe.team_id, pe.club_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if exists (select 1 from public.payment_items i join public.payment_requests q on q.id = i.payment_request_id
             where i.payment_id = v.id and q.disputed) then
    raise exception 'payment_disputed' using errcode = '23514', detail = 'Resolve the dispute in Stripe before refunding.';
  end if;
  if v.status not in ('succeeded', 'partially_refunded') then
    raise exception 'not_refundable' using errcode = '23514', detail = 'Only a completed payment can be refunded.';
  end if;
  if p_item_id is not null and p_base_cents is not null and p_base_cents <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_item_id is null and p_base_cents is not null then
    raise exception 'amount_needs_item' using errcode = '22023', detail = 'Choose which request to part-refund.';
  end if;

  for it in
    select i.*, q.payment_event_id from public.payment_items i
    join public.payment_requests q on q.id = i.payment_request_id
    where i.payment_id = v.id and (i.is_active or v.status in ('succeeded', 'partially_refunded')) and (p_item_id is null or i.id = p_item_id) order by q.display_id
  loop
    select * into e from public.payment_events where id = it.payment_event_id;
    -- Refunds are an admin power of the issuer, checked per event.
    if not private.is_issuer_admin(e.team_id, e.club_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
    v_cfg := e.fee_config;
    select it.amount_cents - coalesce(sum(r.base_cents), 0) into v_remaining
      from public.refunds r where r.payment_item_id = it.id and r.status in ('pending', 'succeeded');
    if v_remaining <= 0 then continue; end if;
    v_base := coalesce(p_base_cents, v_remaining);
    if v_base > v_remaining then raise exception 'refund_exceeds_payment' using errcode = '23514'; end if;
    v_full := v_base = v_remaining;
    select coalesce(sum(r.athleit_charge_cents), 0), coalesce(sum(r.service_fee_cents), 0) into v_ath_done, v_svc_done
      from public.refunds r where r.payment_item_id = it.id and r.status in ('pending', 'succeeded');
    v_ath := case when v_full and (v_cfg ->> 'refund_athleit_charge_on_full')::boolean then it.platform_fee_cents - v_ath_done
                  when not v_full and (v_cfg ->> 'refund_athleit_charge_on_partial')::boolean then (it.platform_fee_cents::bigint * v_base / it.amount_cents)::int
                  else 0 end;
    v_svc := case when v_full and (v_cfg ->> 'refund_service_fee_on_full')::boolean then it.processing_fee_passthrough_cents - v_svc_done
                  when not v_full and (v_cfg ->> 'refund_service_fee_on_partial')::boolean then (it.processing_fee_passthrough_cents::bigint * v_base / it.amount_cents)::int
                  else 0 end;
    v_ath := greatest(0, least(v_ath, it.platform_fee_cents - v_ath_done));
    v_svc := greatest(0, least(v_svc, it.processing_fee_passthrough_cents - v_svc_done));
    insert into public.refunds (payment_id, payment_item_id, amount_cents, base_cents, athleit_charge_cents, service_fee_cents, reason, requested_by)
    values (v.id, it.id, v_base + v_ath + v_svc, v_base, v_ath, v_svc, nullif(left(btrim(p_reason), 300), ''), auth.uid())
    returning id into v_id;
    perform private.write_audit('payment.refund', 'refunds', v_id, e.team_id, e.club_id, null,
      jsonb_build_object('payment_id', v.id, 'amount_cents', v_base + v_ath + v_svc, 'base_cents', v_base, 'athleit_charge_cents', v_ath,
                         'service_fee_cents', v_svc));
    v_out := v_out || jsonb_build_object('refund_id', v_id, 'amount_cents', v_base + v_ath + v_svc, 'refund_application_fee', v_ath > 0);
  end loop;
  if jsonb_array_length(v_out) = 0 then raise exception 'nothing_to_refund' using errcode = '23514'; end if;
  select stripe_account_id into v_acct from public.connected_accounts where id = v.connected_account_id;
  return jsonb_build_object('payment_id', v.id, 'stripe_payment_intent_id', v.stripe_payment_intent_id,
                            'stripe_account_id', v_acct, 'refunds', v_out);
end;
$$;

create or replace function public.waive_request(p_request_id uuid, p_note text default null)
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
  perform private.void_open_payments(array[p_request_id]);
  if q.status <> 'unpaid' then
    raise exception 'request_not_unpaid' using errcode = '23514', detail = 'Only an unpaid request can be waived.';
  end if;
  perform private.kick_reconcile();
  update public.payment_requests set status = 'waived', waived_by = auth.uid(), waived_at = now(),
    note = nullif(left(btrim(p_note), 300), '') where id = p_request_id;
  perform private.write_audit('payment_request.waive', 'payment_requests', p_request_id, e.team_id, e.club_id,
    jsonb_build_object('status', q.status), jsonb_build_object('status', 'waived', 'display_id', q.display_id, 'amount_cents', q.amount_cents));
end;
$$;

create or replace function public.record_offline_payment(p_request_id uuid, p_method text, p_note text default null)
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
  perform private.void_open_payments(array[p_request_id]);
  if q.status <> 'unpaid' then
    raise exception 'request_not_unpaid' using errcode = '23514',
      detail = 'Only an unpaid request can be marked paid offline.';
  end if;
  if p_method not in ('cash', 'check', 'other') then raise exception 'invalid_method' using errcode = '22023'; end if;
  perform private.kick_reconcile();
  insert into public.offline_payments (payment_request_id, method, note, recorded_by)
    values (p_request_id, p_method, nullif(left(btrim(p_note), 300), ''), auth.uid());
  update public.payment_requests set status = 'paid_offline', paid_at = now() where id = p_request_id;
  perform private.write_audit('payment_request.offline_payment', 'payment_requests', p_request_id, e.team_id, e.club_id,
    jsonb_build_object('status', q.status),
    jsonb_build_object('status', 'paid_offline', 'method', p_method, 'display_id', q.display_id, 'amount_cents', q.amount_cents));
end;
$$;

create or replace function public.cancel_payment_event(p_event_id uuid)
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
  perform 1 from public.payment_requests where payment_event_id = p_event_id order by id for update;
  -- Void unconfirmed intents (nothing charged yet). Money in flight ('processing') is left to settle.
  update public.payments set status = 'canceled'
  where status in ('requires_payment_method', 'failed') and id in (
    select i.payment_id from public.payment_items i
    join public.payment_requests q on q.id = i.payment_request_id
    where q.payment_event_id = p_event_id and i.is_active);
  update public.payment_requests set status = 'cancelled'
  where payment_event_id = p_event_id and status in ('unpaid', 'processing')
    and not exists (select 1 from public.payment_items i where i.payment_request_id = payment_requests.id and i.is_active);
  get diagnostics v_cancelled = row_count;
  update public.payment_events set status = 'cancelled', cancelled_at = now() where id = p_event_id;
  perform private.kick_reconcile();
  perform private.write_audit('payment_event.cancel', 'payment_events', p_event_id, e.team_id, e.club_id,
    jsonb_build_object('status', e.status), jsonb_build_object('status', 'cancelled', 'requests_cancelled', v_cancelled));
  return v_cancelled;
end;
$$;

create or replace function public.payment_event_export(p_event_id uuid)
returns table (household_name text, player_name text, display_id text, status text, due_at timestamptz, paid_at timestamptz,
               paid_via text, receipt_display_id text, base_cents integer, athleit_charge_cents integer, service_fee_cents integer,
               total_charged_cents integer, refunded_cents bigint)
language sql stable security definer set search_path = ''
as $$
  select h.name, p.first_name || ' ' || p.last_name, r.display_id, r.status, r.due_at, r.paid_at,
         case when r.status = 'paid_offline' then 'offline' when pay.id is not null then 'card' end,
         pay.receipt_display_id, r.amount_cents,
         case when pay.id is not null then it.platform_fee_cents else 0 end, case when pay.id is not null then it.processing_fee_passthrough_cents else 0 end,
         case when pay.id is not null then r.amount_cents + it.platform_fee_cents + it.processing_fee_passthrough_cents when r.status = 'paid_offline' then r.amount_cents end,
         coalesce((select sum(f.amount_cents) from public.refunds f where f.payment_item_id = it.id and f.status = 'succeeded'), 0)
  from public.payment_requests r
  join public.players p on p.id = r.player_id
  join public.households h on h.id = r.household_id
  left join public.payment_items it on it.payment_request_id = r.id and it.is_active
  left join public.payments pay on pay.id = it.payment_id and pay.status in ('succeeded', 'partially_refunded', 'refunded')
  where r.payment_event_id = p_event_id and private.is_event_staff(p_event_id)
  order by p.last_name, p.first_name, r.display_id;
$$;

create or replace function public.svc_attach_refund(p_refund_id uuid, p_stripe_refund_id text, p_status text default 'pending')
returns void language sql security definer set search_path = ''
as $$
  update public.refunds r set stripe_refund_id = coalesce(r.stripe_refund_id, p_stripe_refund_id),
    status = case when r.status = 'succeeded' then r.status when p_status in ('failed', 'canceled') then p_status else r.status end
  where r.id = p_refund_id
    and (r.stripe_refund_id is not null or not exists (select 1 from public.refunds x where x.stripe_refund_id = p_stripe_refund_id and x.id <> r.id));
$$;

revoke execute on function private.void_open_payments(uuid[]) from public, anon, authenticated;
revoke execute on function public.svc_payment_succeeded(text, uuid, text, integer, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.svc_payment_succeeded(text, uuid, text, integer, integer, text, text, integer) to service_role;
revoke execute on function public.svc_refund_event(text, jsonb, uuid, text), public.svc_attach_refund(uuid, text, text),
  public.svc_finish_event(text, text, boolean), public.svc_reconcile_candidates(interval) from public, anon, authenticated;
grant execute on function public.svc_refund_event(text, jsonb, uuid, text), public.svc_attach_refund(uuid, text, text),
  public.svc_finish_event(text, text, boolean), public.svc_reconcile_candidates(interval) to service_role;
revoke execute on function public.prepare_refund(uuid, uuid, integer, text), public.payment_event_export(uuid),
  public.waive_request(uuid, text), public.record_offline_payment(uuid, text, text), public.cancel_payment_event(uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_refund(uuid, uuid, integer, text), public.payment_event_export(uuid),
  public.waive_request(uuid, text), public.record_offline_payment(uuid, text, text), public.cancel_payment_event(uuid) to authenticated;
