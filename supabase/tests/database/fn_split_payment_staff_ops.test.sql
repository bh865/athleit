-- Split payments step 2d: staff operations on installments, event cancel, roster exit, account-deletion blocker.
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
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('94000000-0000-0000-0000-000000000004', '22000000-0000-0000-0000-000000000002', 'Dan', 'Brown', current_date - interval '9 years'),
  ('95000000-0000-0000-0000-000000000005', '22000000-0000-0000-0000-000000000002', 'Eli', 'Brown', current_date - interval '9 years');
insert into public.connected_accounts (id, team_id, stripe_account_id, details_submitted, charges_enabled, payouts_enabled, onboarding_status) values
  ('ca000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'acct_TestTeamA', true, true, true, 'ready');
-- $100.00, absorb, Athleit charge 50c + 1%, plans {1,2,3,4} weekly, due in 60 days.
insert into public.payment_events (id, team_id, title, amount_cents, due_at, fee_policy, status, created_by, plan_options, plan_cadence) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'Season dues', 3000, now() + interval '60 days', 'absorb', 'draft',
   'a8888888-8888-8888-8888-888888888888', array[1,2,3,4], 'weekly');
update public.payment_events set status = 'published', published_at = now(), connected_account_id = 'ca000000-0000-0000-0000-00000000000a',
  fee_config = '{"platform_fee_flat_cents":50,"platform_fee_bps":100,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30}' where id = 'e1000000-0000-0000-0000-000000000001';
insert into public.payment_requests (id, payment_event_id, player_id, household_id, amount_cents, due_at, display_id) values
  ('b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 3000, now() + interval '60 days', 'PR-9201'),
  ('b2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 3000, now() + interval '60 days', 'PR-9202'),
  ('b3000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 3000, now() + interval '60 days', 'PR-9203');
insert into public.payment_requests (id, payment_event_id, player_id, household_id, amount_cents, due_at, display_id) values
  ('b4000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000004', '22000000-0000-0000-0000-000000000002', 3000, now() + interval '60 days', 'PR-9204'),
  ('b5000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000005', '22000000-0000-0000-0000-000000000002', 3000, now() + interval '60 days', 'PR-9205');
create function pg_temp.settle(p_pi text, j jsonb) returns text language sql as $f$
  select public.svc_payment_succeeded(p_pi, (j ->> 'payment_id')::uuid, 'ch_' || p_pi, 10, (j ->> 'total_cents')::int, 'usd', 'acct_TestTeamA', (j ->> 'application_fee_cents')::int) $f$;
create function pg_temp.inst(r uuid, n int) returns uuid language sql as $f$ select id from public.payment_request_installments where request_id = r and sequence = n $f$;

-- Offline payment of an installment ------------------------------------------------------------------------------
create temp table r1 as select public.svc_reserve_plan('a2222222-2222-2222-2222-222222222222', 'b1000000-0000-0000-0000-000000000001', 3, true, 'v1') as j;
select pg_temp.settle('pi_b1', (select j from r1));
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.record_offline_installment(pg_temp.inst('b1000000-0000-0000-0000-000000000001', 2), 'cash') $$, '42501', 'not_authorized', 'a parent cannot mark an installment paid offline');
select throws_ok($$ select public.waive_installment(pg_temp.inst('b1000000-0000-0000-0000-000000000001', 2)) $$, '42501', 'not_authorized', 'a parent cannot waive');
reset role;
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select lives_ok($$ select public.record_offline_installment(pg_temp.inst('b1000000-0000-0000-0000-000000000001', 2), 'cash', 'Paid at practice') $$, 'staff mark installment 2 paid offline');
select is((select status from public.payment_request_installments where id = pg_temp.inst('b1000000-0000-0000-0000-000000000001', 2)), 'paid_offline', 'it is paid offline');
select is((select count(*)::int from public.offline_payments where installment_id = pg_temp.inst('b1000000-0000-0000-0000-000000000001', 2)), 1, 'with an offline record');
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'partially_paid', 'the request is still partially paid');
select throws_ok($$ select public.record_offline_installment(pg_temp.inst('b1000000-0000-0000-0000-000000000001', 2), 'cash') $$, '23514', 'installment_not_open', 'a settled installment cannot be marked again');
select throws_ok($$ select public.record_offline_installment(pg_temp.inst('b1000000-0000-0000-0000-000000000001', 3), 'barter') $$, '22023', 'invalid_method', 'only cash, check or other');
select throws_ok($$ select public.waive_request('b1000000-0000-0000-0000-000000000001') $$, '23514', null, 'the whole-request waive is refused for a plan request');
select lives_ok($$ select public.waive_installment(pg_temp.inst('b1000000-0000-0000-0000-000000000001', 3), 'Scholarship') $$, 'staff waive installment 3');
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'waived', 'nothing left to pay and a waiver -> request waived');
select is((select count(*)::int from public.audit_log where action in ('installment.offline_payment', 'installment.waive') and target_id in (pg_temp.inst('b1000000-0000-0000-0000-000000000001', 2), pg_temp.inst('b1000000-0000-0000-0000-000000000001', 3))), 2, 'both actions are audited');
reset role;

