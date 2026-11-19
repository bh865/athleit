-- households.join_code, household_join_requests RLS, rotate/request/decide/get functions
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create function pg_temp.login(u uuid) returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true); end $f$;
create function pg_temp.anon() returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true); end $f$;

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'g1@example.test'),
  ('a2222222-2222-2222-2222-222222222222', 'g2@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'requester@example.test'),
  ('a4444444-4444-4444-4444-444444444444', 'other@example.test'),
  ('a5555555-5555-5555-5555-555555555555', 'spammer@example.test');
update public.profiles set display_name = 'Gia Guardian' where id = 'a1111111-1111-1111-1111-111111111111';
update public.profiles set display_name = 'Gus Guardian' where id = 'a2222222-2222-2222-2222-222222222222';
update public.profiles set display_name = 'Rae Requester' where id = 'a3333333-3333-3333-3333-333333333333';
insert into public.households (id, name, join_code) values
  ('11000000-0000-0000-0000-000000000001', 'Guardian fam', 'FAMILY0001'),
  ('22000000-0000-0000-0000-000000000002', 'Other fam', 'FAMILY0002');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111'),
  ('11000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222'),
  ('22000000-0000-0000-0000-000000000002', 'a4444444-4444-4444-4444-444444444444');
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '9 years');

-- Defaults -----------------------------------------------------------------------------------
reset role;
insert into public.households (id, name) values ('33000000-0000-0000-0000-000000000003', 'New fam');
select matches((select join_code from public.households where id = '33000000-0000-0000-0000-000000000003'), '^[A-Z0-9]{10}$',
  'a new household gets a 10-character upper-case code');

-- Rotate -------------------------------------------------------------------------------------
select pg_temp.anon();
select throws_ok($$ select public.rotate_household_join_code('11000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous users cannot rotate');
reset role; select pg_temp.login('a3333333-3333-3333-3333-333333333333');
select throws_ok($$ select public.rotate_household_join_code('11000000-0000-0000-0000-000000000001') $$, '42501', null, 'a non-guardian cannot rotate');
select is_empty($$ select 1 from public.households where id = '11000000-0000-0000-0000-000000000001' $$, 'a non-guardian cannot read the household or its code');
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.rotate_household_join_code('11000000-0000-0000-0000-000000000001') $$, 'a guardian can rotate');
select isnt((select join_code from public.households where id = '11000000-0000-0000-0000-000000000001'), 'FAMILY0001', 'the code changed');
select matches((select join_code from public.households where id = '11000000-0000-0000-0000-000000000001'), '^[A-Z0-9]{10}$', 'the new code has the right shape');
reset role;
select is((select count(*)::int from public.audit_log where created_at = now() and action = 'household.rotate_join_code'), 1, 'rotation is audited');
update public.households set join_code = 'FAMILY0001' where id = '11000000-0000-0000-0000-000000000001';

-- Requesting ---------------------------------------------------------------------------------
select pg_temp.anon();
select throws_ok($$ select * from public.request_to_join_household('FAMILY0001') $$, '42501', null, 'anonymous users cannot request');
reset role; select pg_temp.login('a3333333-3333-3333-3333-333333333333');
select is((select outcome from public.request_to_join_household('NOSUCHCODE')), 'invalid_code', 'an unknown code is rejected');
select is((select outcome from public.request_to_join_household('  family0001 ', 'Hi, I am Ava''s aunt')), 'sent', 'the code is trimmed and upper-cased');
select is((select outcome from public.request_to_join_household('FAMILY0001')), 'sent', 'a duplicate pending request succeeds quietly');
reset role;
select is((select count(*)::int from public.household_join_requests where requester_id = 'a3333333-3333-3333-3333-333333333333' and status = 'pending'), 1, 'only one pending request exists');
select pg_temp.login('a3333333-3333-3333-3333-333333333333');
select is((select count(*)::int from public.household_join_requests), 1, 'the requester reads their own request');
select is_empty($$ select 1 from public.households $$, 'a pending requester sees nothing of the household');
select is_empty($$ select 1 from public.players $$, 'and none of its children');
select throws_ok($$ insert into public.household_join_requests (household_id, requester_id) values ('11000000-0000-0000-0000-000000000001', 'a3333333-3333-3333-3333-333333333333') $$, '42501', null, 'nobody writes requests directly');
select throws_ok($$ select * from public.get_household_join_requests('11000000-0000-0000-0000-000000000001') $$, '42501', null, 'the requester cannot list requests');
select throws_ok($$ select * from public.get_household_guardians('11000000-0000-0000-0000-000000000001') $$, '42501', null, 'the requester cannot list guardians');
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select is((select outcome from public.request_to_join_household('FAMILY0001')), 'already_member', 'a member requesting their own family is told so');
select is((select count(*)::int from public.household_join_requests), 1, 'a guardian reads their household''s requests');
reset role; select pg_temp.login('a4444444-4444-4444-4444-444444444444');
select is_empty($$ select 1 from public.household_join_requests $$, 'guardians of another household cannot read them');
select throws_ok($$ select * from public.get_household_join_requests('11000000-0000-0000-0000-000000000001') $$, '42501', null, 'nor list them');

