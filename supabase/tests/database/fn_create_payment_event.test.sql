-- public.create_payment_event, public.update_payment_event
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
update public.connected_accounts set default_fee_policy = 'pass_on' where id = 'ca000000-0000-0000-0000-00000000000a';
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.create_payment_event('a1000000-0000-0000-0000-00000000000a', null, 'Uniforms', 'Home kit', 6000, now() + interval '20 days') $$, 'team staff can create a draft');
select is((select status || ':' || fee_policy || ':' || amount_cents from public.payment_events where title = 'Uniforms'), 'draft:pass_on:6000', 'it starts as a draft and takes the account''s default fee policy (pass_on here)') ;
select is((select count(*)::int from public.payment_requests where payment_event_id = (select id from public.payment_events where title = 'Uniforms')), 0, 'a draft creates no requests');
select lives_ok($$ select public.create_payment_event('a1000000-0000-0000-0000-00000000000a', null, 'Explicit', null, 6000, now() + interval '20 days', 'all_active_roster', null, 'absorb') $$, 'the policy can be set explicitly');
select is((select fee_policy from public.payment_events where title = 'Explicit'), 'absorb', 'and is honored');
select lives_ok($$ select public.create_payment_event('a1000000-0000-0000-0000-00000000000a', null, 'Two kids', null, 6000, now() + interval '20 days', 'selected_players', array['91000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002']::uuid[]) $$, 'a selected-players draft is allowed');
select throws_ok($$ select public.create_payment_event('a1000000-0000-0000-0000-00000000000a', null, 'x', null, 6000, now(), 'selected_players', null) $$, '23514', null, 'selected_players needs a list');
select throws_ok($$ select public.create_payment_event('a1000000-0000-0000-0000-00000000000a', null, 'x', null, 10, now()) $$, '23514', null, 'amounts below Stripe''s minimum are rejected');
select throws_ok($$ select public.create_payment_event(null, null, 'x', null, 6000, now()) $$, '42501', 'not_authorized', 'an issuer is required');
select throws_ok($$ select public.create_payment_event('a1000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000001', 'x', null, 6000, now()) $$, '42501', 'not_authorized', 'exactly one issuer');
select throws_ok($$ select public.create_payment_event('a2000000-0000-0000-0000-00000000000b', null, 'x', null, 6000, now()) $$, '42501', 'not_authorized', 'staff of another team cannot issue for this one');
select throws_ok($$ select public.create_payment_event(null, 'c1000000-0000-0000-0000-000000000001', 'x', null, 6000, now()) $$, '42501', 'not_authorized', 'a team coach cannot issue as the club');
reset role; select pg_temp.login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select lives_ok($$ select public.create_payment_event('a1000000-0000-0000-0000-00000000000a', null, 'By manager', null, 6000, now() + interval '5 days') $$, 'a manager can create');
reset role; select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.create_payment_event('a1000000-0000-0000-0000-00000000000a', null, 'x', null, 6000, now()) $$, '42501', 'not_authorized', 'a parent cannot create payment events');
reset role; select pg_temp.login('a5555555-5555-5555-5555-555555555555');
select lives_ok($$ select public.create_payment_event(null, 'c1000000-0000-0000-0000-000000000001', 'Club trip', null, 9000, now() + interval '20 days') $$, 'a club admin can issue for the club');
select throws_ok($$ select public.create_payment_event('a1000000-0000-0000-0000-00000000000a', null, 'x', null, 6000, now()) $$, '42501', 'not_authorized', 'but not for a linked team');
reset role; select pg_temp.anon();
select throws_ok($$ select public.create_payment_event('a1000000-0000-0000-0000-00000000000a', null, 'x', null, 6000, now()) $$, '42501', null, 'anonymous cannot create');
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.update_payment_event('e4000000-0000-0000-0000-000000000004', 'Spring dues 2', 'desc', 5500, now() + interval '40 days', 'all_active_roster', null, 'pass_on') $$, 'a draft can be updated');
select is((select title || ':' || amount_cents || ':' || fee_policy from public.payment_events where id = 'e4000000-0000-0000-0000-000000000004'), 'Spring dues 2:5500:pass_on', 'the changes are stored');
select throws_ok($$ select public.update_payment_event('e1000000-0000-0000-0000-000000000001', 'x', null, 5500, now(), 'all_active_roster', null, 'absorb') $$, '23514', 'not_draft', 'a published event cannot be edited');
reset role; select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.update_payment_event('e4000000-0000-0000-0000-000000000004', 'x', null, 5500, now(), 'all_active_roster', null, 'absorb') $$, '42501', 'not_authorized', 'a parent cannot edit a draft');
reset role; select pg_temp.login('a6666666-6666-6666-6666-666666666666');
select throws_ok($$ select public.update_payment_event('e4000000-0000-0000-0000-000000000004', 'x', null, 5500, now(), 'all_active_roster', null, 'absorb') $$, '42501', 'not_authorized', 'other teams'' staff cannot edit it');
reset role;
select is((select count(*)::int from public.audit_log where action = 'payment_event.create'), 5, 'every creation is audited');
select is((select count(*)::int from public.audit_log where action = 'payment_event.update'), 1, 'the update is audited');

select * from finish();
rollback;
