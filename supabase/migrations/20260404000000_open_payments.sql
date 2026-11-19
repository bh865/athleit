-- Parents can finish or walk away from a payment they started.
--
-- Opening checkout reserves the chosen requests (they show as "processing") and creates an intent that waits for a
-- card. If the parent closes the dialog before entering one, nothing is charged, but the requests stayed reserved until
-- the 24-hour reconcile sweep. These two functions let the family see such unfinished payments and cancel them.
--
--   household_open_payments  unfinished payments (no card confirmed yet) for the caller's household
--   cancel_open_payment      cancels one and frees its requests; the Stripe intent is voided by reconcile-payments,
--                            and a late success for it would still apply (svc_payment_succeeded converges).

create function public.household_open_payments()
returns table (payment_id uuid, status text, total_cents integer, updated_at timestamptz, request_ids uuid[])
language sql stable security definer set search_path = ''
as $$
  select p.id, p.status, p.total_charged_cents, p.updated_at,
         array(select i.payment_request_id from public.payment_items i
               where i.payment_id = p.id and i.is_active order by i.payment_request_id)
  from public.payments p
  where p.status in ('requires_payment_method', 'failed')
    and (select auth.uid()) is not null
    and exists (select 1 from public.household_members hm
                where hm.household_id = p.household_id and hm.profile_id = (select auth.uid()) and hm.relationship = 'guardian')
  order by p.updated_at desc;
$$;

create function public.cancel_open_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v public.payments;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v from public.payments where id = p_payment_id for update;
  if not found or not exists (
      select 1 from public.household_members hm
      where hm.household_id = v.household_id and hm.profile_id = (select auth.uid()) and hm.relationship = 'guardian') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  -- Only payments where no card has been confirmed. Money in flight or already taken is never touched here.
  if v.status not in ('requires_payment_method', 'failed') then
    raise exception 'payment_not_open' using errcode = '23514';
  end if;
  update public.payments set status = 'canceled' where id = v.id;
  update public.payment_requests set status = 'unpaid'
  where status = 'processing' and id in (select payment_request_id from public.payment_items where payment_id = v.id);
  perform private.write_audit('payment.cancel_open', 'payments', v.id, null, null,
    jsonb_build_object('status', v.status), jsonb_build_object('status', 'canceled'));
end;
$$;

revoke execute on function public.household_open_payments(), public.cancel_open_payment(uuid) from public, anon, authenticated;
grant execute on function public.household_open_payments(), public.cancel_open_payment(uuid) to authenticated;
