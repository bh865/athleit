-- Phase 4 (A4): the fee module in SQL (mirrors packages/core/src/fees.ts)
--
-- Rules (integer cents, round half up; see docs/payments.md):
--   athleit_charge = flat + round_half_up(base * bps / 10000)       -- always added on top, paid by the payer
--   absorb:  total = base + athleit_charge                           -- team absorbs Stripe's fee
--   pass_on: total = ceil((base + athleit_charge + stripe_fixed) / (1 - stripe_bps/10000))
--            service_fee = total - base - athleit_charge             -- payer covers Stripe's estimated fee
--   estimated_stripe_fee = round_half_up(total * stripe_bps / 10000) + stripe_fixed
-- The vectors in supabase/tests/database/fn_fee_breakdown.test.sql are also asserted by the
-- TypeScript unit tests, so the two implementations cannot drift.

create function private.fee_breakdown(p_base bigint, p_policy text, p_cfg jsonb)
returns table (base_cents bigint, platform_fee_cents bigint, processing_fee_cents bigint,
               total_cents bigint, estimated_stripe_fee_cents bigint, estimated_net_cents bigint)
language plpgsql immutable set search_path = ''
as $$
declare
  v_flat bigint := (p_cfg ->> 'platform_fee_flat_cents')::bigint;
  v_bps bigint := (p_cfg ->> 'platform_fee_bps')::bigint;
  v_sbps bigint := (p_cfg ->> 'stripe_fee_bps')::bigint;
  v_sfixed bigint := (p_cfg ->> 'stripe_fee_fixed_cents')::bigint;
  v_charge bigint;
  v_total bigint;
  v_est bigint;
begin
  if p_base is null or p_base <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if p_policy not in ('absorb', 'pass_on') then raise exception 'invalid_fee_policy' using errcode = '22023'; end if;
  if v_flat is null or v_bps is null or v_sbps is null or v_sfixed is null
     or v_flat < 0 or v_bps < 0 or v_sbps < 0 or v_sfixed < 0 or v_sbps >= 10000 then
    raise exception 'invalid_fee_config' using errcode = '22023';
  end if;
  v_charge := v_flat + (p_base * v_bps + 5000) / 10000;
  if p_policy = 'absorb' then
    v_total := p_base + v_charge;
  else
    v_total := ((p_base + v_charge + v_sfixed) * 10000 + (10000 - v_sbps) - 1) / (10000 - v_sbps);
  end if;
  v_est := (v_total * v_sbps + 5000) / 10000 + v_sfixed;
  return query select p_base, v_charge, v_total - p_base - v_charge, v_total, v_est, v_total - v_charge - v_est;
end;
$$;

-- Split p_total across weights so the parts sum EXACTLY to p_total (largest remainder; ties go
-- to the lowest index). Used to allocate the fee lines across the requests of one payment.
create function private.allocate_cents(p_total bigint, p_weights bigint[])
returns bigint[] language plpgsql immutable set search_path = ''
as $$
declare
  v_sum bigint;
  v_parts bigint[];
  v_left bigint;
  v_n integer := coalesce(cardinality(p_weights), 0);
  r record;
begin
  if p_total < 0 or v_n = 0 then raise exception 'invalid_allocation' using errcode = '22023'; end if;
  select sum(w) into v_sum from unnest(p_weights) w;
  if v_sum is null or v_sum <= 0 or exists (select 1 from unnest(p_weights) w where w < 0) then
    raise exception 'invalid_allocation' using errcode = '22023';
  end if;
  select array_agg((p_total * w) / v_sum order by i) into v_parts from unnest(p_weights) with ordinality t(w, i);
  select p_total - sum(x) into v_left from unnest(v_parts) x;
  for r in
    select i from unnest(p_weights) with ordinality t(w, i)
    order by (p_total * w) % v_sum desc, i asc
    limit v_left
  loop
    v_parts[r.i] := v_parts[r.i] + 1;
  end loop;
  return v_parts;
end;
$$;

create function private.next_request_display_id()
returns text language sql volatile security definer set search_path = ''
as $$ select 'PR-' || nextval('private.payment_request_display_seq')::text; $$;

create function private.next_receipt_display_id()
returns text language sql volatile security definer set search_path = ''
as $$ select 'RCP-' || nextval('private.payment_receipt_display_seq')::text; $$;

-- Service role (Edge Functions) assigns receipt ids when a payment succeeds.
revoke execute on function private.fee_breakdown(bigint, text, jsonb), private.allocate_cents(bigint, bigint[]),
  private.next_request_display_id(), private.next_receipt_display_id() from public, anon, authenticated;
grant execute on function private.fee_breakdown(bigint, text, jsonb), private.allocate_cents(bigint, bigint[]),
  private.next_receipt_display_id() to service_role;
