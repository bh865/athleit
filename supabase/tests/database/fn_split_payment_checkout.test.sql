-- Split payments step 2a: plan quote, reserve a plan, settle installments, dunning, the scheduler's work list.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create function pg_temp.login(u uuid) returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true); end $f$;

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'coach@example.test'), ('a2222222-2222-2222-2222-222222222222', 'parent.ava@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'parent.ben@example.test'), ('a8888888-8888-8888-8888-888888888888', 'admin@example.test');
insert into public.teams (id, name, sport, season_label, join_code) values ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall 2026', 'TEAMA00001');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a8888888-8888-8888-8888-888888888888', 'admin'),
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'coach');
insert into public.households (id, name) values ('11000000-0000-0000-0000-000000000001', 'Adams family'), ('22000000-0000-0000-0000-000000000002', 'Brown family');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222'), ('22000000-0000-0000-0000-000000000002', 'a3333333-3333-3333-3333-333333333333');
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '10 years'),
  ('92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'Ben', 'Brown', current_date - interval '9 years'),
  ('93000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 'Cleo', 'Adams', current_date - interval '8 years');
insert into public.connected_accounts (id, team_id, stripe_account_id, details_submitted, charges_enabled, payouts_enabled, onboarding_status) values
  ('ca000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'acct_TestTeamA', true, true, true, 'ready');
-- $100.00, absorb, Athleit charge 50c + 1%, plans {1,2,3,4} weekly, due in 60 days.
insert into public.payment_events (id, team_id, title, amount_cents, due_at, fee_policy, status, created_by, plan_options, plan_cadence) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'Season dues', 10000, now() + interval '60 days', 'absorb', 'draft',
   'a8888888-8888-8888-8888-888888888888', array[1,2,3,4], 'weekly');
update public.payment_events set status = 'published', published_at = now(), connected_account_id = 'ca000000-0000-0000-0000-00000000000a',
  fee_config = '{"platform_fee_flat_cents":50,"platform_fee_bps":100,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30}' where id = 'e1000000-0000-0000-0000-000000000001';
insert into public.payment_requests (id, payment_event_id, player_id, household_id, amount_cents, due_at, display_id) values
  ('b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 10000, now() + interval '60 days', 'PR-9201'),
  ('b2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 10000, now() + interval '60 days', 'PR-9202'),
  ('b3000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 10000, now() + interval '60 days', 'PR-9203');

-- The plan quote: what each size costs, before the family commits ----------------------------------------------
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is(public.payer_plan_quote('b1000000-0000-0000-0000-000000000001') -> 'sizes', '[1,2,3,4]'::jsonb, 'the server offers the sizes that fit');
select is((public.payer_plan_quote('b1000000-0000-0000-0000-000000000001') #>> '{plans,4,total_cents}')::int, 10300, '4 installments cost $103.00 in total');
select is((public.payer_plan_quote('b1000000-0000-0000-0000-000000000001') #>> '{plans,4,full_pay_total_cents}')::int, 10150, 'paying in full costs $101.50');
select is((public.payer_plan_quote('b1000000-0000-0000-0000-000000000001') #>> '{plans,4,extra_cents}')::int, 150, 'the plan costs $1.50 more');
select is((public.payer_plan_quote('b1000000-0000-0000-0000-000000000001') #>> '{plans,4,charge_now_cents}')::int, 2575, 'charged now: installment 1 with its own fee');
select is((public.payer_plan_quote('b1000000-0000-0000-0000-000000000001') #>> '{plans,2,installments,0,total_cents}')::int, 5100, 'installment 1 of 2: $50.00 + 50c + 50c = $51.00');
select throws_ok($$ select public.payer_plan_quote('b2000000-0000-0000-0000-000000000002') $$, '42501', 'not_authorized', 'another family cannot quote');
reset role;

-- Start a plan: plan + consent + installment 1 reserved in one transaction ---------------------------------------
select throws_ok($$ select public.svc_reserve_plan('a3333333-3333-3333-3333-333333333333', 'b1000000-0000-0000-0000-000000000001', 4, true, 'v1') $$, '42501', 'not_authorized', 'a non-guardian cannot start a plan');
select throws_ok($$ select public.svc_reserve_plan('a2222222-2222-2222-2222-222222222222', 'b1000000-0000-0000-0000-000000000001', 6, true, 'v1') $$, '23514', 'plan_not_offered', 'a size that is not offered is refused');
create temp table res1 as select public.svc_reserve_plan('a2222222-2222-2222-2222-222222222222', 'b1000000-0000-0000-0000-000000000001', 4, true, 'v1', '203.0.113.5', 'TestAgent/1') as j;
select is((select (j ->> 'total_cents')::int from res1), 2575, 'the first charge is installment 1 with fees');
select is((select (j ->> 'application_fee_cents')::int from res1), 75, 'the application fee is the Athleit charge of that installment');
select is((select (j ->> 'setup_future_usage')::boolean from res1), true, 'autopay asks Stripe to save the card for off-session use');
select is((select status from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 1), 'processing', 'installment 1 is processing');
select is((select status from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2), 'scheduled', 'later installments are scheduled');
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'processing', 'the request is processing');
select is((select autopay from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), true, 'autopay recorded');
select is((select ip || '|' || user_agent || '|' || consent_version from public.payment_plan_consents where request_id = 'b1000000-0000-0000-0000-000000000001'), '203.0.113.5|TestAgent/1|v1', 'consent recorded with ip, agent and text version');
select is((select count(*)::int from public.payment_items where payment_id = (select (j ->> 'payment_id')::uuid from res1) and installment_id is not null), 1, 'one item, for installment 1');
select is((select (public.svc_reserve_plan('a2222222-2222-2222-2222-222222222222', 'b1000000-0000-0000-0000-000000000001', 4, true, 'v1') ->> 'reused')::boolean), true, 'retrying the same plan reuses the open payment');
select throws_ok($$ select public.svc_reserve_plan('a2222222-2222-2222-2222-222222222222', 'b1000000-0000-0000-0000-000000000001', 2, true, 'v1') $$, '23514', 'plan_locked', 'a different plan once chosen is refused');
select throws_ok($$ select public.svc_reserve_payment('a2222222-2222-2222-2222-222222222222', array['b1000000-0000-0000-0000-000000000001']::uuid[]) $$, '23514', null, 'a plan request cannot also be paid as a whole request');

-- Settle installment 1 -------------------------------------------------------------------------------------------
select is(public.svc_payment_succeeded('pi_plan1', (select (j ->> 'payment_id')::uuid from res1), 'ch_plan1', 100, 2575, 'usd', 'acct_TestTeamA', 75), 'applied', 'the webhook settles installment 1');
select is((select status from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 1), 'paid', 'installment 1 is paid');
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'partially_paid', 'the request is partially paid');
select isnt((select receipt_display_id from public.payments where stripe_payment_intent_id = 'pi_plan1'), null, 'one receipt for the payment');
select is(public.svc_payment_succeeded('pi_plan1', null, 'ch_plan1', 100), 'noop', 'a replayed webhook is a no-op');

-- Pay the remaining three together: ONE fee on the summed base ----------------------------------------------------
create temp table rest as select array_agg(id order by sequence) as ids from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence > 1;
grant select on rest to public;
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is((public.payer_installment_quote((select ids from rest)) ->> 'total_cents')::int, 7625, 'the remaining 3 x $25.00 cost $76.25 together (one flat charge), not 3 x $25.75');
select is((public.payer_installment_quote((select ids from rest)) ->> 'platform_fee_cents')::int, 125, 'one Athleit charge on the summed base');
select throws_ok($$ select public.payer_installment_quote((select array_agg(id) from public.payment_request_installments where request_id = 'b2000000-0000-0000-0000-000000000002')) $$, '42501', null, 'another family''s installments cannot be quoted');
reset role;

-- Dunning for an off-session charge of installment 2 -----------------------------------------------------------------
select public.svc_save_payment_method('11000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000a', 'cus_test1', 'pm_test1', 'a2222222-2222-2222-2222-222222222222');
select is(public.svc_get_customer('11000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000a'), 'cus_test1', 'the Stripe customer id is stored (ids only)');
update public.payment_request_installments set due_at = now() - interval '1 hour' where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2;
select is((select jsonb_array_length(public.svc_claim_due_installments(now(), 25))), 1, 'installment 2 is due and claimed');
select is((select status from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2), 'due', 'a scheduled installment whose date has come becomes due');
update public.payment_requests set disputed = true where id = 'b3000000-0000-0000-0000-000000000003';
select is((select jsonb_array_length(public.svc_claim_due_installments(now(), 25))), 0, 'a dispute anywhere in the household pauses autopay');
update public.payment_requests set disputed = false where id = 'b3000000-0000-0000-0000-000000000003';
create temp table off1 as select public.svc_reserve_installments('a2222222-2222-2222-2222-222222222222', (select array[id] from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2), true) as j;
select is((select off_session from public.payments where id = (select (j ->> 'payment_id')::uuid from off1)), true, 'the payment is marked off-session');
select is((select jsonb_array_length(public.svc_claim_due_installments(now(), 25))), 0, 'an installment with a live payment is not claimed twice');
select is(public.svc_payment_status('pi_off1', 'failed', (select (j ->> 'payment_id')::uuid from off1)), 'applied', 'the failed charge is recorded');
select is((select status || ':' || attempt_count from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2), 'failed:1', 'attempt 1 failed');
select cmp_ok((select next_retry_at from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2), '>', now() + interval '2 days 23 hours', 'retry in 3 days');
select is((select status from public.payments where id = (select (j ->> 'payment_id')::uuid from off1)), 'canceled', 'the payment is canceled so the installment is free again');
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'partially_paid', 'a failed installment never cancels or reverts the request');
select is((select jsonb_array_length(public.svc_claim_due_installments(now(), 25))), 0, 'not retried before its time');
update public.payment_request_installments set next_retry_at = now() - interval '1 minute' where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2;
select is((select jsonb_array_length(public.svc_claim_due_installments(now(), 25))), 1, 'retried once the retry time has come');
create temp table off2 as select public.svc_reserve_installments('a2222222-2222-2222-2222-222222222222', (select array[id] from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2), true) as j;
select public.svc_payment_status('pi_off2', 'failed', (select (j ->> 'payment_id')::uuid from off2));
select cmp_ok((select next_retry_at from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2), '>', now() + interval '4 days 23 hours', 'second retry in 5 more days');
update public.payment_request_installments set next_retry_at = now() - interval '1 minute' where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2;
create temp table off3 as select public.svc_reserve_installments('a2222222-2222-2222-2222-222222222222', (select array[id] from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2), true) as j;
select public.svc_payment_status('pi_off3', 'failed', (select (j ->> 'payment_id')::uuid from off3));
select is((select attempt_count || ':' || (next_retry_at is null) || ':' || (overdue_notified_at is not null) from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2), '3:true:true', 'after the third failure: no more retries, overdue and staff told once');
select is((select jsonb_array_length(public.svc_claim_due_installments(now(), 25))), 0, 'no automatic charge after the last attempt');
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'partially_paid', 'still partially paid: staff decide what happens next');

-- The family can still pay it by hand ----------------------------------------------------------------------------------
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is((public.payer_installment_quote((select array[id] from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2)) ->> 'total_cents')::int, 2575, 'a failed installment can be paid manually');
reset role;
create temp table man as select public.svc_reserve_installments('a2222222-2222-2222-2222-222222222222', (select ids from rest)) as j;
select is((select (j ->> 'total_cents')::int from man), 7625, 'reserving the remaining installments together charges $76.25');
select is(public.svc_payment_succeeded('pi_man', (select (j ->> 'payment_id')::uuid from man), 'ch_man', 200, 7625, 'usd', 'acct_TestTeamA', 125), 'applied', 'settled');
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'paid', 'all installments paid -> request paid');
select is((select count(*)::int from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and status = 'paid'), 4, 'four paid installments');
select is((select count(distinct receipt_display_id)::int from public.payments where id in (select payment_id from public.payment_items where payment_request_id = 'b1000000-0000-0000-0000-000000000001')), 2, 'one receipt per payment');

-- Clients cannot reach the service functions or the consent / card tables -----------------------------------------------
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.svc_reserve_plan('a2222222-2222-2222-2222-222222222222', 'b3000000-0000-0000-0000-000000000003', 2, false, 'v1') $$, '42501', null, 'a signed-in user cannot call the service reserve');
select throws_ok($$ select * from public.payer_payment_methods $$, '42501', null, 'saved card ids are not readable by clients');
select throws_ok($$ select * from public.payment_plan_consents $$, '42501', null, 'consents are not readable by clients');
reset role;
select * from finish();
rollback;
