-- Phase 4 (B2): idempotent webhook / reconcile handlers (service role only)
--
-- Every handler may be called any number of times, in any order, and converges on the same state:
--   svc_payment_succeeded, svc_payment_status (processing | failed | canceled), svc_refund_event,
--   svc_dispute_event, svc_set_account_status.
-- Notifications go through the outbox (category 'payments') with dedupe keys, so a replay sends nothing twice.

-- Admins of the issuer (team admins, or club admins for a club event).
create function private.notify_issuer_admins(
  p_team_id uuid, p_club_id uuid, p_kind text, p_title text, p_body text, p_payload jsonb, p_dedupe_base text)
returns void language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  for r in
    select tm.profile_id from public.team_memberships tm
      where p_team_id is not null and tm.team_id = p_team_id and tm.role = 'admin' and tm.status = 'active'
    union
    select cm.profile_id from public.club_memberships cm
      where p_club_id is not null and cm.club_id = p_club_id and cm.role = 'admin' and cm.status = 'active'
  loop
    perform private.enqueue_notification(r.profile_id, 'payments',
      p_payload || jsonb_build_object('kind', 'payment', 'change', p_kind, 'title', left(p_title, 100), 'body', p_body,
                                      'team_id', p_team_id, 'club_id', p_club_id, 'audience', 'staff'),
      p_dedupe_base || ':' || r.profile_id);
  end loop;
end;
$$;

