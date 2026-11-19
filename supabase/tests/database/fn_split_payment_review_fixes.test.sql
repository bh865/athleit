-- Split payments: fixes from the code review (abandoned checkout, refunded plans stay payable, guard columns, plan_too_long).
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

-- Abandoned checkout frees the installment ---------------------------------------------------------------------------------
create temp table r1 as select public.svc_reserve_plan('a2222222-2222-2222-2222-222222222222', 'b1000000-0000-0000-0000-000000000001', 3, false, 'v1') as j;
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select lives_ok($$ select public.cancel_open_payment((select (j ->> 'payment_id')::uuid from r1)) $$, 'the family walks away from checkout');
reset role;
select is((select status in ('scheduled', 'due') from public.payment_request_installments where id = pg_temp.inst('b1000000-0000-0000-0000-000000000001', 1)), true, 'installment 1 is open again, not stuck processing');
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'unpaid', 'the request follows by roll-up');
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select lives_ok($$ select public.payer_installment_quote(array[pg_temp.inst('b1000000-0000-0000-0000-000000000001', 1)]) $$, 'and can be paid straight away');
reset role;

-- A refund on one installment does not freeze the rest --------------------------------------------------------------------
create temp table r2 as select public.svc_reserve_plan('a3333333-3333-3333-3333-333333333333', 'b2000000-0000-0000-0000-000000000002', 3, true, 'v1') as j;
select pg_temp.settle('pi_fix2', (select j from r2));
update public.payment_request_installments set status = 'refunded' where id = pg_temp.inst('b2000000-0000-0000-0000-000000000002', 1);
select is((select status from public.payment_requests where id = 'b2000000-0000-0000-0000-000000000002'), 'partially_refunded', 'installment 1 refunded -> request partially_refunded while 2 and 3 are open');
select pg_temp.login('a3333333-3333-3333-3333-333333333333');
select lives_ok($$ select public.payer_installment_quote(array[pg_temp.inst('b2000000-0000-0000-0000-000000000002', 2)]) $$, 'the remaining installments can still be paid');
reset role;
select public.svc_save_payment_method('22000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-00000000000a', 'cus_fix', 'pm_fix', 'a3333333-3333-3333-3333-333333333333');
update public.payment_request_installments set due_at = now() - interval '1 hour' where id = pg_temp.inst('b2000000-0000-0000-0000-000000000002', 2);
select is((select jsonb_array_length(public.svc_claim_due_installments(now(), 25))), 1, 'and the scheduler still charges them');

-- The request guard protects every column ---------------------------------------------------------------------------------
select throws_ok($$ update public.payment_requests set amount_cents = 100 where id = 'b4000000-0000-0000-0000-000000000004' $$, '23514', 'payment_request_immutable', 'amount is immutable');
select throws_ok($$ update public.payment_requests set player_id = '91000000-0000-0000-0000-000000000001' where id = 'b4000000-0000-0000-0000-000000000004' $$, '23514', 'payment_request_immutable', 'player is immutable');
select throws_ok($$ update public.payment_requests set household_id = '11000000-0000-0000-0000-000000000001' where id = 'b4000000-0000-0000-0000-000000000004' $$, '23514', 'payment_request_immutable', 'household is immutable');
select throws_ok($$ update public.payment_requests set display_id = 'PR-0' where id = 'b4000000-0000-0000-0000-000000000004' $$, '23514', 'payment_request_immutable', 'display id is immutable');
select throws_ok($$ update public.payment_requests set payment_event_id = 'e1000000-0000-0000-0000-000000000002' where id = 'b4000000-0000-0000-0000-000000000004' $$, '23514', null, 'the event is immutable');
select throws_ok($$ update public.payment_requests set plan_count = 4 where id = 'b2000000-0000-0000-0000-000000000002' $$, '23514', 'payment_request_immutable', 'a plan cannot change size outside a restructure');

-- Restructure cannot make a plan longer than six installments --------------------------------------------------------------
create temp table r3 as select public.svc_reserve_plan('a2222222-2222-2222-2222-222222222222', 'b3000000-0000-0000-0000-000000000003', 3, false, 'v1') as j;
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select lives_ok($$ select public.record_offline_installment(pg_temp.inst('b3000000-0000-0000-0000-000000000003', 1), 'cash') $$, 'installment 1 settled offline');
select lives_ok($$ select public.record_offline_installment(pg_temp.inst('b3000000-0000-0000-0000-000000000003', 2), 'cash') $$, 'installment 2 settled offline');
select throws_ok($$ select public.restructure_plan('b3000000-0000-0000-0000-000000000003', 5, now() + interval '5 days') $$, '23514', 'plan_too_long', 'two settled + five new would be seven installments: refused');
select lives_ok($$ select public.restructure_plan('b3000000-0000-0000-0000-000000000003', 4, now() + interval '5 days') $$, 'two settled + four new is six: allowed');
reset role;

-- A paused roster spot does not drop what the family owes; removal does ---------------------------------------------------
create temp table r5 as select public.svc_reserve_plan('a3333333-3333-3333-3333-333333333333', 'b5000000-0000-0000-0000-000000000005', 2, false, 'v1') as j;
select pg_temp.settle('pi_fix5', (select j from r5));
insert into public.team_players (team_id, player_id, jersey_number, status) values ('a1000000-0000-0000-0000-00000000000a', '95000000-0000-0000-0000-000000000005', 11, 'active');
update public.team_players set status = 'inactive' where player_id = '95000000-0000-0000-0000-000000000005';
select is((select status from public.payment_request_installments where id = pg_temp.inst('b5000000-0000-0000-0000-000000000005', 2)), 'scheduled', 'an inactive roster spot does not cancel the installments');
delete from public.team_players where player_id = '95000000-0000-0000-0000-000000000005';
select is((select status from public.payment_request_installments where id = pg_temp.inst('b5000000-0000-0000-0000-000000000005', 2)), 'cancelled', 'removing the player does');

-- Card checks are rate limited ----------------------------------------------------------------------------------------------
update public.payment_request_installments set status = 'scheduled', due_at = now() + interval '2 days' where id = pg_temp.inst('b2000000-0000-0000-0000-000000000002', 2);
select is((select jsonb_array_length(public.svc_cards_to_check(now()))), 1, 'a card due for a check is listed');
select public.svc_mark_card_checked(pg_temp.inst('b2000000-0000-0000-0000-000000000002', 2));
select is((select jsonb_array_length(public.svc_cards_to_check(now()))), 0, 'once checked it is not read again today');
select is((select jsonb_array_length(public.svc_cards_to_check(now() + interval '25 hours'))), 1, 'but is checked again the next day');
select * from finish();
rollback;