-- Waive the remaining balance, voiding the open payment of installment 1 ------------------------------------------
create temp table r2 as select public.svc_reserve_plan('a3333333-3333-3333-3333-333333333333', 'b2000000-0000-0000-0000-000000000002', 3, true, 'v1') as j;
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select is(public.waive_remaining_balance('b2000000-0000-0000-0000-000000000002', 'Moved away'), 3, 'three installments waived');
reset role;
select is((select status from public.payments where id = (select (j ->> 'payment_id')::uuid from r2)), 'canceled', 'the open payment was voided');
select is((select status from public.payment_requests where id = 'b2000000-0000-0000-0000-000000000002'), 'waived', 'request waived');
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select throws_ok($$ select public.waive_remaining_balance('b2000000-0000-0000-0000-000000000002') $$, '23514', 'nothing_to_waive', 'nothing left to waive');
reset role;

-- Retry a failed charge, and reminders ----------------------------------------------------------------------------
create temp table r3 as select public.svc_reserve_plan('a2222222-2222-2222-2222-222222222222', 'b3000000-0000-0000-0000-000000000003', 3, true, 'v1') as j;
select pg_temp.settle('pi_b3', (select j from r3));
select public.svc_save_payment_method('11000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000a', 'cus_t', 'pm_t', 'a2222222-2222-2222-2222-222222222222');
update public.payment_request_installments set status = 'due' where id = pg_temp.inst('b3000000-0000-0000-0000-000000000003', 2);
update public.payment_request_installments set status = 'processing' where id = pg_temp.inst('b3000000-0000-0000-0000-000000000003', 2);
update public.payment_request_installments set status = 'failed', attempt_count = 3, next_retry_at = null where id = pg_temp.inst('b3000000-0000-0000-0000-000000000003', 2);
select is((select jsonb_array_length(public.svc_claim_due_installments(now(), 25))), 0, 'after three failures the scheduler does not charge');
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select lives_ok($$ select public.retry_installment_charge(pg_temp.inst('b3000000-0000-0000-0000-000000000003', 2)) $$, 'staff retry the failed charge');
select throws_ok($$ select public.retry_installment_charge(pg_temp.inst('b3000000-0000-0000-0000-000000000003', 3)) $$, '23514', 'installment_not_failed', 'only a failed installment can be retried');
select is((select public.send_installment_reminder(pg_temp.inst('b3000000-0000-0000-0000-000000000003', 3))), true, 'a reminder is sent');
select is((select public.send_installment_reminder(pg_temp.inst('b3000000-0000-0000-0000-000000000003', 3))), false, 'a second reminder within 24 hours is not');
reset role;
select is((select jsonb_array_length(public.svc_claim_due_installments(now(), 25))), 1, 'the scheduler picks the retried installment up');

