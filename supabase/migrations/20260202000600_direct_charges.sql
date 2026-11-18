-- Phase 4 (B7): DIRECT charges on accounts that pay their own Stripe fees
--
-- Decision (owner): Athleit never pays Stripe's processing fee. The team either pays it (absorb) or the payer does (pass_on).
-- Stripe: destination charges are always billed to the platform, so charges are created DIRECTLY on the connected account
-- (Stripe-Account header) for accounts created with controller.fees.payer = account and controller.losses.payments = stripe.
-- Stripe deducts its actual fee from the connected account's side; application_fee_amount is only the Athleit charge.
--
--   absorb : team nets  total - athleit_charge - ACTUAL Stripe fee  (= base - actual fee)
--   pass_on: payer's gross-up covers the ESTIMATED fee; team nets ~ base (the variance is the team's, as in Part A)
-- Disputes and negative balances sit with the connected account / Stripe, not Athleit.

create or replace function private.compute_checkout_quote(p_uid uuid, p_request_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := p_uid;
  v_ids uuid[];
  v_found integer;
  v_households integer;
  v_accounts integer;
  v_policies integer;
  v_configs integer;
  v_all_guardian boolean;
  v_all_payable boolean;
  v_fee jsonb;
  v_policy text;
  v_cfg jsonb;
  v_account uuid;
  v_household uuid;
  v_charges boolean;
  b record;
  v_ordered record;
  v_weights bigint[];
  v_plat bigint[];
  v_pass bigint[];
  v_lines jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_i integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_request_ids) x where x is not null;
  if v_ids is null or cardinality(v_ids) not between 1 and 25 then
    raise exception 'invalid_request_set' using errcode = '22023';
  end if;

  select count(*), count(distinct r.household_id), count(distinct e.connected_account_id),
         count(distinct e.fee_policy), count(distinct e.fee_config),
         bool_and(exists (select 1 from public.household_members hm where hm.household_id = r.household_id and hm.profile_id = p_uid and hm.relationship = 'guardian')),
         bool_and(r.status = 'unpaid' and e.status = 'published'
                  and not exists (select 1 from public.payment_items i where i.payment_request_id = r.id and i.is_active)),
         min(e.fee_policy), (array_agg(e.fee_config))[1], (array_agg(e.connected_account_id))[1],
         (array_agg(r.household_id))[1]
  into v_found, v_households, v_accounts, v_policies, v_configs, v_all_guardian, v_all_payable,
       v_policy, v_cfg, v_account, v_household
  from public.payment_requests r
  join public.payment_events e on e.id = r.payment_event_id
  where r.id = any (v_ids);

  -- Unknown ids and other families' requests look identical: not_authorized.
  if v_found <> cardinality(v_ids) or not v_all_guardian then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_households > 1 then raise exception 'mixed_household' using errcode = '23514'; end if;
  if v_accounts > 1 or v_policies > 1 or v_configs > 1 then
    raise exception 'mixed_checkout' using errcode = '23514',
      detail = 'Requests with different payees or fee terms must be paid separately.';
  end if;
  if not v_all_payable then raise exception 'request_not_payable' using errcode = '23514'; end if;
  select ca.charges_enabled into v_charges from public.connected_accounts ca where ca.id = v_account;
  if not coalesce(v_charges, false) then raise exception 'account_not_ready' using errcode = '23514'; end if;

  select sum(r.amount_cents) as base, array_agg(r.amount_cents order by r.id) as weights
    into v_ordered from public.payment_requests r where r.id = any (v_ids);
  select * into b from private.fee_breakdown(v_ordered.base, v_policy, v_cfg);
  v_weights := v_ordered.weights;
  v_plat := private.allocate_cents(b.platform_fee_cents, v_weights);
  v_pass := private.allocate_cents(b.processing_fee_cents, v_weights);

  for v_ordered in
    select r.id, r.display_id, r.amount_cents, e.title
    from public.payment_requests r join public.payment_events e on e.id = r.payment_event_id
    where r.id = any (v_ids) order by r.id
  loop
    v_i := v_i + 1;
    v_lines := v_lines || jsonb_build_object('kind', 'item', 'request_id', v_ordered.id,
      'display_id', v_ordered.display_id, 'label', v_ordered.title, 'amount_cents', v_ordered.amount_cents);
    v_items := v_items || jsonb_build_object('request_id', v_ordered.id, 'amount_cents', v_ordered.amount_cents,
      'platform_fee_cents', v_plat[v_i], 'processing_fee_passthrough_cents', v_pass[v_i]);
  end loop;
  if b.platform_fee_cents > 0 then
    v_lines := v_lines || jsonb_build_object('kind', 'athleit_charge', 'label', 'Athleit charge', 'amount_cents', b.platform_fee_cents);
  end if;
  if b.processing_fee_cents > 0 then
    v_lines := v_lines || jsonb_build_object('kind', 'service_fee', 'label', 'Service fee', 'amount_cents', b.processing_fee_cents);
  end if;

  return jsonb_build_object(
    'currency', 'usd', 'fee_policy', v_policy, 'connected_account_id', v_account, 'household_id', v_household,
    'request_set_key', md5(array_to_string(v_ids, ',')),
    'lines', v_lines, 'items', v_items,
    'base_cents', b.base_cents, 'platform_fee_cents', b.platform_fee_cents,
    'processing_fee_cents', b.processing_fee_cents, 'total_cents', b.total_cents,
    'estimated_stripe_fee_cents', b.estimated_stripe_fee_cents, 'estimated_net_cents', b.estimated_net_cents,
    -- Direct charge on an account whose Stripe fees are paid by the account itself (controller.fees.payer = account):
    -- Stripe deducts its fee from the team's side, so the application fee is ONLY the Athleit charge. Athleit never pays Stripe's fee.
    'application_fee_cents', b.platform_fee_cents,
    'description', case when cardinality(v_ids) = 1 then (select e.title || ' · ' || r.display_id from public.payment_requests r join public.payment_events e on e.id = r.payment_event_id where r.id = v_ids[1])
                        else cardinality(v_ids)::text || ' payment requests · ' || (select string_agg(r.display_id, ', ' order by r.display_id) from public.payment_requests r where r.id = any (v_ids)) end,
    'display_ids', (select jsonb_agg(r.display_id order by r.display_id) from public.payment_requests r where r.id = any (v_ids)),
    'stripe_account_id', (select ca.stripe_account_id from public.connected_accounts ca where ca.id = v_account));
