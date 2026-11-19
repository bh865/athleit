-- Regression fix: the request guard rewritten for payment plans (20260406 onwards) lost the registration_id immutability that
-- 20260302000100 added ("a registration's payment request cannot be re-pointed"). Caught by registration_payments.test.sql.
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
revoke execute on function private.guard_payment_request() from public, anon, authenticated;