-- Restructure ----------------------------------------------------------------------------------------------------------
create temp table r4 as select public.svc_reserve_plan('a3333333-3333-3333-3333-333333333333', 'b4000000-0000-0000-0000-000000000004', 3, false, 'v1') as j;
select pg_temp.settle('pi_b4', (select j from r4));
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.restructure_plan('b4000000-0000-0000-0000-000000000004', 1, now() + interval '5 days') $$, '42501', 'not_authorized', 'a parent cannot restructure');
reset role;
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select throws_ok($$ select public.restructure_plan('b4000000-0000-0000-0000-000000000004', 6, now() + interval '5 days') $$, '22023', null, 'out-of-range counts are refused');
select lives_ok($$ select public.restructure_plan('b4000000-0000-0000-0000-000000000004', 5, now() + interval '5 days') $$, 'up to six installments in total is allowed (one paid + five open)');
select lives_ok($$ select public.restructure_plan('b4000000-0000-0000-0000-000000000004', 1, now() + interval '20 days', 'Family asked for one payment') $$, 'two open installments become one');
reset role;
select is((select count(*)::int from public.payment_request_installments where request_id = 'b4000000-0000-0000-0000-000000000004'), 2, 'the plan now has two installments');
select is((select plan_count::int from public.payment_requests where id = 'b4000000-0000-0000-0000-000000000004'), 2, 'plan_count follows');
select is((select sum(amount_cents)::int from public.payment_request_installments where request_id = 'b4000000-0000-0000-0000-000000000004'), 3000, 'the total never changes');
select is((select amount_cents from public.payment_request_installments where request_id = 'b4000000-0000-0000-0000-000000000004' and sequence = 2), 2000, 'the open installment carries the balance');
select is((select status from public.payment_request_installments where request_id = 'b4000000-0000-0000-0000-000000000004' and sequence = 1), 'paid', 'the paid installment is untouched');
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select lives_ok($$ select public.restructure_plan('b4000000-0000-0000-0000-000000000004', 2, now() + interval '3 days') $$, 'and back to two open installments');
reset role;
select is((select array_agg(amount_cents order by sequence) from public.payment_request_installments where request_id = 'b4000000-0000-0000-0000-000000000004'), array[1000, 1000, 1000], 'evenly split again: 10.00 + 10.00 + 10.00');
select is((select (due_at > now() + interval '2 days') from public.payment_request_installments where request_id = 'b4000000-0000-0000-0000-000000000004' and sequence = 2), true, 'with the new date');

-- Roster exit, and waive_request refused on a plan ------------------------------------------------------------------
create temp table r5 as select public.svc_reserve_plan('a3333333-3333-3333-3333-333333333333', 'b5000000-0000-0000-0000-000000000005', 2, false, 'v1') as j;
select pg_temp.settle('pi_b5', (select j from r5));
insert into public.team_players (team_id, player_id, jersey_number, status) values ('a1000000-0000-0000-0000-00000000000a', '95000000-0000-0000-0000-000000000005', 11, 'active');
delete from public.team_players where player_id = '95000000-0000-0000-0000-000000000005';
select is((select status from public.payment_request_installments where request_id = 'b5000000-0000-0000-0000-000000000005' and sequence = 2), 'cancelled', 'removing the player from the roster cancels the open installment');
select is((select status from public.payment_request_installments where request_id = 'b5000000-0000-0000-0000-000000000005' and sequence = 1), 'paid', 'a paid installment is left for staff to refund');
select is((select status from public.payment_requests where id = 'b5000000-0000-0000-0000-000000000005'), 'cancelled', 'the request follows');

-- Account deletion is blocked by an active plan --------------------------------------------------------------------
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is((select jsonb_array_length(public.account_deletion_blockers() -> 'plans')), 1, 'a household with installments still to pay cannot delete');
reset role;
select pg_temp.login('a3333333-3333-3333-3333-333333333333');
select is((select jsonb_array_length(public.account_deletion_blockers() -> 'plans')), 1, 'the other household has one active plan too');
reset role;

-- Cancelling the event cancels what is still owed --------------------------------------------------------------------
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select lives_ok($$ select public.cancel_payment_event('e1000000-0000-0000-0000-000000000001') $$, 'staff cancel the event');
reset role;
select is((select status from public.payment_request_installments where id = pg_temp.inst('b3000000-0000-0000-0000-000000000003', 3)), 'cancelled', 'scheduled installments are cancelled');
select is((select status from public.payment_request_installments where id = pg_temp.inst('b3000000-0000-0000-0000-000000000003', 1)), 'paid', 'paid installments are untouched');
select is((select count(*)::int from public.payment_request_installments where status in ('scheduled', 'due', 'failed') and request_id in (select id from public.payment_requests where payment_event_id = 'e1000000-0000-0000-0000-000000000001')), 0, 'nothing open is left');
select * from finish();
rollback;
