-- Split payments, step 2c: money operations on installments.
--  * Disputes are tracked per PAYMENT (payments.disputed) as well as on the request: a dispute blocks refunds of that payment only,
--    pauses autopay for the household (the scheduler already skips a household with a disputed request) and tells the family; it never
--    cancels the plan.
--  * Refunds settle installments: a refunded installment moves to (partially_)refunded and the request status follows by roll-up.
--  * prepare_request_refund allocates a refund smaller than the total paid to the most recently paid installment first, then backwards.
--  * svc_repair_installments frees installments left processing with no live payment (reconcile calls it).
--  * payment_event_installment_export: one row per installment, with plan context.

alter table public.payments add column disputed boolean not null default false;
update public.payments p set disputed = true where exists (
  select 1 from public.payment_items i join public.payment_requests q on q.id = i.payment_request_id where i.payment_id = p.id and q.disputed);

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
  -- A dispute blocks refunds of THAT payment only. For a whole-request payment the request flag is the same thing; an
  -- installment payment is judged by its own payment flag, so a dispute on installment 1 never blocks refunding installment 2.
  if v.disputed or exists (select 1 from public.payment_items i join public.payment_requests q on q.id = i.payment_request_id
             where i.payment_id = v.id and i.installment_id is null and q.disputed) then
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
  for it in select i.id, i.amount_cents, i.payment_request_id, i.installment_id from public.payment_items i where i.payment_id = v.id and i.is_active loop
    select coalesce(sum(base_cents), 0) into v_item_refunded from public.refunds
      where payment_item_id = it.id and status = 'succeeded';
    if v_refunded >= v.total_charged_cents then v_item_refunded := it.amount_cents; end if;
    if it.installment_id is not null then
      -- An installment item: the installment moves, and the request status follows by roll-up.
      if v_item_refunded >= it.amount_cents then
        update public.payment_request_installments set status = 'refunded' where id = it.installment_id and status in ('paid', 'partially_refunded');
      elsif v_item_refunded > 0 or v_payment_level > 0 then
        update public.payment_request_installments set status = 'partially_refunded' where id = it.installment_id and status = 'paid';
      end if;
      if v_item_refunded < it.amount_cents then v_all_full := false; end if;
    elsif v_item_refunded >= it.amount_cents then
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
create or replace function public.svc_dispute_event(
  p_pi text, p_dispute_id text, p_phase text, p_outcome text default null, p_payment_id uuid default null, p_charge text default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v public.payments;
  v_issuer record;
begin
  v := private.lock_payment(p_pi, p_payment_id);
  if v.id is null then return 'unknown_payment'; end if;
  select * into v_issuer from private.payment_issuer(v.id);
  if p_phase = 'created' then
    update public.payments set disputed = true where id = v.id;
    update public.payment_requests set disputed = true
      where id in (select payment_request_id from public.payment_items where payment_id = v.id);
    -- A plan on autopay is paused for the whole household until staff resolve the dispute (the scheduler skips it).
    if exists (select 1 from public.payment_items pi join public.payment_requests q on q.id = pi.payment_request_id
               where pi.payment_id = v.id and q.autopay) then
      perform private.notify_payment(v.household_id, 'autopay_paused', coalesce(v_issuer.title, 'Payment'),
        'Automatic payments are paused while a payment is reviewed. You can still pay installments yourself.',
        jsonb_build_object('payment_id', v.id, 'payment_event_id', v_issuer.event_id), 'pay:dsp-pause:' || p_dispute_id);
    end if;
    insert into public.audit_log (action, target_type, target_id, team_id, club_id, after)
      values ('payment.dispute_opened', 'payments', v.id, v_issuer.team_id, v_issuer.club_id,
              jsonb_build_object('dispute_id', p_dispute_id));
    perform private.notify_issuer_admins(v_issuer.team_id, v_issuer.club_id, 'dispute_opened', coalesce(v_issuer.title, 'Payment'),
      'A payment was disputed. Open Payments to review it.',
      jsonb_build_object('payment_id', v.id, 'payment_event_id', v_issuer.event_id), 'pay:dsp:' || p_dispute_id);
  elsif p_phase = 'closed' then
    if p_outcome = 'won' then
      update public.payments set disputed = false where id = v.id;
      -- A request stays flagged while any OTHER of its payments is still disputed.
      update public.payment_requests q set disputed = false
        where q.id in (select payment_request_id from public.payment_items where payment_id = v.id)
          and not exists (select 1 from public.payment_items pi2 join public.payments p2 on p2.id = pi2.payment_id
                          where pi2.payment_request_id = q.id and p2.id <> v.id and p2.disputed);
    end if;
    insert into public.audit_log (action, target_type, target_id, team_id, club_id, after)
      values ('payment.dispute_closed', 'payments', v.id, v_issuer.team_id, v_issuer.club_id,
              jsonb_build_object('dispute_id', p_dispute_id, 'outcome', p_outcome));
  else
    raise exception 'invalid_phase' using errcode = '22023';
  end if;
  return 'applied';
end;
$$;
-- Refund an amount against a plan request: newest paid installment first. Returns one prepare_refund result per payment touched.
create function public.prepare_request_refund(p_request_id uuid, p_base_cents integer default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  r public.payment_requests;
  e public.payment_events;
  it record;
  v_left integer;
  v_cap integer;
  v_take integer;
  v_out jsonb := '[]'::jsonb;
begin
  select * into r from public.payment_requests where id = p_request_id;
  select * into e from public.payment_events where id = r.payment_event_id;
  if not found or not private.is_issuer_admin(e.team_id, e.club_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if r.plan_count is null then raise exception 'not_a_plan' using errcode = '23514'; end if;
  if p_base_cents is not null and p_base_cents <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  v_left := coalesce(p_base_cents, 2147483647);
  for it in
    select pi.id as item_id, pi.payment_id, pi.amount_cents,
           pi.amount_cents - coalesce((select sum(f.base_cents) from public.refunds f where f.payment_item_id = pi.id and f.status in ('pending', 'succeeded')), 0) as cap
      from public.payment_items pi
      join public.payments p on p.id = pi.payment_id and p.status in ('succeeded', 'partially_refunded')
      join public.payment_request_installments i on i.id = pi.installment_id
     where pi.payment_request_id = r.id and pi.is_active
     order by p.succeeded_at desc, i.sequence desc
  loop
    exit when v_left <= 0;
    v_cap := it.cap;
    continue when v_cap <= 0;
    v_take := least(v_cap, v_left);
    v_out := v_out || public.prepare_refund(it.payment_id, it.item_id, v_take, p_reason);
    v_left := v_left - v_take;
  end loop;
  if p_base_cents is not null and v_left > 0 then raise exception 'refund_exceeds_payment' using errcode = '23514'; end if;
  if jsonb_array_length(v_out) = 0 then raise exception 'nothing_to_refund' using errcode = '23514'; end if;
  return v_out;
end;
$$;

-- An installment left 'processing' with no live payment (a crashed reservation) goes back to open.
create function public.svc_repair_installments(p_older_than interval default interval '30 minutes')
returns integer language plpgsql security definer set search_path = ''
as $$
declare v integer;
begin
  with u as (
    update public.payment_request_installments i
       set status = case when i.due_at <= now() then 'due' else 'scheduled' end
     where i.status = 'processing' and i.updated_at < now() - p_older_than
       and not exists (select 1 from public.payment_items pi join public.payments p on p.id = pi.payment_id
                       where pi.installment_id = i.id and pi.is_active and p.status in ('requires_payment_method', 'processing', 'failed'))
    returning 1)
  select count(*) into v from u;
  return v;
end;
$$;

-- One row per installment (or per request when it has no plan), formula-safe cells are applied by the CSV writer.
create function public.payment_event_installment_export(p_event_id uuid)
returns table (household_name text, player_name text, display_id text, installment_number integer, installment_count integer,
               status text, due_at timestamptz, paid_at timestamptz, paid_via text, receipt_display_id text, base_cents integer,
               athleit_charge_cents integer, service_fee_cents integer, total_charged_cents integer, refunded_cents bigint)
language sql stable security definer set search_path = ''
as $$
  select h.name, p.first_name || ' ' || p.last_name, r.display_id, i.sequence::int, r.plan_count::int,
         coalesce(i.status, r.status), coalesce(i.due_at, r.due_at), coalesce(i.paid_at, r.paid_at),
         case when coalesce(i.status, r.status) in ('paid_offline') then 'offline' when pay.id is not null then 'card' end,
         pay.receipt_display_id, coalesce(i.amount_cents, r.amount_cents),
         case when pay.id is not null then it.platform_fee_cents else 0 end,
         case when pay.id is not null then it.processing_fee_passthrough_cents else 0 end,
         case when pay.id is not null then it.amount_cents + it.platform_fee_cents + it.processing_fee_passthrough_cents
              when coalesce(i.status, r.status) = 'paid_offline' then coalesce(i.amount_cents, r.amount_cents) end,
         coalesce((select sum(f.amount_cents) from public.refunds f where f.payment_item_id = it.id and f.status = 'succeeded'), 0)
  from public.payment_requests r
  join public.players p on p.id = r.player_id
  join public.households h on h.id = r.household_id
  left join public.payment_request_installments i on i.request_id = r.id
  left join public.payment_items it on it.is_active and ((i.id is not null and it.installment_id = i.id) or (i.id is null and it.payment_request_id = r.id and it.installment_id is null))
  left join public.payments pay on pay.id = it.payment_id and pay.status in ('succeeded', 'partially_refunded', 'refunded')
  where r.payment_event_id = p_event_id and private.is_event_staff(p_event_id)
  order by p.last_name, p.first_name, r.display_id, i.sequence;
$$;

revoke execute on function public.prepare_request_refund(uuid, integer, text), public.payment_event_installment_export(uuid),
  public.svc_repair_installments(interval), public.svc_refund_event(text, jsonb, uuid, text),
  public.svc_dispute_event(text, text, text, text, uuid, text), public.prepare_refund(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.prepare_request_refund(uuid, integer, text), public.payment_event_installment_export(uuid),
  public.prepare_refund(uuid, uuid, integer, text) to authenticated;
grant execute on function public.svc_repair_installments(interval), public.svc_refund_event(text, jsonb, uuid, text),
  public.svc_dispute_event(text, text, text, text, uuid, text) to service_role;
