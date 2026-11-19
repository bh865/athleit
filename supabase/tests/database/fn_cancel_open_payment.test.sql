-- public.household_open_payments / cancel_open_payment
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


-- Ava's parent starts a payment and walks away: two requests are reserved.
reset role;
select public.svc_reserve_payment('a2222222-2222-2222-2222-222222222222', array['b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000003']::uuid[]);
select is((select count(*)::int from public.payment_requests where status = 'processing' and id in ('b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000003')), 2, 'both requests are reserved (processing)');

-- The family sees it; other families and staff do not.
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.household_open_payments()), 1, 'the guardian sees one unfinished payment');
select is((select cardinality(request_ids) from public.household_open_payments()), 2, 'with its two requests');
select is((select total_cents from public.household_open_payments()), 9000, 'and its server total');
select pg_temp.login('a3333333-3333-3333-3333-333333333333');
select is((select count(*)::int from public.household_open_payments()), 0, 'another family sees none');
select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.household_open_payments()), 0, 'staff see none');
select pg_temp.anon();
select throws_ok($$ select public.cancel_open_payment((select id from public.payments where household_id = '11000000-0000-0000-0000-000000000001')) $$, '42501', null, 'anonymous callers cannot cancel');

-- Only the family can cancel.
reset role; select pg_temp.login('a3333333-3333-3333-3333-333333333333');
select throws_ok($$ select public.cancel_open_payment((select id from public.payments where household_id = '11000000-0000-0000-0000-000000000001')) $$, '42501', 'not_authorized', 'another family cannot cancel it');
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select throws_ok($$ select public.cancel_open_payment((select id from public.payments where household_id = '11000000-0000-0000-0000-000000000001')) $$, '42501', 'not_authorized', 'staff cannot cancel it');

-- The guardian cancels: the payment is canceled and the requests are free again.
reset role; select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select lives_ok($$ select public.cancel_open_payment((select id from public.payments where household_id = '11000000-0000-0000-0000-000000000001')) $$, 'the guardian cancels the unfinished payment');
reset role;
select is((select status from public.payments where household_id = '11000000-0000-0000-0000-000000000001'), 'canceled', 'the payment is canceled');
select is((select count(*)::int from public.payment_requests where status = 'processing' and id in ('b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000003')), 0, 'no request is stuck in processing');
select is((select count(*)::int from public.payment_requests where id in ('b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000003') and status = 'unpaid'), 2, 'both are unpaid again');
select is((select count(*)::int from public.payment_items where is_active and payment_request_id in ('b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000003')), 0, 'and their items are released');
select is((select count(*)::int from public.audit_log where action = 'payment.cancel_open' and target_id in (select id from public.payments where household_id = '11000000-0000-0000-0000-000000000001')), 1, 'it is audited');
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.household_open_payments()), 0, 'it no longer shows as unfinished');
select throws_ok($$ select public.cancel_open_payment((select id from public.payments where household_id = '11000000-0000-0000-0000-000000000001')) $$, '23514', 'payment_not_open', 'a canceled payment cannot be canceled again');

-- The requests can be paid again.
reset role;
select is((public.svc_reserve_payment('a2222222-2222-2222-2222-222222222222', array['b1000000-0000-0000-0000-000000000001']::uuid[]) ->> 'reused')::boolean, false, 'a fresh payment can be started');

-- Money that has moved is never cancelled from here.
update public.payments set status = 'processing' where status = 'requires_payment_method' and household_id = '11000000-0000-0000-0000-000000000001';
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.household_open_payments()), 0, 'a payment already processing is not listed');
select throws_ok($$ select public.cancel_open_payment((select id from public.payments where status = 'processing' and household_id = '11000000-0000-0000-0000-000000000001')) $$, '23514', 'payment_not_open', 'and cannot be canceled');
reset role;
update public.payments set status = 'succeeded' where status = 'processing' and household_id = '11000000-0000-0000-0000-000000000001';
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.cancel_open_payment((select id from public.payments where status = 'succeeded' and household_id = '11000000-0000-0000-0000-000000000001')) $$, '23514', 'payment_not_open', 'a succeeded payment cannot be canceled');
reset role;

select * from finish();
rollback;
