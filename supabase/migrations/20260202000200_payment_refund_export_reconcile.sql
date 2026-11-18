-- Phase 4 (B3): refunds, CSV export rows, reconcile candidates and cron
--
--  * public.prepare_refund(...)   staff admin (issuer admin) reserves refund rows, returns what to send to Stripe.
--                                 Amounts follow the refund policy flags frozen in the event's fee snapshot.
--  * svc_attach_refund / svc_fail_refund   the refund-payment Edge Function records Stripe's answer.
--  * public.payment_event_export(...)       one row per request for the staff CSV (no card data).
--  * svc_reconcile_candidates    what reconcile-payments should re-check at Stripe.
--  * private.kick_reconcile + cron   every 10 minutes, no-op until the Vault secrets exist.

-- Refund policy (docs/payments.md): a refund always returns the BASE amount. The Athleit charge and the pass-through
-- service fee come back only when the event's snapshot says so (full refund of the item / partial refund, pro rata).
-- Stripe does not return its own processing fee in either case.
create function public.prepare_refund(
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
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
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
    where i.payment_id = v.id and i.is_active and (p_item_id is null or i.id = p_item_id) order by q.display_id
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

create function public.svc_attach_refund(p_refund_id uuid, p_stripe_refund_id text, p_status text default 'pending')
returns void language sql security definer set search_path = ''
as $$
  update public.refunds set stripe_refund_id = coalesce(stripe_refund_id, p_stripe_refund_id),
    status = case when status = 'succeeded' then status when p_status in ('failed', 'canceled') then p_status else status end
  where id = p_refund_id;
$$;

create function public.svc_fail_refund(p_refund_id uuid)
returns void language sql security definer set search_path = ''
as $$
  update public.refunds set status = 'failed' where id = p_refund_id and stripe_refund_id is null and status = 'pending';
$$;

create function public.payment_event_export(p_event_id uuid)
returns table (household_name text, player_name text, display_id text, status text, due_at timestamptz, paid_at timestamptz,
               paid_via text, receipt_display_id text, base_cents integer, athleit_charge_cents integer, service_fee_cents integer,
               total_charged_cents integer, refunded_cents bigint)
language sql stable security definer set search_path = ''
as $$
  select h.name, p.first_name || ' ' || p.last_name, r.display_id, r.status, r.due_at, r.paid_at,
         case when r.status = 'paid_offline' then 'offline' when it.id is not null then 'card' end,
         pay.receipt_display_id, r.amount_cents,
         coalesce(it.platform_fee_cents, 0), coalesce(it.processing_fee_passthrough_cents, 0),
         coalesce(r.amount_cents + it.platform_fee_cents + it.processing_fee_passthrough_cents, case when r.status = 'paid_offline' then r.amount_cents end),
         coalesce((select sum(f.amount_cents) from public.refunds f where f.payment_item_id = it.id and f.status = 'succeeded'), 0)
  from public.payment_requests r
  join public.players p on p.id = r.player_id
  join public.households h on h.id = r.household_id
  left join public.payment_items it on it.payment_request_id = r.id and it.is_active
  left join public.payments pay on pay.id = it.payment_id and pay.status in ('succeeded', 'partially_refunded', 'refunded')
  where r.payment_event_id = p_event_id and private.is_event_staff(p_event_id)
  order by p.last_name, p.first_name, r.display_id;
$$;

-- What reconcile-payments should re-check at Stripe. All lists are bounded.
create function public.svc_reconcile_candidates(p_stale interval default interval '15 minutes')
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    -- Intents that should have moved on by now (processing too long) or were abandoned (no payment method for a day).
    'open_payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'pi', p.stripe_payment_intent_id, 'status', p.status,
        'abandoned', p.status in ('requires_payment_method', 'failed') and p.updated_at < now() - interval '24 hours'))
      from (select * from public.payments where stripe_payment_intent_id is not null
              and status in ('requires_payment_method', 'processing', 'failed')
              and updated_at < now() - case when status = 'processing' then p_stale else interval '24 hours' end
            order by updated_at limit 100) p), '[]'::jsonb),
    -- Payments canceled here whose intent might still be open at Stripe.
    'canceled_payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'pi', p.stripe_payment_intent_id))
      from (select * from public.payments where stripe_payment_intent_id is not null and status = 'canceled'
              and updated_at > now() - interval '7 days' order by updated_at desc limit 100) p), '[]'::jsonb),
    -- Succeeded but the actual Stripe fee / charge id is still unknown.
    'missing_fee', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'pi', p.stripe_payment_intent_id))
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

create function public.svc_cleanup_rate_limits()
returns integer language sql security definer set search_path = ''
as $$
  with d as (delete from public.api_rate_limits where window_start < now() - interval '1 day' returning 1) select count(*)::int from d;
$$;

create function private.kick_reconcile()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'reconcile_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'reconcile_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-reconcile-secret', v_secret),
    body := '{}'::jsonb, timeout_milliseconds := 5000);
exception when others then
  null;
end;
$$;
select cron.schedule('payments-reconcile', '*/10 * * * *', 'select private.kick_reconcile()');

revoke execute on function private.kick_reconcile() from public, anon, authenticated;
revoke execute on function public.prepare_refund(uuid, uuid, integer, text), public.payment_event_export(uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_refund(uuid, uuid, integer, text), public.payment_event_export(uuid) to authenticated;
revoke execute on function public.svc_attach_refund(uuid, text, text), public.svc_fail_refund(uuid),
  public.svc_reconcile_candidates(interval), public.svc_cleanup_rate_limits() from public, anon, authenticated;
grant execute on function public.svc_attach_refund(uuid, text, text), public.svc_fail_refund(uuid),
  public.svc_reconcile_candidates(interval), public.svc_cleanup_rate_limits() to service_role;
