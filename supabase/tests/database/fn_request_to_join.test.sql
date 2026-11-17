-- public.request_to_join
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'coach@example.test'),
  ('a2222222-2222-2222-2222-222222222222', 'parent@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'coachb@example.test'),
  ('a4444444-4444-4444-4444-444444444444', 'parent2@example.test'),
  ('a5555555-5555-5555-5555-555555555555', 'teen@example.test'),
  ('a6666666-6666-6666-6666-666666666666', 'assistant@example.test');
insert into public.teams (id, name, sport, season_label, join_code) values
  ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall', 'TEAMA00001'),
  ('a2000000-0000-0000-0000-00000000000b', 'Team B', 'soccer', 'Fall', 'TEAMB00002');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'admin'),
  ('a1000000-0000-0000-0000-00000000000a', 'a6666666-6666-6666-6666-666666666666', 'parent'),
  ('a2000000-0000-0000-0000-00000000000b', 'a3333333-3333-3333-3333-333333333333', 'admin');
insert into public.households (id, name) values ('11000000-0000-0000-0000-000000000001', 'P fam'), ('22000000-0000-0000-0000-000000000002', 'P2 fam');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222'),
  ('22000000-0000-0000-0000-000000000002', 'a4444444-4444-4444-4444-444444444444');
insert into public.players (id, household_id, first_name, last_name, date_of_birth, profile_id) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '10 years', null),
  ('92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'Pia', 'Park', current_date - interval '9 years', null),
  ('93000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 'Teen', 'Adams', current_date - interval '15 years', 'a5555555-5555-5555-5555-555555555555');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.request_to_join('TEAMA00001') $$, '42501', null, 'anonymous users cannot request to join');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.request_to_join(' teama00001 ', null, '91000000-0000-0000-0000-000000000001', 'Hi coach') $$, 'a parent can request to join by team code (case/space-insensitive)');
select is((select status::text from public.join_requests), 'pending', 'the request starts pending');
select is((select count(*)::int from public.team_memberships where profile_id = 'a2222222-2222-2222-2222-222222222222'), 0, 'a team code grants no access directly');
select is_empty($$ select * from public.get_team_roster('a1000000-0000-0000-0000-00000000000a') $$, 'the requester cannot read the roster while pending');
select is_empty($$ select 1 from public.teams $$, 'the requester cannot read the team while pending');
select throws_ok($$ select public.request_to_join('TEAMA00001', null, '91000000-0000-0000-0000-000000000001') $$, '23505', null, 'a duplicate pending request is rejected');
select lives_ok($$ select public.request_to_join(null, 'a2000000-0000-0000-0000-00000000000b', '93000000-0000-0000-0000-000000000003') $$, 'a guardian can request by team id for another child');
select throws_ok($$ select public.request_to_join('NOPE000000') $$, 'P0001', 'team_not_found', 'an unknown code fails');
select throws_ok($$ select public.request_to_join('TEAMA00001', 'a1000000-0000-0000-0000-00000000000a') $$, 'P0001', 'invalid_target', 'code and id together are rejected');
select throws_ok($$ select public.request_to_join() $$, 'P0001', 'invalid_target', 'a target is required');
select throws_ok($$ select public.request_to_join('TEAMB00002', null, '92000000-0000-0000-0000-000000000002') $$, '42501', null, 'cannot request on behalf of another family''s child');
select throws_ok($$ select public.request_to_join('TEAMB00002', null, null, repeat('x', 501)) $$, '23514', null, 'an over-long message is rejected');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.request_to_join('TEAMA00001') $$, 'P0001', 'already_member', 'an existing member cannot re-request without a child');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.request_to_join('TEAMA00001', null, '93000000-0000-0000-0000-000000000003') $$, 'a 13+ player can request for themself');
reset role;
select is((select count(*)::int from public.audit_log where created_at = now() and action = 'join_request.create'), 3, 'requests are audited');
select * from finish();
rollback;
