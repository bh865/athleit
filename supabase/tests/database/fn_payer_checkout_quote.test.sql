-- public.payer_checkout_quote
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

reset role; select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is((public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001']::uuid[]) ->> 'total_cents')::int, 4500, 'a single absorb request quotes the base ($45.00, no Athleit charge in the initial config)');
select is((public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001']::uuid[]) -> 'lines' -> 0 ->> 'label'), 'Jersey fee', 'the item line uses the event title (no child name)');
select ok((select not (public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001']::uuid[])::text ilike '%Ava%') ), 'the quote contains no child name');
select is((public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000003']::uuid[]) ->> 'total_cents')::int, 9000, 'several requests of one household sum');
select is(jsonb_array_length(public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000003']::uuid[]) -> 'items'), 2, 'one item per request');
select is((public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001']::uuid[]) ->> 'total_cents')::int, 4500, 'a duplicated id counts once');
select is((public.payer_checkout_quote(array['b4000000-0000-0000-0000-000000000004']::uuid[]) ->> 'total_cents')::int, 2683, 'pass_on with a 50c + 1% Athleit charge: $25.00 -> $26.83');
select is((public.payer_checkout_quote(array['b4000000-0000-0000-0000-000000000004']::uuid[]) ->> 'platform_fee_cents')::int, 75, 'the Athleit charge is 75c (50c + 1% of $25.00)');
select is((public.payer_checkout_quote(array['b4000000-0000-0000-0000-000000000004']::uuid[]) ->> 'processing_fee_cents')::int, 108, 'the service fee is $1.08');
select is((select string_agg(l ->> 'kind', ',') from jsonb_array_elements(public.payer_checkout_quote(array['b4000000-0000-0000-0000-000000000004']::uuid[]) -> 'lines') l), 'item,athleit_charge,service_fee', 'line items: item, Athleit charge, service fee');
select is((select sum((l ->> 'amount_cents')::int) from jsonb_array_elements(public.payer_checkout_quote(array['b4000000-0000-0000-0000-000000000004']::uuid[]) -> 'lines') l), 2683::bigint, 'the lines sum to the total, to the cent');
select is((select sum((i ->> 'platform_fee_cents')::int + (i ->> 'processing_fee_passthrough_cents')::int + (i ->> 'amount_cents')::int) from jsonb_array_elements(public.payer_checkout_quote(array['b4000000-0000-0000-0000-000000000004']::uuid[]) -> 'items') i), 2683::bigint, 'the per-item allocation also sums to the total');
select is(public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001']::uuid[]) ->> 'request_set_key', md5('b1000000-0000-0000-0000-000000000001'), 'the set key is derived from the request ids');
select is((select count(*)::int from jsonb_object_keys(public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001']::uuid[])) k where k in ('client_amount', 'amount')), 0, 'there is no client-supplied amount anywhere in the quote');
select throws_ok($$ select public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001']::uuid[], 100) $$, '42883', null, 'the function accepts no amount argument at all (extra arguments do not exist)');
select throws_ok($$ select public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000004']::uuid[]) $$, '23514', 'mixed_checkout', 'requests with different fee terms cannot share a payment');
select throws_ok($$ select public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000005']::uuid[]) $$, '23514', 'mixed_checkout', 'nor requests owed to different payees (team vs club)');
select throws_ok($$ select public.payer_checkout_quote(array['b2000000-0000-0000-0000-000000000002']::uuid[]) $$, '42501', 'not_authorized', 'paying another family''s request is refused');
select throws_ok($$ select public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002']::uuid[]) $$, '42501', 'not_authorized', 'including one foreign request refuses the whole set');
select throws_ok($$ select public.payer_checkout_quote(array['00000000-0000-0000-0000-000000000099']::uuid[]) $$, '42501', 'not_authorized', 'an unknown id looks the same as a foreign one');
select throws_ok($$ select public.payer_checkout_quote(array[]::uuid[]) $$, '22023', 'invalid_request_set', 'an empty set is rejected');
select throws_ok($$ select public.payer_checkout_quote(null) $$, '22023', 'invalid_request_set', 'null is rejected');
select throws_ok($$ select public.payer_checkout_quote((select array_agg(gen_random_uuid()) from generate_series(1, 26))) $$, '22023', 'invalid_request_set', 'more than 25 is rejected');
reset role; select pg_temp.login('a4444444-4444-4444-4444-444444444444');
select throws_ok($$ select public.payer_checkout_quote(array['b7000000-0000-0000-0000-000000000007']::uuid[]) $$, '23514', 'account_not_ready', 'a team whose account cannot take charges cannot be paid');
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select throws_ok($$ select public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001']::uuid[]) $$, '42501', 'not_authorized', 'staff are not payers');
reset role; select pg_temp.login('a7777777-7777-7777-7777-777777777777');
select throws_ok($$ select public.payer_checkout_quote(array['b3000000-0000-0000-0000-000000000003']::uuid[]) $$, '42501', 'not_authorized', 'a 13+ player cannot pay (guardians only by default)');
reset role; select pg_temp.anon();
select throws_ok($$ select public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001']::uuid[]) $$, '42501', null, 'anonymous cannot quote');
reset role;
-- States that must not be payable.
update public.payment_requests set status = 'processing' where id = 'b1000000-0000-0000-0000-000000000001';
insert into public.payments (id, stripe_payment_intent_id, connected_account_id, household_id, fee_policy, base_cents, total_charged_cents, estimated_stripe_fee_cents, request_set_key) values
  ('d1000000-0000-0000-0000-000000000002', 'pi_Open', 'ca000000-0000-0000-0000-00000000000a', '11000000-0000-0000-0000-000000000001', 'absorb', 4500, 4500, 161, 'setkeyopen');
insert into public.payment_items (payment_id, payment_request_id, amount_cents) values ('d1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 4500);
update public.payment_requests set status = 'paid', paid_at = now() where id = 'b3000000-0000-0000-0000-000000000003';
update public.payment_events set status = 'cancelled' where id = 'e2000000-0000-0000-0000-000000000002';
reset role; select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.payer_checkout_quote(array['b1000000-0000-0000-0000-000000000001']::uuid[]) $$, '23514', 'request_not_payable', 'a request already in a payment cannot be paid again (processing)');
select throws_ok($$ select public.payer_checkout_quote(array['b3000000-0000-0000-0000-000000000003']::uuid[]) $$, '23514', 'request_not_payable', 'a paid request cannot be paid again');
select throws_ok($$ select public.payer_checkout_quote(array['b4000000-0000-0000-0000-000000000004']::uuid[]) $$, '23514', 'request_not_payable', 'a request of a cancelled event cannot be paid');

select * from finish();
rollback;
