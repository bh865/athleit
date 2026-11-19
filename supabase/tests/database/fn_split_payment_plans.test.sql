-- Split payments step 1: schedule generator, plan terms, installments state machine, roll-up, RLS, svc_create_plan.
-- Vectors match packages/core/src/payment-plans.test.ts.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create function pg_temp.login(u uuid) returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true); end $f$;

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'coach@example.test'), ('a2222222-2222-2222-2222-222222222222', 'parent.ava@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'parent.ben@example.test'), ('a8888888-8888-8888-8888-888888888888', 'admin@example.test');
insert into public.teams (id, name, sport, season_label, join_code) values
  ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall 2026', 'TEAMA00001');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a8888888-8888-8888-8888-888888888888', 'admin'),
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'coach');
insert into public.households (id, name) values
  ('11000000-0000-0000-0000-000000000001', 'Adams family'), ('22000000-0000-0000-0000-000000000002', 'Brown family');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222'),
  ('22000000-0000-0000-0000-000000000002', 'a3333333-3333-3333-3333-333333333333');
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '10 years'),
  ('92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'Ben', 'Brown', current_date - interval '9 years');
insert into public.connected_accounts (id, team_id, stripe_account_id, details_submitted, charges_enabled, payouts_enabled, onboarding_status) values
  ('ca000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'acct_TestTeamA', true, true, true, 'ready');
-- e1: published, plans {1,2,3,6} monthly... (set while draft below); due in 40 days.
insert into public.payment_events (id, team_id, title, amount_cents, due_at, fee_policy, status, created_by) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'Season dues', 4501, now() + interval '40 days', 'absorb', 'draft',
   'a8888888-8888-8888-8888-888888888888');

-- Generator vectors -------------------------------------------------------------------------------
select is((select array_agg(amount_cents order by sequence) from private.generate_plan(4501, 4, 'weekly', '2026-01-01T00:00:00Z')), array[1126, 1125, 1125, 1125], '$45.01 in 4: remainder cent on the first');
select is((select array_agg(amount_cents order by sequence) from private.generate_plan(10000, 3, 'weekly', '2026-01-01T00:00:00Z')), array[3334, 3333, 3333], '$100.00 in 3');
select is((select sum(amount_cents)::int from private.generate_plan(9999, 6, 'monthly', '2026-01-01T00:00:00Z')), 9999, 'installments always sum to the amount');
select is((select count(*)::int from private.generate_plan(4500, 1, 'weekly', '2026-01-01T00:00:00Z')), 1, 'size 1 is one installment');
select throws_ok($$ select * from private.generate_plan(249, 5, 'weekly', now()) $$, '22023', 'invalid_plan_amount', 'an installment under 50c is refused');
select throws_ok($$ select * from private.generate_plan(1000, 7, 'weekly', now()) $$, '22023', 'invalid_plan_size', 'size 7 is refused');
select throws_ok($$ select * from private.generate_plan(1000, 2, 'daily', now()) $$, '22023', 'invalid_plan_cadence', 'unknown cadence is refused');
select is(private.plan_due_at('2026-03-01T15:30:00Z', 'weekly', 1), '2026-03-08T15:30:00Z'::timestamptz, 'weekly across US spring-forward is exactly 7 days');
select is(private.plan_due_at('2026-03-01T15:30:00Z', 'biweekly', 3), '2026-04-12T15:30:00Z'::timestamptz, 'biweekly x3');
select is(private.plan_due_at('2026-01-31T10:00:00Z', 'monthly', 1), '2026-02-28T10:00:00Z'::timestamptz, 'monthly clamps Jan 31 to Feb 28');
select is(private.plan_due_at('2026-01-31T10:00:00Z', 'monthly', 2), '2026-03-31T10:00:00Z'::timestamptz, 'monthly returns to Mar 31 (from the start, not iteratively)');
select is(private.plan_due_at('2028-01-31T10:00:00Z', 'monthly', 1), '2028-02-29T10:00:00Z'::timestamptz, 'monthly clamps to Feb 29 in a leap year');
select is(private.plan_due_at('2026-11-15T09:00:00Z', 'monthly', 3), '2027-02-15T09:00:00Z'::timestamptz, 'monthly crosses the year');
select is((select due_at from private.generate_plan(1000, 3, 'monthly', '2026-05-05T05:05:00Z') where sequence = 1), '2026-05-05T05:05:00Z'::timestamptz, 'installment 1 is due at checkout');
-- The session time zone never changes a result.
set local timezone = 'America/New_York';
select is(private.plan_due_at('2026-03-01T15:30:00Z', 'weekly', 1), '2026-03-08T15:30:00Z'::timestamptz, 'result does not depend on the session time zone (weekly)');
select is(private.plan_due_at('2026-10-31T15:30:00Z', 'monthly', 1), '2026-11-30T15:30:00Z'::timestamptz, 'result does not depend on the session time zone (monthly over the fall-back change)');
set local timezone = 'UTC';

-- Fit and availability -------------------------------------------------------------------------------
select is(private.plan_fits(6000, 6, 'weekly', '2026-01-01T00:00:00Z', '2026-02-05T00:00:00Z'), true, 'weekly x6 fits exactly 35 days out');
select is(private.plan_fits(6000, 6, 'weekly', '2026-01-01T00:00:00Z', '2026-02-04T23:59:59Z'), false, 'one second short does not fit');
select is(private.plan_fits(6000, 6, 'weekly', '2026-01-01T00:00:00Z', '2026-01-11T00:00:00Z'), false, '6 splits with 10 days left do not fit');
select is(private.plan_fits(3000, 3, 'monthly', '2026-01-31T00:00:00Z', '2026-03-31T00:00:00Z'), true, 'month-end monthly fits');
select is(private.available_plan_sizes(array[1,2,3,4,6], 6000, 'weekly', '2026-01-01T00:00:00Z', '2026-01-20T00:00:00Z'), array[1,2,3], 'only sizes that fit are offered');
select is(private.available_plan_sizes(array[6,4], 6000, 'weekly', '2026-01-01T00:00:00Z', '2026-01-20T00:00:00Z'), array[1], 'if none fit, pay in full');
select is(private.available_plan_sizes(array[1,2,3], 149, 'weekly', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'), array[1,2], 'a size that would make installments under 50c is not offered');

-- Plan terms ------------------------------------------------------------------------------------------
select is((select plan_options from public.payment_events where id = 'e1000000-0000-0000-0000-000000000001'), array[1], 'default plan options are {1}: nothing changes for existing events');
select throws_ok($$ update public.payment_events set plan_options = array[1,1] where id = 'e1000000-0000-0000-0000-000000000001' $$, '23514', null, 'duplicate options are refused');
select throws_ok($$ update public.payment_events set plan_options = array[7] where id = 'e1000000-0000-0000-0000-000000000001' $$, '23514', null, 'size 7 is refused');
select throws_ok($$ update public.payment_events set plan_options = '{}' where id = 'e1000000-0000-0000-0000-000000000001' $$, '23514', null, 'empty options are refused');
select throws_ok($$ update public.payment_events set plan_deposit_kind = 'fixed', plan_deposit_value = 500 where id = 'e1000000-0000-0000-0000-000000000001' $$, '23514', null, 'a deposit is reserved but not allowed yet');
reset role; select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.set_payment_event_plan('e1000000-0000-0000-0000-000000000001', array[1,2,3], 'monthly') $$, '42501', 'not_authorized', 'a parent cannot set plan terms');
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.set_payment_event_plan('e1000000-0000-0000-0000-000000000001', array[3,1,2,6], 'monthly') $$, 'staff set plan terms on a draft');
select is((select plan_options from public.payment_events where id = 'e1000000-0000-0000-0000-000000000001'), array[1,2,3,6], 'options are stored sorted');
select throws_ok($$ select public.set_payment_event_plan('e1000000-0000-0000-0000-000000000001', array[9], 'monthly') $$, '22023', 'invalid_plan_options', 'invalid options are refused');
select throws_ok($$ select public.set_payment_event_plan('e1000000-0000-0000-0000-000000000001', array[1], 'daily') $$, '22023', 'invalid_plan_cadence', 'invalid cadence is refused');
reset role;
update public.payment_events set status = 'published', published_at = now(), connected_account_id = 'ca000000-0000-0000-0000-00000000000a',
  fee_config = '{"platform_fee_flat_cents":0,"platform_fee_bps":0,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30}'
  where id = 'e1000000-0000-0000-0000-000000000001';
select throws_ok($$ update public.payment_events set plan_options = array[1] where id = 'e1000000-0000-0000-0000-000000000001' $$, '23514', 'payment_event_locked', 'plan options freeze at publish');
select throws_ok($$ update public.payment_events set plan_cadence = 'weekly' where id = 'e1000000-0000-0000-0000-000000000001' $$, '23514', 'payment_event_locked', 'plan cadence freezes at publish');
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select throws_ok($$ select public.set_payment_event_plan('e1000000-0000-0000-0000-000000000001', array[1], 'weekly') $$, '23514', 'not_draft', 'staff cannot change plan terms after publish');
reset role;

insert into public.payment_requests (id, payment_event_id, player_id, household_id, amount_cents, due_at, display_id) values
  ('b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 4501, now() + interval '40 days', 'PR-9101'),
  ('b2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 4501, now() + interval '40 days', 'PR-9102');

-- payer_plan_options: server decides what is offered ------------------------------------------------
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is((public.payer_plan_options('b1000000-0000-0000-0000-000000000001') -> 'sizes'), '[1,2]'::jsonb, 'monthly with 40 days left offers 1 and 2 only');
select is((public.payer_plan_options('b1000000-0000-0000-0000-000000000001') #>> '{plans,2,0,amount_cents}')::int, 2251, 'the preview schedule carries the remainder cent on installment 1');
select throws_ok($$ select public.payer_plan_options('b2000000-0000-0000-0000-000000000002') $$, '42501', 'not_authorized', 'another family cannot ask');
reset role;

-- svc_create_plan -------------------------------------------------------------------------------------------------
select throws_ok($$ select public.svc_create_plan('b1000000-0000-0000-0000-000000000001', 6) $$, '23514', 'plan_not_offered', 'a size that does not fit is refused server-side');
select throws_ok($$ select public.svc_create_plan('b1000000-0000-0000-0000-000000000001', 1) $$, '23514', 'plan_not_offered', 'size 1 is not a plan');
select lives_ok($$ select public.svc_create_plan('b1000000-0000-0000-0000-000000000001', 2, '2026-06-01T12:00:00Z') $$, 'a plan of 2 is created');
select is((select array_agg(amount_cents order by sequence) from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001'), array[2251, 2250], 'amounts sum to the request, remainder first');
select is((select array_agg(due_at order by sequence) from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001'), array['2026-06-01T12:00:00Z', '2026-07-01T12:00:00Z']::timestamptz[], 'monthly schedule');
select is((select plan_count::int from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 2, 'the request records its plan size');
select throws_ok($$ select public.svc_create_plan('b1000000-0000-0000-0000-000000000001', 2) $$, '23514', 'request_not_payable', 'a plan cannot be created twice');
select throws_ok($$ update public.payment_requests set plan_count = 3 where id = 'b1000000-0000-0000-0000-000000000001' $$, '23514', 'payment_request_immutable', 'plan size cannot change');

-- Installment immutability and state machine -------------------------------------------------------------------------
select throws_ok($$ update public.payment_request_installments set amount_cents = 1 where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 1 $$, '23514', 'installment_immutable', 'amount is immutable');
select throws_ok($$ update public.payment_request_installments set sequence = 5 where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 1 $$, '23514', 'installment_immutable', 'sequence is immutable');
select throws_ok($$ update public.payment_request_installments set status = 'refunded' where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 1 $$, '23514', 'invalid_status_transition', 'scheduled cannot jump to refunded');
select lives_ok($$ update public.payment_request_installments set due_at = due_at + interval '1 day' where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2 $$, 'an open installment can be rescheduled');
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'unpaid', 'no installment moved: still unpaid');

-- Roll-up: unpaid -> processing -> partially_paid -> paid
update public.payment_request_installments set status = 'processing' where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 1;
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'processing', 'installment 1 processing -> request processing');
update public.payment_request_installments set status = 'paid', paid_at = now() where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 1;
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'partially_paid', 'installment 1 paid -> request partially_paid');
update public.payment_request_installments set status = 'processing' where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2;
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'partially_paid', 'a later installment processing does not move the request back');
update public.payment_request_installments set status = 'failed' where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2;
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'partially_paid', 'a failed later installment leaves the request partially_paid');
update public.payment_request_installments set status = 'paid_offline' where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2;
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'paid', 'all installments settled -> request paid');
select isnt((select paid_at from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), null, 'paid_at is set');
select throws_ok($$ update public.payment_request_installments set due_at = now() where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 1 $$, '23514', 'installment_immutable', 'a paid installment cannot be rescheduled');
update public.payment_request_installments set status = 'partially_refunded' where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 1;
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'partially_refunded', 'a refund on installment 1 -> request partially_refunded');
select throws_ok($$ update public.payment_request_installments set status = 'paid' where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 1 $$, '23514', 'invalid_status_transition', 'refund states are one way');

-- Waive the remaining balance: partially_paid -> waived
select public.svc_create_plan('b2000000-0000-0000-0000-000000000002', 2, '2026-06-01T12:00:00Z');
update public.payment_request_installments set status = 'processing' where request_id = 'b2000000-0000-0000-0000-000000000002' and sequence = 1;
update public.payment_request_installments set status = 'paid' where request_id = 'b2000000-0000-0000-0000-000000000002' and sequence = 1;
update public.payment_request_installments set status = 'waived', waived_at = now() where request_id = 'b2000000-0000-0000-0000-000000000002' and sequence = 2;
select is((select status from public.payment_requests where id = 'b2000000-0000-0000-0000-000000000002'), 'waived', 'waiving the remaining balance of a partially paid request -> waived');

-- RLS ----------------------------------------------------------------------------------------------------------------
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.payment_request_installments), 2, 'a household reads only its own installments');
select throws_ok($$ update public.payment_request_installments set status = 'paid' $$, '42501', null, 'a household cannot write installments');
reset role; select pg_temp.login('a3333333-3333-3333-3333-333333333333');
select is((select count(*)::int from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001'), 0, 'another household sees none of them');
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.payment_request_installments), 4, 'event staff read every installment of their event');
reset role; select set_config('request.jwt.claims', '{"role":"anon"}', true); select set_config('role', 'anon', true);
select throws_ok($$ select count(*) from public.payment_request_installments $$, '42501', null, 'anonymous has no access');
reset role;

-- payment_items: one live payment per installment -----------------------------------------------------------------
-- (request b1 is fully settled by now, so use a fresh request and plan.)
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('93000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 'Cleo', 'Adams', current_date - interval '8 years');
insert into public.payment_requests (id, payment_event_id, player_id, household_id, amount_cents, due_at, display_id) values
  ('b3000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 3000, now() + interval '40 days', 'PR-9103');
select public.svc_create_plan('b3000000-0000-0000-0000-000000000003', 2);
insert into public.payments (id, connected_account_id, household_id, fee_policy, base_cents, total_charged_cents, estimated_stripe_fee_cents, application_fee_cents, request_set_key) values
  ('d1000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000a', '11000000-0000-0000-0000-000000000001', 'absorb', 1500, 1500, 74, 0, 'setkey-installment-1'),
  ('d2000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-00000000000a', '11000000-0000-0000-0000-000000000001', 'absorb', 1500, 1500, 74, 0, 'setkey-installment-1b');
select lives_ok($$ insert into public.payment_items (payment_id, payment_request_id, installment_id, amount_cents)
  select 'd1000000-0000-0000-0000-000000000001', request_id, id, amount_cents from public.payment_request_installments
  where request_id = 'b3000000-0000-0000-0000-000000000003' and sequence = 1 $$, 'an item can point at an installment');
select throws_ok($$ insert into public.payment_items (payment_id, payment_request_id, installment_id, amount_cents)
  select 'd2000000-0000-0000-0000-000000000002', request_id, id, amount_cents from public.payment_request_installments
  where request_id = 'b3000000-0000-0000-0000-000000000003' and sequence = 1 $$, '23505', null, 'an installment is in at most one live payment');
select lives_ok($$ insert into public.payment_items (payment_id, payment_request_id, installment_id, amount_cents)
  select 'd2000000-0000-0000-0000-000000000002', request_id, id, amount_cents from public.payment_request_installments
  where request_id = 'b3000000-0000-0000-0000-000000000003' and sequence = 2 $$, 'a different installment of the same request can be in another payment');
update public.payment_items set is_active = false where payment_id = 'd2000000-0000-0000-0000-000000000002';
select throws_ok($$ insert into public.payment_items (payment_id, payment_request_id, installment_id, amount_cents)
  select 'd2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', id, 1500 from public.payment_request_installments
  where request_id = 'b3000000-0000-0000-0000-000000000003' and sequence = 2 $$, '23503', null, 'an item cannot pair an installment with another request');
select throws_ok($$ update public.payment_items set installment_id = null where payment_id = 'd1000000-0000-0000-0000-000000000001' $$, '23514', 'payment_item_immutable', 'an item''s installment is immutable');
select * from finish();
rollback;
