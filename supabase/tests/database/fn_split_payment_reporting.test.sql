-- Split payments step 2e: collection summary/detail with plans, installment notices, card-expiry warnings.
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

-- b1: plain request (unpaid). b2: plan of 3, installment 1 paid, autopay. b3: plan of 3, installment 1 paid, installment 2 failed and overdue (manual pay).
create temp table r2 as select public.svc_reserve_plan('a3333333-3333-3333-3333-333333333333', 'b2000000-0000-0000-0000-000000000002', 3, true, 'v1') as j;
select pg_temp.settle('pi_b2', (select j from r2));
create temp table r3 as select public.svc_reserve_plan('a2222222-2222-2222-2222-222222222222', 'b3000000-0000-0000-0000-000000000003', 3, false, 'v1') as j;
select pg_temp.settle('pi_b3', (select j from r3));
update public.payment_request_installments set due_at = now() - interval '2 days' where id = pg_temp.inst('b3000000-0000-0000-0000-000000000003', 2);
update public.payment_request_installments set status = 'due' where id = pg_temp.inst('b3000000-0000-0000-0000-000000000003', 2);
update public.payment_request_installments set status = 'processing' where id = pg_temp.inst('b3000000-0000-0000-0000-000000000003', 2);
update public.payment_request_installments set status = 'failed' where id = pg_temp.inst('b3000000-0000-0000-0000-000000000003', 2);

select pg_temp.login('a8888888-8888-8888-8888-888888888888');
create temp table sm as select * from public.event_collection_summary('e1000000-0000-0000-0000-000000000001');
grant select on sm to public;
select is((select expected_cents from sm), 15000::bigint, 'expected: five $30.00 requests');
select is((select collected_cents from sm), 2000::bigint, 'collected counts only the two paid installments, not scheduled ones');
select is((select scheduled_cents from sm), 3000::bigint, 'scheduled: installments not yet due');
select is((select outstanding_cents from sm), 13000::bigint, 'outstanding: three plain requests plus everything still owed on both plans');
select is((select plans_count from sm), 2, 'two families on plans');
select is((select partially_paid_count from sm), 2, 'two partially paid requests');
select is((select overdue_installments from sm), 1, 'one overdue installment');
select is((select progress_percent from sm), 13, 'progress is collected / expected');
select is((select unpaid_count from sm), 3, 'three plain unpaid requests');
create temp table dt as select * from public.event_collection_detail('e1000000-0000-0000-0000-000000000001');
grant select on dt to public;
select is((select plan_count || ':' || installments_paid || ':' || paid_cents from dt where display_id = 'PR-9202'), '3:1:1000', 'detail: plan context for a partially paid request');
select is((select overdue from dt where display_id = 'PR-9203'), true, 'detail: overdue flag');
select is((select overdue from dt where display_id = 'PR-9202'), false, 'detail: not overdue');
select isnt((select next_due_at from dt where display_id = 'PR-9202'), null, 'detail: next due date');
select is((select plan_count from dt where display_id = 'PR-9201'), null, 'a plain request has no plan');
reset role;
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.event_collection_summary('e1000000-0000-0000-0000-000000000001')), 0, 'a parent gets no summary');
reset role;

-- Installment notices: once each ------------------------------------------------------------------------------------
update public.payment_request_installments set due_at = now() + interval '2 days' where id = pg_temp.inst('b2000000-0000-0000-0000-000000000002', 2);
select is(private.send_installment_notices(), 2, 'one due-soon (b2 installment 2) and one overdue (b3 installment 2) notice');
select isnt((select due_soon_notified_at from public.payment_request_installments where id = pg_temp.inst('b2000000-0000-0000-0000-000000000002', 2)), null, 'due-soon recorded');
select isnt((select overdue_notified_at from public.payment_request_installments where id = pg_temp.inst('b3000000-0000-0000-0000-000000000003', 2)), null, 'overdue recorded');
select is(private.send_installment_notices(), 0, 'nothing fires twice');
-- A failed AUTOPAY installment is not "overdue" until the automatic attempts are used up.
update public.payment_requests set autopay = true where id = 'b3000000-0000-0000-0000-000000000003';
update public.payment_request_installments set overdue_notified_at = null, attempt_count = 1 where id = pg_temp.inst('b3000000-0000-0000-0000-000000000003', 2);
select is(private.send_installment_notices(), 0, 'an autopay installment still being retried is not announced as overdue');
update public.payment_request_installments set attempt_count = 3 where id = pg_temp.inst('b3000000-0000-0000-0000-000000000003', 2);
select is(private.send_installment_notices(), 1, 'after the last attempt it is');

-- Request-level notices ignore plan requests ------------------------------------------------------------------------
update public.payment_requests set due_at = now() - interval '1 day' where id = 'b1000000-0000-0000-0000-000000000001';
select is(private.send_payment_due_notices(), 1, 'a plain overdue request is still noticed at request level');
select is(private.send_payment_due_notices(), 0, 'and only once');
update public.payment_requests set due_at = now() - interval '1 day' where id in ('b2000000-0000-0000-0000-000000000002', 'b3000000-0000-0000-0000-000000000003');
select is(private.send_payment_due_notices(), 0, 'plan requests are never noticed at request level (no double notice)');

-- Card expiry --------------------------------------------------------------------------------------------------------
select public.svc_save_payment_method('22000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-00000000000a', 'cus_t2', 'pm_t2', 'a3333333-3333-3333-3333-333333333333');
select is((select jsonb_array_length(public.svc_cards_to_check(now()))), 1, 'an autopay installment due within 7 days with a saved card is checked');
select is(public.svc_warn_card_expiring(pg_temp.inst('b2000000-0000-0000-0000-000000000002', 2)), 'applied', 'the household is warned');
select is(public.svc_warn_card_expiring(pg_temp.inst('b2000000-0000-0000-0000-000000000002', 2)), 'noop', 'once');
select is((select jsonb_array_length(public.svc_cards_to_check(now()))), 0, 'and not checked again');
select * from finish();
rollback;