-- Listing ------------------------------------------------------------------------------------
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select is((select requester_name from public.get_household_join_requests('11000000-0000-0000-0000-000000000001')), 'Rae Requester', 'guardians see the requester name');
select is((select message from public.get_household_join_requests('11000000-0000-0000-0000-000000000001')), 'Hi, I am Ava''s aunt', 'and the message');
select is((select count(*)::int from public.get_household_guardians('11000000-0000-0000-0000-000000000001')), 2, 'guardians list both guardians');
select is((select is_you from public.get_household_guardians('11000000-0000-0000-0000-000000000001') where profile_id = 'a1111111-1111-1111-1111-111111111111'), true, 'the caller is flagged');
select is((select string_agg(display_name, ',' order by display_name) from public.get_household_guardians('11000000-0000-0000-0000-000000000001')), 'Gia Guardian,Gus Guardian', 'display names only');

-- Deciding -----------------------------------------------------------------------------------
reset role; select pg_temp.login('a3333333-3333-3333-3333-333333333333');
select throws_ok(format($$ select public.decide_household_join_request(%L, true) $$,
  (select id from public.household_join_requests where requester_id = 'a3333333-3333-3333-3333-333333333333')), '42501', null, 'a requester cannot approve their own request');
reset role; select pg_temp.login('a4444444-4444-4444-4444-444444444444');
select throws_ok(format($$ select public.decide_household_join_request(%L, true) $$,
  (select id from public.household_join_requests where requester_id = 'a3333333-3333-3333-3333-333333333333')), '42501', null, 'a guardian of another household cannot decide');
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select lives_ok(format($$ select public.decide_household_join_request(%L, true) $$,
  (select id from public.household_join_requests where requester_id = 'a3333333-3333-3333-3333-333333333333')), 'a guardian can approve');
select lives_ok(format($$ select public.decide_household_join_request(%L, true) $$,
  (select id from public.household_join_requests where requester_id = 'a3333333-3333-3333-3333-333333333333')), 'a second approval is a no-op');
select throws_ok(format($$ select public.decide_household_join_request(%L, false) $$,
  (select id from public.household_join_requests where requester_id = 'a3333333-3333-3333-3333-333333333333')), 'P0001', 'request_not_pending', 'a conflicting second decision is refused');
reset role;
select is((select count(*)::int from public.household_members where household_id = '11000000-0000-0000-0000-000000000001' and profile_id = 'a3333333-3333-3333-3333-333333333333'), 1, 'approval creates one guardian membership');
select is((select count(*)::int from public.notification_outbox where profile_id = 'a3333333-3333-3333-3333-333333333333' and channel = 'in_app' and payload ->> 'kind' = 'family_access'), 1, 'the requester is notified once');
select is((select count(*)::int from public.audit_log where created_at = now() and action = 'household_join_request.approve'), 1, 'approval is audited once');
select pg_temp.login('a3333333-3333-3333-3333-333333333333');
select is((select count(*)::int from public.players), 1, 'the new guardian sees every child');
select is((select count(*)::int from public.get_household_guardians('11000000-0000-0000-0000-000000000001')), 3, 'and is listed as a guardian');
reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select is_empty($$ select 1 from public.get_household_join_requests('11000000-0000-0000-0000-000000000001') $$, 'decided requests leave the pending list');

-- Decline ------------------------------------------------------------------------------------
reset role; select pg_temp.login('a5555555-5555-5555-5555-555555555555');
select is((select outcome from public.request_to_join_household('FAMILY0001')), 'sent', 'another user requests');
reset role; select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select lives_ok(format($$ select public.decide_household_join_request(%L, false) $$,
  (select id from public.household_join_requests where requester_id = 'a5555555-5555-5555-5555-555555555555')), 'a guardian can decline');
reset role;
select is((select count(*)::int from public.household_members where profile_id = 'a5555555-5555-5555-5555-555555555555'), 0, 'declining grants nothing');
select is((select count(*)::int from public.notification_outbox where profile_id = 'a5555555-5555-5555-5555-555555555555'), 0, 'and notifies nobody');

-- Rotation invalidates the old code ---------------------------------------------------------
select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select public.rotate_household_join_code('11000000-0000-0000-0000-000000000001');
reset role; select pg_temp.login('a4444444-4444-4444-4444-444444444444');
select is((select outcome from public.request_to_join_household('FAMILY0001')), 'invalid_code', 'the old code no longer works');

-- Attempt limit ------------------------------------------------------------------------------
reset role; select pg_temp.login('a5555555-5555-5555-5555-555555555555');
select lives_ok($$ select (public.request_to_join_household('BADCODE' || g)).outcome from generate_series(1, 12) g $$, 'repeated bad codes do not error');
reset role; select pg_temp.login('a5555555-5555-5555-5555-555555555555');
select is((select outcome from public.request_to_join_household('BADCODE99')), 'too_many_attempts', 'too many attempts are refused');
reset role;
select * from finish();
rollback;