end;
$$;

create or replace function public.svc_payment_succeeded(
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
      stripe_fee_cents = coalesce(stripe_fee_cents, p_stripe_fee),
      net_to_account_cents = total_charged_cents - application_fee_cents - coalesce(stripe_fee_cents, p_stripe_fee, estimated_stripe_fee_cents)
    where id = v.id;
    return 'noop';
  end if;
  v_was := v.status;
  update public.payments set status = 'succeeded', succeeded_at = now(),
    stripe_charge_id = coalesce(stripe_charge_id, p_charge), stripe_fee_cents = coalesce(p_stripe_fee, stripe_fee_cents),
    net_to_account_cents = total_charged_cents - application_fee_cents - coalesce(p_stripe_fee, estimated_stripe_fee_cents),
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

create or replace function public.svc_reconcile_candidates_base(p_stale interval default interval '15 minutes')
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    -- Intents that should have moved on by now (processing too long) or were abandoned (no payment method for a day).
    'open_payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'pi', p.stripe_payment_intent_id, 'status', p.status,
        'acct', (select a.stripe_account_id from public.connected_accounts a where a.id = p.connected_account_id), 'abandoned', p.status in ('requires_payment_method', 'failed') and p.updated_at < now() - interval '24 hours'))
      from (select * from public.payments where stripe_payment_intent_id is not null
              and status in ('requires_payment_method', 'processing', 'failed')
              and updated_at < now() - case when status = 'processing' then p_stale else interval '24 hours' end
            order by updated_at limit 100) p), '[]'::jsonb),
    -- Payments canceled here whose intent might still be open at Stripe.
    'canceled_payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'pi', p.stripe_payment_intent_id, 'acct', (select a.stripe_account_id from public.connected_accounts a where a.id = p.connected_account_id)))
      from (select * from public.payments where stripe_payment_intent_id is not null and status = 'canceled'
              and updated_at > now() - interval '7 days' order by updated_at desc limit 100) p), '[]'::jsonb),
    -- Succeeded but the actual Stripe fee / charge id is still unknown.
    'missing_fee', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'pi', p.stripe_payment_intent_id, 'acct', (select a.stripe_account_id from public.connected_accounts a where a.id = p.connected_account_id)))
      from (select * from public.payments where stripe_payment_intent_id is not null
              and status in ('succeeded', 'partially_refunded', 'refunded') and (stripe_fee_cents is null or stripe_charge_id is null)
              and updated_at < now() - interval '2 minutes' order by updated_at limit 100) p), '[]'::jsonb),
    'accounts', coalesce((select jsonb_agg(a.stripe_account_id) from (select stripe_account_id from public.connected_accounts
        where onboarding_status <> 'disconnected' and (onboarding_status <> 'ready' or updated_at < now() - interval '24 hours')
        order by updated_at limit 100) a), '[]'::jsonb),
    -- Webhook events received but never finished (crash mid-handling, or an unknown payment that has since appeared).
    'stuck_events', coalesce((select jsonb_agg(w.stripe_event_id) from (select stripe_event_id from public.stripe_webhook_events
        where processed_at is null and received_at < now() - interval '10 minutes' and attempts < 12
        order by received_at limit 50) w), '[]'::jsonb));
$$;

alter table public.payments alter column application_fee_cents set default 0;
revoke execute on function public.svc_payment_succeeded(text, uuid, text, integer, integer, text, text, integer),
  public.svc_reconcile_candidates_base(interval) from public, anon, authenticated;
grant execute on function public.svc_payment_succeeded(text, uuid, text, integer, integer, text, text, integer),
  public.svc_reconcile_candidates_base(interval) to service_role;
