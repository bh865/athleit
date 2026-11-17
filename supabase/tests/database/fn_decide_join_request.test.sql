-- public.decide_join_request
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
insert into public.join_requests (id, team_id, requester_id, player_id) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', '91000000-0000-0000-0000-000000000001'),
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 'a4444444-4444-4444-4444-444444444444', '92000000-0000-0000-0000-000000000002'),
  ('b3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-00000000000a', 'a5555555-5555-5555-5555-555555555555', '93000000-0000-0000-0000-000000000003');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.decide_join_request('b1000000-0000-0000-0000-000000000001', true) $$, '42501', null, 'anonymous users cannot decide');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.decide_join_request('b1000000-0000-0000-0000-000000000001', true) $$, '42501', null, 'a requester cannot approve their own request');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.decide_join_request('b1000000-0000-0000-0000-000000000001', true) $$, '42501', null, 'a parent member cannot decide');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.decide_join_request('b1000000-0000-0000-0000-000000000001', true) $$, '42501', null, 'staff of another team cannot decide');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.players), 3, 'staff can see the children named on pending requests (to decide)');
select is_empty($$ select * from public.get_guardian_contacts('91000000-0000-0000-0000-000000000001') $$, 'but not guardian contacts until rostered');
select lives_ok($$ select public.decide_join_request('b1000000-0000-0000-0000-000000000001', true) $$, 'staff can approve');
select is((select role::text from public.team_memberships where profile_id = 'a2222222-2222-2222-2222-222222222222'), 'parent', 'approval grants a parent membership');
select lives_ok($$ select public.decide_join_request('b2000000-0000-0000-0000-000000000002', false) $$, 'staff can decline');
select is((select count(*)::int from public.team_memberships where profile_id = 'a4444444-4444-4444-4444-444444444444'), 0, 'a declined request grants nothing');
select is_empty($$ select 1 from public.players where id = '92000000-0000-0000-0000-000000000002' $$, 'a declined child is no longer visible to staff');
select throws_ok($$ select public.decide_join_request('b1000000-0000-0000-0000-000000000001', false) $$, 'P0001', 'request_not_pending', 'cannot decide twice');
select lives_ok($$ select public.decide_join_request('b3000000-0000-0000-0000-000000000003', true) $$, 'a 13+ player''s own request can be approved');
select is((select role::text from public.team_memberships where profile_id = 'a5555555-5555-5555-5555-555555555555'), 'player', 'a player requesting for themself joins as a player');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.teams), 1, 'after approval the parent can read the team');
select is((select count(*)::int from public.get_team_roster('a1000000-0000-0000-0000-00000000000a')), 0, 'and the (empty) roster via the limited function');
reset role;
select is((select count(*)::int from public.audit_log where created_at = now() and action in ('join_request.approve', 'join_request.decline')), 3, 'decisions are audited');
select * from finish();
rollback;
