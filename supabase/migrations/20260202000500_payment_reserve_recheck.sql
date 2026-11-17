-- Phase 4 (B6): a reused reservation re-checks payability (review finding 1)
--
-- Follow-up to B5: the reuse branch of svc_reserve_payment returned an open payment without re-checking that its requests
-- are still payable, the event still published and the account still able to take charges.

create or replace function public.svc_reserve_payment(p_uid uuid, p_request_ids uuid[])
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
  v_key text;
  v_pay public.payments;
  q jsonb;
  v_acct uuid;
begin
  select array_agg(distinct x order by x) into v_ids from unnest(p_request_ids) x where x is not null;
  if v_ids is null or cardinality(v_ids) not between 1 and 25 then raise exception 'invalid_request_set' using errcode = '22023'; end if;
  perform 1 from public.payment_requests where id = any (v_ids) order by id for update;
  if (select count(*) from public.payment_requests r
      join public.household_members hm on hm.household_id = r.household_id and hm.profile_id = p_uid and hm.relationship = 'guardian'
      where r.id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_key := md5(array_to_string(v_ids, ','));
  select * into v_pay from public.payments
    where request_set_key = v_key and status in ('requires_payment_method', 'processing', 'failed')
    order by created_at desc limit 1;
  if found then
    -- A reused payment must still be payable NOW (not waived / paid offline / cancelled since, account still enabled).
    if exists (select 1 from public.payment_items i join public.payment_requests r on r.id = i.payment_request_id
               join public.payment_events e on e.id = r.payment_event_id
               where i.payment_id = v_pay.id and (r.status not in ('unpaid', 'processing') or e.status <> 'published'))
       or not coalesce((select charges_enabled from public.connected_accounts where id = v_pay.connected_account_id), false) then
      raise exception 'request_not_payable' using errcode = '23514';
    end if;
    return jsonb_build_object('reused', true, 'payment_id', v_pay.id, 'stripe_payment_intent_id', v_pay.stripe_payment_intent_id,
      'status', v_pay.status, 'total_cents', v_pay.total_charged_cents, 'application_fee_cents', v_pay.application_fee_cents,
      'currency', 'usd', 'request_set_key', v_key,
      'display_ids', (select jsonb_agg(r.display_id order by r.display_id) from public.payment_items i
                      join public.payment_requests r on r.id = i.payment_request_id where i.payment_id = v_pay.id),
      'description', (select case when count(*) = 1 then max(e.title) || ' · ' || max(r.display_id)
                                  else count(*)::text || ' payment requests · ' || string_agg(r.display_id, ', ' order by r.display_id) end
                      from public.payment_items i join public.payment_requests r on r.id = i.payment_request_id
                      join public.payment_events e on e.id = r.payment_event_id where i.payment_id = v_pay.id),
      'stripe_account_id', (select stripe_account_id from public.connected_accounts where id = v_pay.connected_account_id));
  end if;
  q := private.compute_checkout_quote(p_uid, v_ids);
  v_acct := (q ->> 'connected_account_id')::uuid;
  insert into public.payments (connected_account_id, household_id, payer_profile_id, fee_policy, base_cents, platform_fee_cents,
      processing_fee_passthrough_cents, total_charged_cents, application_fee_cents, estimated_stripe_fee_cents, request_set_key)
  values (v_acct, (q ->> 'household_id')::uuid, p_uid, q ->> 'fee_policy', (q ->> 'base_cents')::int, (q ->> 'platform_fee_cents')::int,
      (q ->> 'processing_fee_cents')::int, (q ->> 'total_cents')::int, (q ->> 'application_fee_cents')::int,
      (q ->> 'estimated_stripe_fee_cents')::int, v_key)
  returning * into v_pay;
  insert into public.payment_items (payment_id, payment_request_id, amount_cents, platform_fee_cents, processing_fee_passthrough_cents)
  select v_pay.id, (i ->> 'request_id')::uuid, (i ->> 'amount_cents')::int, (i ->> 'platform_fee_cents')::int,
         (i ->> 'processing_fee_passthrough_cents')::int
  from jsonb_array_elements(q -> 'items') i;
  update public.payment_requests set status = 'processing' where id = any (v_ids) and status = 'unpaid';
  return jsonb_build_object('reused', false, 'payment_id', v_pay.id, 'stripe_payment_intent_id', null, 'status', v_pay.status,
    'total_cents', v_pay.total_charged_cents, 'application_fee_cents', v_pay.application_fee_cents, 'currency', 'usd',
    'description', q ->> 'description', 'display_ids', q -> 'display_ids', 'request_set_key', v_key,
    'stripe_account_id', q ->> 'stripe_account_id');
end;
$$;

revoke execute on function public.svc_reserve_payment(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.svc_reserve_payment(uuid, uuid[]) to service_role;
