-- Split payments step 2c: refunds across installments, disputes per payment, repair, export.
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
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'Season dues', 3000, now() + interval '60 days', 'absorb', 'draft',
   'a8888888-8888-8888-8888-888888888888', array[1,2,3], 'weekly');
update public.payment_events set status = 'published', published_at = now(), connected_account_id = 'ca000000-0000-0000-0000-00000000000a',
  fee_config = '{"platform_fee_flat_cents":50,"platform_fee_bps":100,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30}' where id = 'e1000000-0000-0000-0000-000000000001';
insert into public.payment_requests (id, payment_event_id, player_id, household_id, amount_cents, due_at, display_id) values
  ('b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 3000, now() + interval '60 days', 'PR-9201'),
  ('b2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 3000, now() + interval '60 days', 'PR-9202'),
  ('b3000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 3000, now() + interval '60 days', 'PR-9203');


-- Plan of 3 x $10.00: installment 1 paid alone, installments 2 and 3 paid together later ($10.60 each... one fee: 2 x $10 = $20 + 50c + 20c).
create temp table p1 as select public.svc_reserve_plan('a2222222-2222-2222-2222-222222222222', 'b1000000-0000-0000-0000-000000000001', 3, true, 'v1') as j;
select public.svc_payment_succeeded('pi_one', (select (j ->> 'payment_id')::uuid from p1), 'ch_one', 50, 1060, 'usd', 'acct_TestTeamA', 60);
create temp table p2 as select public.svc_reserve_installments('a2222222-2222-2222-2222-222222222222',
  (select array_agg(id) from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence > 1)) as j;
select is((select (j ->> 'total_cents')::int from p2), 2070, 'installments 2 and 3 together: $20.00 + one charge of $0.70');
select public.svc_payment_succeeded('pi_two', (select (j ->> 'payment_id')::uuid from p2), 'ch_two', 80, 2070, 'usd', 'acct_TestTeamA', 70);
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'paid', 'the plan is paid');
select is((select count(*)::int from public.payment_items where payment_request_id = 'b1000000-0000-0000-0000-000000000001' and is_active), 3, 'three items across two payments');

-- A dispute on installment 1's payment blocks refunds of THAT payment only and pauses autopay.
select is(public.svc_dispute_event('pi_one', 'dp_1', 'created', null, null, null), 'applied', 'dispute recorded');
select is((select disputed from public.payments where stripe_payment_intent_id = 'pi_one'), true, 'the disputed payment is flagged');
select is((select disputed from public.payments where stripe_payment_intent_id = 'pi_two'), false, 'the other payment is not');
select is((select disputed from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), true, 'the request is flagged');
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'paid', 'a dispute never cancels or changes the plan');
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select throws_ok($$ select public.prepare_refund((select id from public.payments where stripe_payment_intent_id = 'pi_one')) $$, '23514', 'payment_disputed', 'the disputed payment cannot be refunded');
reset role;

-- Refund $15.00 of base: latest paid installment first (3, then 2), nothing from the disputed first payment.
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
create temp table rf as select public.prepare_request_refund('b1000000-0000-0000-0000-000000000001', 1500, 'Withdrew') as j;
grant select on rf to public;
reset role;
select is((select count(*)::int from public.refunds where payment_id = (select id from public.payments where stripe_payment_intent_id = 'pi_two')), 2, 'two refunds, both on the latest payment');
select is((select count(*)::int from public.refunds where payment_id = (select id from public.payments where stripe_payment_intent_id = 'pi_one')), 0, 'none on the disputed first payment');
select is((select r.base_cents from public.refunds r join public.payment_items i on i.id = r.payment_item_id join public.payment_request_installments n on n.id = i.installment_id where n.sequence = 3), 1000, 'installment 3 is refunded first, in full');
select is((select r.base_cents from public.refunds r join public.payment_items i on i.id = r.payment_item_id join public.payment_request_installments n on n.id = i.installment_id where n.sequence = 2), 500, 'then installment 2, for the rest');
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select throws_ok($$ select public.prepare_request_refund('b1000000-0000-0000-0000-000000000001', 100) $$, '23514', 'payment_disputed', 'an allocation that reaches the disputed payment is refused');
reset role;
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.prepare_request_refund('b1000000-0000-0000-0000-000000000001', 100) $$, '42501', 'not_authorized', 'a parent cannot refund');
reset role;

-- Stripe confirms: the installments and then the request follow.
select is(public.svc_refund_event('pi_two', (select jsonb_agg(jsonb_build_object('id', 're_' || r.base_cents, 'amount', r.amount_cents, 'status', 'succeeded', 'ref', r.id)) from public.refunds r
  where r.payment_id = (select id from public.payments where stripe_payment_intent_id = 'pi_two'))), 'applied', 'refund event applied');
select is((select status from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 3), 'refunded', 'installment 3 is refunded');
select is((select status from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 2), 'partially_refunded', 'installment 2 is partially refunded');
select is((select status from public.payment_request_installments where request_id = 'b1000000-0000-0000-0000-000000000001' and sequence = 1), 'paid', 'installment 1 is untouched');
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'partially_refunded', 'the request is partially refunded');
select is(public.svc_refund_event('pi_two', (select jsonb_agg(jsonb_build_object('id', 're_' || r.base_cents, 'amount', r.amount_cents, 'status', 'succeeded', 'ref', r.id)) from public.refunds r
  where r.payment_id = (select id from public.payments where stripe_payment_intent_id = 'pi_two'))), 'applied', 'a replayed refund event converges');
select is((select count(*)::int from public.refunds where payment_id = (select id from public.payments where stripe_payment_intent_id = 'pi_two')), 2, 'a replay adds no refund rows');

-- The dispute is won: flags clear.
select public.svc_dispute_event('pi_one', 'dp_1', 'closed', 'won', null, null);
select is((select disputed from public.payments where stripe_payment_intent_id = 'pi_one') or (select disputed from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), false, 'winning the dispute clears the flags');

select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select throws_ok($$ select public.prepare_request_refund('b1000000-0000-0000-0000-000000000001', 99999) $$, '23514', 'refund_exceeds_payment', 'more than was paid is refused');
reset role;

-- Export: one row per installment, with plan context.
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select is((select count(*)::int from public.payment_event_installment_export('e1000000-0000-0000-0000-000000000001') where display_id = 'PR-9201'), 3, 'one export row per installment');
select is((select array_agg(installment_number order by installment_number) from public.payment_event_installment_export('e1000000-0000-0000-0000-000000000001') where display_id = 'PR-9201'), array[1,2,3], 'installment numbers 1..3');
select is((select count(*)::int from public.payment_event_installment_export('e1000000-0000-0000-0000-000000000001') where display_id = 'PR-9202'), 1, 'a request without a plan is one row');
reset role;
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.payment_event_installment_export('e1000000-0000-0000-0000-000000000001')), 0, 'a parent gets no export rows');
reset role;

-- Repair: an installment left processing with no live payment goes back to open.
select public.svc_create_plan('b2000000-0000-0000-0000-000000000002', 2);
update public.payment_request_installments set status = 'processing' where request_id = 'b2000000-0000-0000-0000-000000000002' and sequence = 2;
select is(public.svc_repair_installments(interval '-1 minute'), 1, 'one orphaned installment repaired');
select is((select status from public.payment_request_installments where request_id = 'b2000000-0000-0000-0000-000000000002' and sequence = 2), 'scheduled', 'it is open again');
select * from finish();
rollback;
