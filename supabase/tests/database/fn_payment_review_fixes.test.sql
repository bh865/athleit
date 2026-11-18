-- adversarial-review fixes: reuse re-check, cancel/succeed races, mismatch, refund adoption, disputes
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create function pg_temp.n(q text) returns int language plpgsql as $f$ declare c int; begin execute q; get diagnostics c = row_count; return c; end $f$;
create function pg_temp.login(u uuid) returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true); end $f$;
create function pg_temp.anon() returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true); end $f$;

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'coach@example.test'), ('a2222222-2222-2222-2222-222222222222', 'parent.ava@example.test'), ('a3333333-3333-3333-3333-333333333333', 'parent.ben@example.test'),
  ('a4444444-4444-4444-4444-444444444444', 'parent.other@example.test'), ('a5555555-5555-5555-5555-555555555555', 'clubadmin@example.test'), ('a6666666-6666-6666-6666-666666666666', 'coach.b@example.test'),
  ('a7777777-7777-7777-7777-777777777777', 'teen@example.test'), ('a8888888-8888-8888-8888-888888888888', 'admin@example.test'), ('a9999999-9999-9999-9999-999999999999', 'loner@example.test'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'manager@example.test'), ('abababab-abab-abab-abab-abababababab', 'admin.b@example.test');
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
insert into public.club_memberships (club_id, profile_id, role) values ('c1000000-0000-0000-0000-000000000001', 'a5555555-5555-5555-5555-555555555555', 'admin');
insert into public.teams (id, name, sport, season_label, club_id, join_code) values
  ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall 2026', 'c1000000-0000-0000-0000-000000000001', 'TEAMA00001'),
  ('a2000000-0000-0000-0000-00000000000b', 'Team B', 'basketball', 'Fall 2026', null, 'TEAMB00002');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a8888888-8888-8888-8888-888888888888', 'admin'), ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'coach'),
  ('a1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'manager'), ('a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', 'parent'),
  ('a1000000-0000-0000-0000-00000000000a', 'a3333333-3333-3333-3333-333333333333', 'parent'),
  ('a2000000-0000-0000-0000-00000000000b', 'abababab-abab-abab-abab-abababababab', 'admin'), ('a2000000-0000-0000-0000-00000000000b', 'a6666666-6666-6666-6666-666666666666', 'coach'),
  ('a2000000-0000-0000-0000-00000000000b', 'a4444444-4444-4444-4444-444444444444', 'parent');
insert into public.households (id, name) values
  ('11000000-0000-0000-0000-000000000001', 'Adams family'), ('22000000-0000-0000-0000-000000000002', 'Brown family'),
  ('33000000-0000-0000-0000-000000000003', 'Clark family');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222'), ('22000000-0000-0000-0000-000000000002', 'a3333333-3333-3333-3333-333333333333'),
  ('33000000-0000-0000-0000-000000000003', 'a4444444-4444-4444-4444-444444444444');
insert into public.players (id, household_id, first_name, last_name, date_of_birth, profile_id) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '10 years', null),
  ('92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'Ben', 'Brown', current_date - interval '9 years', null),
  ('93000000-0000-0000-0000-000000000003', '33000000-0000-0000-0000-000000000003', 'Cleo', 'Clark', current_date - interval '11 years', null),
  ('94000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000001', 'Teen', 'Adams', current_date - interval '15 years', 'a7777777-7777-7777-7777-777777777777'),
  ('96000000-0000-0000-0000-000000000006', '22000000-0000-0000-0000-000000000002', 'Dan', 'Brown', current_date - interval '9 years', null);
insert into public.team_memberships (team_id, profile_id, role) values ('a1000000-0000-0000-0000-00000000000a', 'a7777777-7777-7777-7777-777777777777', 'player');
insert into public.team_players (team_id, player_id, jersey_number, status) values
  ('a1000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001', 7, 'active'),
  ('a1000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-000000000002', 10, 'active'),
  ('a1000000-0000-0000-0000-00000000000a', '94000000-0000-0000-0000-000000000004', 4, 'active'),
  ('a1000000-0000-0000-0000-00000000000a', '96000000-0000-0000-0000-000000000006', 9, 'inactive'),
  ('a2000000-0000-0000-0000-00000000000b', '93000000-0000-0000-0000-000000000003', 7, 'active');
insert into public.connected_accounts (id, team_id, club_id, stripe_account_id, details_submitted, charges_enabled, payouts_enabled, onboarding_status) values
  ('ca000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', null, 'acct_TestTeamA', true, true, true, 'ready'),
  ('ca000000-0000-0000-0000-00000000000c', null, 'c1000000-0000-0000-0000-000000000001', 'acct_TestClub', true, true, true, 'ready'),
  ('ca000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', null, 'acct_TestTeamB', false, false, false, 'in_review');
-- Events: e1 Team A absorb $45 (Ava, Ben, Teen); e2 Team A pass_on $25 (Ava); e3 club-issued $30 (Ava, Ben);
-- e4 Team A DRAFT; e5 Team B $20 (Cleo) on an account that cannot take charges yet.
insert into public.payment_events (id, team_id, club_id, connected_account_id, title, amount_cents, due_at, fee_policy, fee_config, status, published_at, created_by) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', null, 'ca000000-0000-0000-0000-00000000000a', 'Jersey fee', 4500, now() + interval '10 days', 'absorb', '{"platform_fee_flat_cents":0,"platform_fee_bps":0,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30}', 'published', now(), 'a8888888-8888-8888-8888-888888888888'),
  ('e2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', null, 'ca000000-0000-0000-0000-00000000000a', 'Tournament fee', 2500, now() + interval '10 days', 'pass_on', '{"platform_fee_flat_cents":50,"platform_fee_bps":100,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30}', 'published', now(), 'a8888888-8888-8888-8888-888888888888'),
  ('e3000000-0000-0000-0000-000000000003', null, 'c1000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000c', 'Club dues', 3000, now() + interval '10 days', 'absorb', '{"platform_fee_flat_cents":0,"platform_fee_bps":0,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30}', 'published', now(), 'a5555555-5555-5555-5555-555555555555'),
  ('e5000000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-00000000000b', null, 'ca000000-0000-0000-0000-00000000000b', 'Camp fee', 2000, now() + interval '10 days', 'absorb', '{"platform_fee_flat_cents":0,"platform_fee_bps":0,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30}', 'published', now(), 'abababab-abab-abab-abab-abababababab');
insert into public.payment_events (id, team_id, title, amount_cents, due_at, fee_policy, status, created_by) values
  ('e4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-00000000000a', 'Spring dues', 4500, now() + interval '30 days', 'absorb', 'draft', 'a8888888-8888-8888-8888-888888888888');
insert into public.payment_requests (id, payment_event_id, player_id, household_id, amount_cents, due_at, display_id) values
  ('b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 4500, now() + interval '10 days', 'PR-9001'),
  ('b2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 4500, now() + interval '10 days', 'PR-9002'),
  ('b3000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000001', 4500, now() + interval '10 days', 'PR-9003'),
  ('b4000000-0000-0000-0000-000000000004', 'e2000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 2500, now() + interval '10 days', 'PR-9004'),
  ('b5000000-0000-0000-0000-000000000005', 'e3000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 3000, now() + interval '10 days', 'PR-9005'),
  ('b6000000-0000-0000-0000-000000000006', 'e3000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 3000, now() + interval '10 days', 'PR-9006'),
  ('b7000000-0000-0000-0000-000000000007', 'e5000000-0000-0000-0000-000000000005', '93000000-0000-0000-0000-000000000003', '33000000-0000-0000-0000-000000000003', 2000, now() + interval '10 days', 'PR-9007');

reset role;
select public.svc_reserve_payment('a2222222-2222-2222-2222-222222222222', array['b1000000-0000-0000-0000-000000000001']::uuid[]);
select public.svc_attach_payment_intent((select id from public.payments where request_set_key = md5('b1000000-0000-0000-0000-000000000001')), 'pi_F1');
select public.svc_payment_status('pi_F1', 'processing');
select public.svc_payment_status('pi_F1', 'failed');
-- Failed attempt, intent still live. Staff waive the request: the open payment is voided, so a reused reservation cannot charge it.
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.waive_request('b1000000-0000-0000-0000-000000000001', 'Scholarship') $$, 'staff can waive a request that has a failed, still-open payment');
reset role;
select is((select status from public.payments where stripe_payment_intent_id = 'pi_F1'), 'canceled', 'the open payment was voided');
select is((select is_active from public.payment_items where payment_request_id = 'b1000000-0000-0000-0000-000000000001'), false, 'its item was released');
reset role; select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001']::uuid[]) $$, '23514', 'request_not_payable', 'a waived request cannot be quoted');
reset role;
select throws_ok($$ select public.svc_reserve_payment('a2222222-2222-2222-2222-222222222222', array['b1000000-0000-0000-0000-000000000001']::uuid[]) $$, '23514', 'request_not_payable', 'nor reserved again');
-- A reused reservation re-checks payability (event cancelled / account disabled after the reservation).
select public.svc_reserve_payment('a3333333-3333-3333-3333-333333333333', array['b2000000-0000-0000-0000-000000000002']::uuid[]);
update public.connected_accounts set charges_enabled = false where id = 'ca000000-0000-0000-0000-00000000000a';
select throws_ok($$ select public.svc_reserve_payment('a3333333-3333-3333-3333-333333333333', array['b2000000-0000-0000-0000-000000000002']::uuid[]) $$, '23514', 'request_not_payable', 'a reused reservation is refused when the account can no longer take charges');
update public.connected_accounts set charges_enabled = true where id = 'ca000000-0000-0000-0000-00000000000a';
select lives_ok($$ select public.svc_reserve_payment('a3333333-3333-3333-3333-333333333333', array['b2000000-0000-0000-0000-000000000002']::uuid[]) $$, 'and works again once it can');
-- Offline payment voids an open payment too; money in flight blocks it.
select public.svc_attach_payment_intent((select id from public.payments where request_set_key = md5('b2000000-0000-0000-0000-000000000002')), 'pi_F2');
select public.svc_payment_status('pi_F2', 'processing');
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select throws_ok($$ select public.record_offline_payment('b2000000-0000-0000-0000-000000000002', 'cash', null) $$, '23514', 'payment_in_flight', 'a payment in flight blocks an offline payment');
select throws_ok($$ select public.waive_request('b2000000-0000-0000-0000-000000000002', 'x') $$, '23514', 'payment_in_flight', 'and a waive');
reset role;
-- Mismatch between what Stripe charged and what we reserved is refused (and not applied).
select throws_ok($$ select public.svc_payment_succeeded('pi_F2', null, 'ch_F2', null, 9999, 'usd', 'acct_TestTeamA', 5) $$, '23514', 'payment_mismatch', 'a wrong amount is refused');
select throws_ok($$ select public.svc_payment_succeeded('pi_F2', null, 'ch_F2', null, 4500, 'usd', 'acct_Evil', 0) $$, '23514', 'payment_mismatch', 'a wrong destination is refused');
select throws_ok($$ select public.svc_payment_succeeded('pi_F2', null, 'ch_F2', null, 4500, 'eur', 'acct_TestTeamA', 0) $$, '23514', 'payment_mismatch', 'a wrong currency is refused');
select throws_ok($$ select public.svc_payment_succeeded('pi_F2', null, 'ch_F2', null, 4500, 'usd', 'acct_TestTeamA', 1) $$, '23514', 'payment_mismatch', 'a wrong application fee is refused');
select is((select status from public.payments where stripe_payment_intent_id = 'pi_F2'), 'processing', 'nothing was applied');
select is(public.svc_payment_succeeded('pi_F2', null, 'ch_F2', 170, 4500, 'usd', 'acct_TestTeamA', 0), 'applied', 'the exact match is applied');
-- Money that arrives after the event was cancelled: refundable, and admins are told.
select public.svc_reserve_payment('a2222222-2222-2222-2222-222222222222', array['b3000000-0000-0000-0000-000000000003']::uuid[]);
select public.svc_attach_payment_intent((select id from public.payments where request_set_key = md5('b3000000-0000-0000-0000-000000000003')), 'pi_F3');
reset role; select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select lives_ok($$ select public.cancel_payment_event('e1000000-0000-0000-0000-000000000001') $$, 'an admin cancels the event (the open intent is voided in the database)');
reset role;
select is((select status from public.payments where stripe_payment_intent_id = 'pi_F3'), 'canceled', 'the payment is canceled');
select is(public.svc_payment_succeeded('pi_F3', null, 'ch_F3', 170), 'applied', 'the parent paid in the window before Stripe was told: the success is recorded');
select is((select is_active from public.payment_items where payment_id = (select id from public.payments where stripe_payment_intent_id = 'pi_F3')), true, 'its item is active again so it can be refunded');
select is((select status from public.payment_requests where id = 'b3000000-0000-0000-0000-000000000003'), 'cancelled', 'the request stays cancelled');
select is((select count(*)::int from public.notification_outbox where channel = 'in_app' and payload ->> 'change' = 'payment_needs_refund' and profile_id = 'a8888888-8888-8888-8888-888888888888'), 1, 'the admin is told to refund it');
select is((select team_id::text from public.audit_log where action = 'payment.succeeded_on_closed_request'), 'a1000000-0000-0000-0000-00000000000a', 'the audit row is attributable to the team');
reset role; select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select is((public.prepare_refund((select id from public.payments where stripe_payment_intent_id = 'pi_F3')) -> 'refunds' -> 0 ->> 'amount_cents')::int, 4500, 'staff can refund the late payment');
-- Refund adoption: the webhook arrives before svc_attach_refund and must not create a duplicate row.
reset role;
select is((select count(*)::int from public.refunds), 1, 'one reserved refund row');
select is(public.svc_refund_event('pi_F3', ('[{"id":"re_adopt","amount":4500,"status":"succeeded","ref":"' || (select id from public.refunds) || '"}]')::jsonb), 'applied', 'the webhook refund event applies');
select is((select count(*)::int from public.refunds), 1, 'it adopted our reserved row instead of duplicating it');
select is((select stripe_refund_id || ':' || status from public.refunds), 're_adopt:succeeded', 'with Stripe''s id and final status');
select lives_ok($$ select public.svc_attach_refund((select id from public.refunds), 're_adopt', 'pending') $$, 'a late attach is harmless');
select is((select status from public.refunds), 'succeeded', 'and does not regress the status');
-- Disputes block refunds.
select public.svc_dispute_event('pi_F2', 'dp_f', 'created');
reset role; select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select throws_ok($$ select public.prepare_refund((select id from public.payments where stripe_payment_intent_id = 'pi_F2')) $$, '23514', 'payment_disputed', 'a disputed payment cannot be refunded until resolved');
reset role; select pg_temp.login('a6666666-6666-6666-6666-666666666666');
select throws_ok($$ select public.prepare_refund((select id from public.payments where stripe_payment_intent_id = 'pi_F2')) $$, '42501', 'not_authorized', 'authorization is checked before any payment detail is revealed');
-- Payers read events only through household_payments (the table exposes audience ids and fee snapshots).
reset role; select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.payment_events), 0, 'a parent cannot read payment_events directly');
select ok((select count(*) from public.household_payments()) > 0, 'but still sees what they owe through household_payments');
-- Export does not mark an in-flight attempt as paid.
reset role;
select public.svc_reserve_payment('a2222222-2222-2222-2222-222222222222', array['b4000000-0000-0000-0000-000000000004']::uuid[]);
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select is((select coalesce(paid_via, 'none') || ':' || coalesce(total_charged_cents::text, '-') from public.payment_event_export('e2000000-0000-0000-0000-000000000002')), 'none:-', 'an unpaid request with a payment attempt exports as unpaid, with no charged total');

select * from finish();
rollback;
