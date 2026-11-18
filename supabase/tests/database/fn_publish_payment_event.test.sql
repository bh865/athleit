-- public.publish_payment_event
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
select throws_ok($$ select public.publish_payment_event('e4000000-0000-0000-0000-000000000004') $$, '42501', 'not_authorized', 'a parent cannot publish');
reset role; select pg_temp.login('a6666666-6666-6666-6666-666666666666');
select throws_ok($$ select public.publish_payment_event('e4000000-0000-0000-0000-000000000004') $$, '42501', 'not_authorized', 'other teams'' staff cannot publish');
reset role; select pg_temp.login('a5555555-5555-5555-5555-555555555555');
select throws_ok($$ select public.publish_payment_event('e4000000-0000-0000-0000-000000000004') $$, '42501', 'not_authorized', 'a club admin cannot publish a team''s event');
reset role; select pg_temp.anon();
select throws_ok($$ select public.publish_payment_event('e4000000-0000-0000-0000-000000000004') $$, '42501', null, 'anonymous cannot publish');
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select is(public.publish_payment_event('e4000000-0000-0000-0000-000000000004'), 3, 'publishing issues one request per active rostered player (Ava, Ben, Teen; not inactive Dan)');
select is((select status from public.payment_events where id = 'e4000000-0000-0000-0000-000000000004'), 'published', 'the event is published');
select ok((select published_at is not null and connected_account_id = 'ca000000-0000-0000-0000-00000000000a' from public.payment_events where id = 'e4000000-0000-0000-0000-000000000004'), 'it records when and which account');
select is((select (fee_config ->> 'stripe_fee_bps') || '/' || (fee_config ->> 'platform_fee_bps') from public.payment_events where id = 'e4000000-0000-0000-0000-000000000004'), '290/0', 'the fee config is snapshotted');
select is((select count(distinct display_id)::int from public.payment_requests where payment_event_id = 'e4000000-0000-0000-0000-000000000004'), 3, 'each request gets its own display id');
select ok((select bool_and(display_id ~ '^PR-[0-9]+$' and amount_cents = 4500 and status = 'unpaid') from public.payment_requests where payment_event_id = 'e4000000-0000-0000-0000-000000000004'), 'display ids look like PR-n; amounts come from the event; all unpaid');
select is((select count(*)::int from public.payment_requests where payment_event_id = 'e4000000-0000-0000-0000-000000000004' and player_id = '96000000-0000-0000-0000-000000000006'), 0, 'an inactive player gets no request');
reset role;
select is((select count(*)::int from public.notification_outbox where category = 'payments' and channel = 'in_app'), 2, 'two households are notified (Ava''s two kids produce ONE notification), through the payments category');
select is((select count(*)::int from public.notification_outbox where category = 'payments' and profile_id = 'a7777777-7777-7777-7777-777777777777'), 0, 'a player with a login is not a payer and is not notified');
select is((select payload ->> 'kind' from public.notification_outbox where category = 'payments' and profile_id = 'a3333333-3333-3333-3333-333333333333' and channel = 'in_app'), 'payment', 'the payload is a payment notification');
select ok((select payload ->> 'request_id' is not null from public.notification_outbox where category = 'payments' and profile_id = 'a3333333-3333-3333-3333-333333333333' and channel = 'in_app'), 'a single-request household gets a deep link to the exact request');
select ok((select payload ->> 'request_id' is null and (payload ->> 'count')::int = 2 from public.notification_outbox where category = 'payments' and profile_id = 'a2222222-2222-2222-2222-222222222222' and channel = 'in_app'), 'a two-request household gets the list');
select ok((select not (payload::text ilike '%Ava%' or payload::text ilike '%Adams%') from public.notification_outbox where category = 'payments' and profile_id = 'a2222222-2222-2222-2222-222222222222' and channel = 'in_app'), 'notifications carry no child names');
select is((select count(*)::int from public.audit_log where action = 'payment_event.publish' and target_id = 'e4000000-0000-0000-0000-000000000004'), 1, 'publishing is audited');
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select throws_ok($$ select public.publish_payment_event('e4000000-0000-0000-0000-000000000004') $$, '23514', 'not_draft', 'publishing twice is rejected (no duplicate requests)');
select throws_ok($$ select public.publish_payment_event('e1000000-0000-0000-0000-000000000001') $$, '23514', 'not_draft', 'an already published event cannot be re-published');
reset role;
-- Account that cannot take charges: publishing is refused.
insert into public.payment_events (id, team_id, title, amount_cents, due_at, fee_policy, status, created_by) values
  ('e6000000-0000-0000-0000-000000000006', 'a2000000-0000-0000-0000-00000000000b', 'Late draft', 2000, now() + interval '9 days', 'absorb', 'draft', 'abababab-abab-abab-abab-abababababab');