-- Issuer of a payment (its first item's event; every item of a payment belongs to one household).
create function private.payment_issuer(p_payment_id uuid)
returns table (event_id uuid, team_id uuid, club_id uuid, title text)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.team_id, e.club_id, e.title
  from public.payment_items i
  join public.payment_requests r on r.id = i.payment_request_id
  join public.payment_events e on e.id = r.payment_event_id
  where i.payment_id = p_payment_id
  order by r.display_id limit 1;
$$;

create function public.svc_payment_succeeded(
  p_pi text, p_payment_id uuid default null, p_charge text default null, p_stripe_fee integer default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v public.payments;
  v_issuer record;
  v_was text;
  r record;
begin
  v := private.lock_payment(p_pi, p_payment_id);
  if v.id is null then return 'unknown_payment'; end if;
  if v.status in ('succeeded', 'partially_refunded', 'refunded') then
    -- Already applied: only fill in what was unknown (charge id, actual fee).
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

  update public.payment_requests set status = 'paid', paid_at = now()
  where status in ('unpaid', 'processing') and id in (select payment_request_id from public.payment_items where payment_id = v.id);
  -- Money arrived for a request that was cancelled in the meantime (or whose payment we had already
  -- canceled): keep the facts, flag it for a staff refund.
  for r in
    select q.id, q.display_id from public.payment_requests q
    join public.payment_items i on i.payment_request_id = q.id
    where i.payment_id = v.id and q.status in ('cancelled', 'waived')
  loop
    insert into public.audit_log (action, target_type, target_id, after)
    values ('payment.succeeded_on_closed_request', 'payment_requests', r.id,
            jsonb_build_object('payment_id', v.id, 'display_id', r.display_id, 'previous_payment_status', v_was));
  end loop;

  select * into v_issuer from private.payment_issuer(v.id);
  perform private.notify_payment(v.household_id, 'receipt', coalesce(v_issuer.title, 'Payment'),
    format('Paid %s · receipt %s', private.money_text(v.total_charged_cents), v.receipt_display_id),
    jsonb_build_object('payment_id', v.id, 'payment_event_id', v_issuer.event_id), 'pay:rcp:' || v.id);
  perform private.notify_issuer_admins(v_issuer.team_id, v_issuer.club_id, 'payment_received', coalesce(v_issuer.title, 'Payment'),
    format('%s received', private.money_text(v.base_cents)),
    jsonb_build_object('payment_id', v.id, 'payment_event_id', v_issuer.event_id), 'pay:got:' || v.id);
  return 'applied';
end;
$$;

-- p_status: processing | failed | canceled. Only moves forward; late or repeated events are no-ops.
create function public.svc_payment_status(p_pi text, p_status text, p_payment_id uuid default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare v public.payments;
begin
  if p_status not in ('processing', 'failed', 'canceled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  v := private.lock_payment(p_pi, p_payment_id);
  if v.id is null then return 'unknown_payment'; end if;

  if p_status = 'processing' then
    if v.status not in ('requires_payment_method', 'failed') then return 'noop'; end if;
    update public.payments set status = 'processing' where id = v.id;
    update public.payment_requests set status = 'processing'
      where status = 'unpaid' and id in (select payment_request_id from public.payment_items where payment_id = v.id and is_active);
    return 'applied';
  elsif p_status = 'failed' then
    if v.status not in ('requires_payment_method', 'processing') then return 'noop'; end if;
    -- The intent stays usable for a retry with another card; the requests show unpaid again meanwhile.
    update public.payments set status = 'failed' where id = v.id;
    update public.payment_requests set status = 'unpaid'
      where status = 'processing' and id in (select payment_request_id from public.payment_items where payment_id = v.id);
    return 'applied';
  else
    if v.status not in ('requires_payment_method', 'processing', 'failed') then return 'noop'; end if;
    update public.payments set status = 'canceled' where id = v.id;
    update public.payment_requests q set status = case when e.status = 'cancelled' then 'cancelled' else 'unpaid' end
      from public.payment_events e
      where e.id = q.payment_event_id and q.status = 'processing'
        and q.id in (select payment_request_id from public.payment_items where payment_id = v.id);
    update public.payment_requests q set status = 'cancelled'
      from public.payment_events e
      where e.id = q.payment_event_id and q.status = 'unpaid' and e.status = 'cancelled'
        and q.id in (select payment_request_id from public.payment_items where payment_id = v.id);
    return 'applied';
  end if;
end;
$$;

-- p_refunds: [{id, amount, status}] as Stripe reports them on the charge. Idempotent: refund rows are keyed by
-- stripe_refund_id; payment and request statuses are recomputed from the refund rows each time.
create function public.svc_refund_event(p_pi text, p_refunds jsonb, p_payment_id uuid default null, p_charge text default null)
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
    select status into v_old from public.refunds where stripe_refund_id = f ->> 'id' for update;
    if not found then
      -- Refund created outside Athleit (Stripe Dashboard): record it at payment level.
      insert into public.refunds (payment_id, stripe_refund_id, amount_cents, reason, status)
      values (v.id, f ->> 'id', (f ->> 'amount')::int, 'Issued in Stripe', v_status);
      v_old := null;
    elsif v_old is distinct from 'succeeded' then
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

-- p_phase: created | closed; p_outcome (closed): won | lost | other.
create function public.svc_dispute_event(
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
    update public.payment_requests set disputed = true
      where id in (select payment_request_id from public.payment_items where payment_id = v.id);
    insert into public.audit_log (action, target_type, target_id, team_id, club_id, after)
      values ('payment.dispute_opened', 'payments', v.id, v_issuer.team_id, v_issuer.club_id,
              jsonb_build_object('dispute_id', p_dispute_id));
    perform private.notify_issuer_admins(v_issuer.team_id, v_issuer.club_id, 'dispute_opened', coalesce(v_issuer.title, 'Payment'),
      'A payment was disputed. Open Payments to review it.',
      jsonb_build_object('payment_id', v.id, 'payment_event_id', v_issuer.event_id), 'pay:dsp:' || p_dispute_id);
  elsif p_phase = 'closed' then
    if p_outcome = 'won' then
      update public.payment_requests set disputed = false
        where id in (select payment_request_id from public.payment_items where payment_id = v.id);
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

-- Mirror a connected account's status from Stripe (account.updated, deauthorization, reconcile).
create function public.svc_set_account_status(
  p_stripe_account_id text, p_details_submitted boolean, p_charges_enabled boolean, p_payouts_enabled boolean,
  p_requirements jsonb default '{}', p_deauthorized boolean default false)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  a public.connected_accounts;
  v_status text;
  v_due boolean;
  v_req jsonb;
begin
  select * into a from public.connected_accounts where stripe_account_id = p_stripe_account_id for update;
  if not found then return 'unknown_account'; end if;
  v_req := jsonb_strip_nulls(jsonb_build_object(
    'currently_due', coalesce(p_requirements -> 'currently_due', '[]'::jsonb),
    'past_due', coalesce(p_requirements -> 'past_due', '[]'::jsonb),
    'eventually_due', coalesce(p_requirements -> 'eventually_due', '[]'::jsonb),
    'disabled_reason', p_requirements -> 'disabled_reason'));
  v_due := jsonb_array_length(v_req -> 'currently_due') > 0 or jsonb_array_length(v_req -> 'past_due') > 0;
  v_status := case
    when p_deauthorized then 'disconnected'
    when p_charges_enabled and p_details_submitted and not v_due then 'ready'
    when v_due then 'needs_info'
    when p_details_submitted then 'in_review'
    else 'not_started' end;
  update public.connected_accounts set details_submitted = p_details_submitted,
    charges_enabled = p_charges_enabled and not p_deauthorized, payouts_enabled = p_payouts_enabled and not p_deauthorized,
    requirements = v_req, onboarding_status = v_status where id = a.id;
  if v_status in ('needs_info', 'disconnected') and a.onboarding_status is distinct from v_status then
    perform private.notify_issuer_admins(a.team_id, a.club_id, 'onboarding_action', 'Payout setup',
      case when v_status = 'needs_info' then 'Stripe needs more information before you can collect payments.'
           else 'Your Stripe account was disconnected.' end,
      jsonb_build_object('onboarding_status', v_status), 'pay:acct:' || a.id || ':' || v_status || ':' || to_char(now() at time zone 'UTC', 'YYYYMMDD'));
  end if;
  return 'applied';
end;
$$;

revoke execute on function private.notify_issuer_admins(uuid, uuid, text, text, text, jsonb, text), private.payment_issuer(uuid)
  from public, anon, authenticated;
revoke execute on function public.svc_payment_succeeded(text, uuid, text, integer), public.svc_payment_status(text, text, uuid),
  public.svc_refund_event(text, jsonb, uuid, text), public.svc_dispute_event(text, text, text, text, uuid, text),
  public.svc_set_account_status(text, boolean, boolean, boolean, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.svc_payment_succeeded(text, uuid, text, integer), public.svc_payment_status(text, text, uuid),
  public.svc_refund_event(text, jsonb, uuid, text), public.svc_dispute_event(text, text, text, text, uuid, text),
  public.svc_set_account_status(text, boolean, boolean, boolean, jsonb, boolean) to service_role;
