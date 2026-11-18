-- private.fee_breakdown / private.allocate_cents
-- The vector rows below are the SINGLE source of truth for the fee rules: this file asserts the SQL
-- implementation, and packages/core/src/fees.test.ts parses the same rows and asserts the TypeScript
-- implementation. Expected values were derived independently (exact rational arithmetic).
-- Columns: base, policy, athleit_flat, athleit_bps, stripe_bps, stripe_fixed, charge, service_fee, total, est_stripe_fee, est_net
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create temp table vec as select * from (values
-- @vectors-begin
  (4500, 'absorb', 0, 0, 290, 30, 0, 0, 4500, 161, 4339),
  (4500, 'absorb', 100, 0, 290, 30, 100, 0, 4600, 163, 4337),
  (4500, 'absorb', 0, 100, 290, 30, 45, 0, 4545, 162, 4338),
  (4500, 'absorb', 50, 100, 290, 30, 95, 0, 4595, 163, 4337),
  (4500, 'pass_on', 0, 0, 290, 30, 0, 166, 4666, 165, 4501),
  (4500, 'pass_on', 100, 0, 290, 30, 100, 169, 4769, 168, 4501),
  (4500, 'pass_on', 0, 100, 290, 30, 45, 167, 4712, 167, 4500),
  (4500, 'pass_on', 50, 100, 290, 30, 95, 169, 4764, 168, 4501),
  (50, 'absorb', 0, 0, 290, 30, 0, 0, 50, 31, 19),
  (50, 'pass_on', 0, 0, 290, 30, 0, 33, 83, 32, 51),
  (51, 'pass_on', 25, 50, 290, 30, 25, 34, 110, 33, 52),
  (99, 'pass_on', 0, 150, 290, 30, 1, 34, 134, 34, 99),
  (5000000, 'absorb', 50, 100, 290, 30, 50050, 0, 5050050, 146481, 4853519),
  (5000000, 'pass_on', 50, 100, 290, 30, 50050, 150857, 5200907, 150856, 5000001),
  (12345, 'pass_on', 0, 0, 0, 0, 0, 0, 12345, 0, 12345),
  (12345, 'pass_on', 75, 125, 350, 0, 229, 457, 13031, 456, 12346),
  (2500, 'pass_on', 0, 0, 290, 0, 0, 75, 2575, 75, 2500),
  (333, 'absorb', 0, 250, 290, 30, 8, 0, 341, 40, 293),
  (9999, 'pass_on', 199, 2000, 1000, 100, 2199, 1467, 13665, 1467, 9999)
-- @vectors-end
) v (base, pol, flat, bps, sbps, sfix, e_charge, e_svc, e_total, e_est, e_net);

select is_empty($$
  select v.* from vec v, lateral private.fee_breakdown(v.base, v.pol, jsonb_build_object(
    'platform_fee_flat_cents', v.flat, 'platform_fee_bps', v.bps, 'stripe_fee_bps', v.sbps, 'stripe_fee_fixed_cents', v.sfix)) f
  where (f.platform_fee_cents, f.processing_fee_cents, f.total_cents, f.estimated_stripe_fee_cents, f.estimated_net_cents)
        is distinct from (v.e_charge, v.e_svc, v.e_total, v.e_est, v.e_net)
$$, 'every fee vector matches the independently derived expectation');

-- Invariants over a sweep of amounts and configs.
select is_empty($$
  select 1 from generate_series(50, 20000, 37) b, unnest(array['absorb', 'pass_on']) pol,
    lateral private.fee_breakdown(b, pol, '{"platform_fee_flat_cents":50,"platform_fee_bps":100,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30}') f
  where f.total_cents <> f.base_cents + f.platform_fee_cents + f.processing_fee_cents
     or f.platform_fee_cents < 0 or f.processing_fee_cents < 0
     or (pol = 'absorb' and f.processing_fee_cents <> 0)
     or (pol = 'pass_on' and (f.estimated_net_cents < f.base_cents or f.estimated_net_cents > f.base_cents + 2))
$$, 'totals reconcile; fees are never negative; pass_on nets the base (within 2c of rounding)');

select throws_ok($$select * from private.fee_breakdown(0, 'absorb', '{"platform_fee_flat_cents":0,"platform_fee_bps":0,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30}')$$,
  '22023', 'invalid_amount', 'a zero amount is rejected');
select throws_ok($$select * from private.fee_breakdown(100, 'free', '{"platform_fee_flat_cents":0,"platform_fee_bps":0,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30}')$$,
  '22023', 'invalid_fee_policy', 'an unknown policy is rejected');
select throws_ok($$select * from private.fee_breakdown(100, 'pass_on', '{"platform_fee_flat_cents":0,"platform_fee_bps":0,"stripe_fee_bps":10000,"stripe_fee_fixed_cents":30}')$$,
  '22023', 'invalid_fee_config', 'a 100% Stripe rate would divide by zero and is rejected');

-- allocate_cents: parts sum exactly, largest remainder wins, ties go to the lowest index.
select is(private.allocate_cents(10, array[1, 1, 1]::bigint[]), array[4, 3, 3]::bigint[], 'tie goes to the first part');
select is(private.allocate_cents(100, array[4500, 4500]::bigint[]), array[50, 50]::bigint[], 'even split');
select is(private.allocate_cents(5, array[1, 2]::bigint[]), array[2, 3]::bigint[], 'largest remainder is topped up');
select is(private.allocate_cents(0, array[10, 20]::bigint[]), array[0, 0]::bigint[], 'zero allocates zero');
select is_empty($$
  select 1 from generate_series(0, 300, 7) t, (values (array[4500, 2500, 100]::bigint[]), (array[1, 1, 1, 1]::bigint[])) w(a)
  where (select sum(x) from unnest(private.allocate_cents(t, w.a)) x) <> t
$$, 'allocation always sums to the total');
select throws_ok($$select private.allocate_cents(10, array[0, 0]::bigint[])$$, '22023', 'invalid_allocation', 'all-zero weights are rejected');

select * from finish();
rollback;