reset role; select pg_temp.login('a6666666-6666-6666-6666-666666666666');
select throws_ok($$ select public.publish_payment_event('e6000000-0000-0000-0000-000000000006') $$, '23514', 'charges_not_enabled', 'publishing requires charges_enabled on the connected account');
reset role;
update public.connected_accounts set charges_enabled = true where id = 'ca000000-0000-0000-0000-00000000000b';
reset role; select pg_temp.login('a6666666-6666-6666-6666-666666666666');
select is(public.publish_payment_event('e6000000-0000-0000-0000-000000000006'), 1, 'once charges are enabled it publishes (Team B: only Cleo)');
reset role;
-- No account at all.
insert into public.teams (id, name, sport, season_label, join_code) values ('a3000000-0000-0000-0000-00000000000c', 'Team C', 'soccer', 'Fall 2026', 'TEAMC00003');
insert into public.team_memberships (team_id, profile_id, role) values ('a3000000-0000-0000-0000-00000000000c', 'a9999999-9999-9999-9999-999999999999', 'admin');
insert into public.payment_events (id, team_id, title, amount_cents, due_at, status) values ('e7000000-0000-0000-0000-000000000007', 'a3000000-0000-0000-0000-00000000000c', 'No account', 2000, now() + interval '9 days', 'draft');
reset role; select pg_temp.login('a9999999-9999-9999-9999-999999999999');
select throws_ok($$ select public.publish_payment_event('e7000000-0000-0000-0000-000000000007') $$, '23514', 'charges_not_enabled', 'a team with no connected account cannot publish');
reset role;
-- Selected players: all must be on the roster; the published set is exactly the selection.
insert into public.payment_events (id, team_id, title, amount_cents, due_at, audience, audience_player_ids, status) values
  ('e8000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-00000000000a', 'Two only', 3000, now() + interval '9 days', 'selected_players', array['91000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002']::uuid[], 'draft'),
  ('e9000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-00000000000a', 'Wrong roster', 3000, now() + interval '9 days', 'selected_players', array['91000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000003']::uuid[], 'draft');
reset role; select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select is(public.publish_payment_event('e8000000-0000-0000-0000-000000000008'), 2, 'selected players: only those players get requests');
select throws_ok($$ select public.publish_payment_event('e9000000-0000-0000-0000-000000000009') $$, '23514', 'player_not_on_roster', 'a player from another team''s roster is rejected, not silently dropped');
select is((select status from public.payment_events where id = 'e9000000-0000-0000-0000-000000000009'), 'draft', 'and the event stays a draft');
reset role;
-- Club-issued: players on every team linked to the club (Team A, not Team B).
insert into public.payment_events (id, club_id, title, amount_cents, due_at, status) values
  ('ea000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000001', 'Club trip', 9000, now() + interval '9 days', 'draft');
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select throws_ok($$ select public.publish_payment_event('ea000000-0000-0000-0000-00000000000a') $$, '42501', 'not_authorized', 'a team coach cannot publish a club event');
reset role; select pg_temp.login('a5555555-5555-5555-5555-555555555555');
select is(public.publish_payment_event('ea000000-0000-0000-0000-00000000000a'), 3, 'a club event goes to players on teams linked to the club (Team A''s three), not Team B''s');

select * from finish();
rollback;
