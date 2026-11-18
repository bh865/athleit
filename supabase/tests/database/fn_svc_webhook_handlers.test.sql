-- public.svc_payment_succeeded / svc_payment_status / svc_refund_event / svc_dispute_event / svc_set_account_status / svc_ledger_event
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
select public.svc_attach_payment_intent((select id from public.payments where request_set_key = md5('b1000000-0000-0000-0000-000000000001')), 'pi_A');
-- processing -> failed -> retry succeeds
select is(public.svc_payment_status('pi_A', 'processing'), 'applied', 'processing is applied');
select is(public.svc_payment_status('pi_A', 'processing'), 'noop', 'a repeated processing event is a no-op');
select is(public.svc_payment_status('pi_A', 'failed'), 'applied', 'a failed attempt is recorded');
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'unpaid', 'the request shows unpaid so the family can retry');
select is(public.svc_payment_status('pi_A', 'processing'), 'applied', 'a retry moves it to processing again');
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'processing', 'and the request is processing');
select is(public.svc_payment_succeeded('pi_A', null, 'ch_A', null), 'applied', 'success after a failed attempt is applied');
select is((select status from public.payments where stripe_payment_intent_id = 'pi_A'), 'succeeded', 'payment succeeded');
select is((select status from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), 'paid', 'request paid');
select ok((select receipt_display_id ~ '^RCP-[0-9]+$' and succeeded_at is not null and net_to_account_cents = 4339 from public.payments where stripe_payment_intent_id = 'pi_A'), 'a receipt id is assigned and the net to the team is $43.39');
select is((select count(*)::int from public.notification_outbox where category = 'payments' and channel = 'in_app' and payload ->> 'change' = 'receipt' and profile_id = 'a2222222-2222-2222-2222-222222222222'), 1, 'the payer is sent a receipt');
select is((select count(*)::int from public.notification_outbox where category = 'payments' and channel = 'in_app' and payload ->> 'change' = 'payment_received' and profile_id = 'a8888888-8888-8888-8888-888888888888'), 1, 'the issuer admin is told');
select is((select count(*)::int from public.notification_outbox where category = 'payments' and payload ->> 'change' = 'payment_received' and profile_id = 'a1111111-1111-1111-1111-111111111111'), 0, 'coaches are not paged for every payment');
-- duplicates and late events change nothing
select is(public.svc_payment_succeeded('pi_A', null, 'ch_A', null), 'noop', 'a duplicate success is a no-op');
select is(public.svc_payment_succeeded('pi_A', null, null, 170), 'noop', 'a duplicate success that carries the Stripe fee only fills it in');
select is((select stripe_fee_cents from public.payments where stripe_payment_intent_id = 'pi_A'), 170, 'the actual Stripe fee is recorded (estimate was 161)');
select is(public.svc_payment_status('pi_A', 'processing'), 'noop', 'a late processing event is ignored after success');
select is(public.svc_payment_status('pi_A', 'canceled'), 'noop', 'a late canceled event is ignored after success');
select is(public.svc_payment_status('pi_A', 'failed'), 'noop', 'a late failure is ignored after success');
select is((select count(*)::int from public.payments where receipt_display_id is not null), 1, 'exactly one receipt was issued');
select is((select count(*)::int from public.notification_outbox where channel = 'in_app' and category = 'payments' and payload ->> 'change' = 'receipt'), 1, 'replays send no second receipt');
select is(public.svc_payment_succeeded('pi_Nope', null, null, null), 'unknown_payment', 'an unknown intent is reported, not guessed at');
-- webhook before the intent id was attached: resolved by our own payment id
select public.svc_reserve_payment('a3333333-3333-3333-3333-333333333333', array['b6000000-0000-0000-0000-000000000006']::uuid[]);
select is(public.svc_payment_status('pi_Race', 'processing', (select id from public.payments where request_set_key = md5('b6000000-0000-0000-0000-000000000006'))), 'applied', 'a webhook that beats the attach resolves the payment by metadata id');
select is((select stripe_payment_intent_id from public.payments where request_set_key = md5('b6000000-0000-0000-0000-000000000006')), 'pi_Race', 'and attaches the intent id');
-- refund event BEFORE success completed (out of order) converges
select is(public.svc_refund_event('pi_Race', '[{"id":"re_1","amount":1000,"status":"succeeded"}]', null, 'ch_B'), 'applied', 'an early refund event applies success first, then the refund');
select is((select status from public.payments where stripe_payment_intent_id = 'pi_Race'), 'partially_refunded', 'partial refund');
select is((select status from public.payment_requests where id = 'b6000000-0000-0000-0000-000000000006'), 'partially_refunded', 'the request is partly refunded');
select is((select count(*)::int from public.notification_outbox where channel = 'in_app' and category = 'payments' and payload ->> 'change' = 'refund' and profile_id = 'a3333333-3333-3333-3333-333333333333'), 1, 'the refund is announced once');
select is(public.svc_refund_event('pi_Race', '[{"id":"re_1","amount":1000,"status":"succeeded"}]'), 'applied', 'the same refund event replayed...');
select is((select count(*)::int from public.refunds where payment_id = (select id from public.payments where stripe_payment_intent_id = 'pi_Race')), 1, '...creates no second refund row');
select is((select count(*)::int from public.notification_outbox where channel = 'in_app' and category = 'payments' and payload ->> 'change' = 'refund' and profile_id = 'a3333333-3333-3333-3333-333333333333'), 1, '...and no second notification');
select is(public.svc_refund_event('pi_Race', '[{"id":"re_1","amount":1000,"status":"succeeded"},{"id":"re_2","amount":2000,"status":"succeeded"}]'), 'applied', 'a second refund completes it');
select is((select status from public.payments where stripe_payment_intent_id = 'pi_Race'), 'refunded', 'payment fully refunded');
select is((select status from public.payment_requests where id = 'b6000000-0000-0000-0000-000000000006'), 'refunded', 'request refunded');
-- disputes
select is(public.svc_dispute_event('pi_A', 'dp_1', 'created'), 'applied', 'a dispute is recorded');
select is((select disputed from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), true, 'the request is flagged');
select is((select count(*)::int from public.notification_outbox where channel = 'in_app' and payload ->> 'change' = 'dispute_opened' and profile_id = 'a8888888-8888-8888-8888-888888888888'), 1, 'staff are notified');
select is(public.svc_dispute_event('pi_A', 'dp_1', 'created'), 'applied', 'a replay...');
select is((select count(*)::int from public.notification_outbox where channel = 'in_app' and payload ->> 'change' = 'dispute_opened' and profile_id = 'a8888888-8888-8888-8888-888888888888'), 1, '...notifies once');
select is(public.svc_dispute_event('pi_A', 'dp_1', 'closed', 'lost'), 'applied', 'closing a lost dispute');
select is((select disputed from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), true, 'a lost dispute stays flagged');
select is(public.svc_dispute_event('pi_A', 'dp_1', 'closed', 'won'), 'applied', 'a won dispute');
select is((select disputed from public.payment_requests where id = 'b1000000-0000-0000-0000-000000000001'), false, 'clears the flag');
select throws_ok($$ select public.svc_dispute_event('pi_A', 'dp_1', 'bogus') $$, '22023', 'invalid_phase', 'unknown phases are rejected');
-- canceled event, then money arrives anyway
select public.svc_reserve_payment('a3333333-3333-3333-3333-333333333333', array['b2000000-0000-0000-0000-000000000002']::uuid[]);
select public.svc_attach_payment_intent((select id from public.payments where request_set_key = md5('b2000000-0000-0000-0000-000000000002')), 'pi_Late');
update public.payment_events set status = 'cancelled' where id = 'e1000000-0000-0000-0000-000000000001';
select is(public.svc_payment_status('pi_Late', 'canceled'), 'applied', 'canceling an open intent frees the request (event cancelled -> request cancelled)');
select is((select status from public.payment_requests where id = 'b2000000-0000-0000-0000-000000000002'), 'cancelled', 'the request is cancelled');
select is(public.svc_payment_succeeded('pi_Late', null, 'ch_Late', null), 'applied', 'if Stripe took the money anyway it is recorded');
select is((select status from public.payments where stripe_payment_intent_id = 'pi_Late'), 'succeeded', 'the payment is succeeded');
select is((select count(*)::int from public.audit_log where action = 'payment.succeeded_on_closed_request'), 1, 'and flagged for a staff refund');
-- accounts
select is(public.svc_set_account_status('acct_TestTeamB', true, false, false, '{"currently_due":["individual.verification.document"]}'), 'applied', 'account needs info');
select is((select onboarding_status from public.connected_accounts where stripe_account_id = 'acct_TestTeamB'), 'needs_info', 'status mirrors Stripe');
select is((select count(*)::int from public.notification_outbox where channel = 'in_app' and payload ->> 'change' = 'onboarding_action' and profile_id = 'abababab-abab-abab-abab-abababababab'), 1, 'the admin is told');
select public.svc_set_account_status('acct_TestTeamB', true, false, false, '{"currently_due":["individual.verification.document"]}');
select is((select count(*)::int from public.notification_outbox where channel = 'in_app' and payload ->> 'change' = 'onboarding_action' and profile_id = 'abababab-abab-abab-abab-abababababab'), 1, 'a replay does not notify again');
select public.svc_set_account_status('acct_TestTeamB', true, true, true, '{}');
select is((select onboarding_status || ':' || charges_enabled from public.connected_accounts where stripe_account_id = 'acct_TestTeamB'), 'ready:true', 'ready once charges are enabled');
select public.svc_set_account_status('acct_TestTeamB', true, false, false, '{}');
select is((select onboarding_status from public.connected_accounts where stripe_account_id = 'acct_TestTeamB'), 'in_review', 'submitted but not yet enabled is in review');
select public.svc_set_account_status('acct_TestTeamB', true, true, true, '{}', true);
select is((select onboarding_status || ':' || charges_enabled from public.connected_accounts where stripe_account_id = 'acct_TestTeamB'), 'disconnected:false', 'deauthorization disables charges');
select is(public.svc_set_account_status('acct_Nobody', true, true, true), 'unknown_account', 'an account we do not know is ignored');
-- ledger
select is(public.svc_ledger_event('evt_1', 'payment_intent.succeeded', false, null, '{}'), 'new', 'first delivery is new');
select is(public.svc_ledger_event('evt_1', 'payment_intent.succeeded', false, null, '{}'), 'retry', 'a delivery seen but not finished is processed again');
select public.svc_finish_event('evt_1', 'boom');
select is(public.svc_ledger_event('evt_1', 'payment_intent.succeeded', false, null, '{}'), 'retry', 'a failed event stays retryable');
select public.svc_finish_event('evt_1');
select is(public.svc_ledger_event('evt_1', 'payment_intent.succeeded', false, null, '{}'), 'duplicate', 'a finished event is a duplicate (no-op)');
select is((select count(*)::int from public.stripe_webhook_events where stripe_event_id = 'evt_1'), 1, 'only one ledger row');
reset role; select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.svc_payment_succeeded('pi_A') $$, '42501', null, 'clients cannot call the handlers');
select throws_ok($$ select public.svc_ledger_event('evt_x', 't', false, null, '{}') $$, '42501', null, 'clients cannot write the ledger');
select throws_ok($$ select public.svc_set_account_status('acct_TestTeamA', true, true, true) $$, '42501', null, 'clients cannot set account status');

select * from finish();
rollback;
