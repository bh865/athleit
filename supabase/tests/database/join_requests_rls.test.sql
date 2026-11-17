-- RLS tests for public.join_requests
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
  ('b2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-00000000000b', 'a4444444-4444-4444-4444-444444444444', '92000000-0000-0000-0000-000000000002');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.join_requests $$, '42501', null, 'anonymous users cannot read join requests');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.join_requests), 1, 'a requester reads only their own requests');
select throws_ok($$ insert into public.join_requests (team_id, requester_id) values ('a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222') $$, '42501', null, 'requests cannot be inserted directly');
select throws_ok($$ update public.join_requests set status = 'approved' $$, '42501', null, 'a requester cannot approve their own request');
select throws_ok($$ delete from public.join_requests $$, '42501', null, 'requests cannot be deleted by clients');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.join_requests), 1, 'team staff read their team''s queue only');
select is_empty($$ select 1 from public.join_requests where team_id = 'a2000000-0000-0000-0000-00000000000b' $$, 'staff cannot read another team''s requests');
select throws_ok($$ update public.join_requests set status = 'approved' $$, '42501', null, 'staff must use decide_join_request');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.join_requests $$, 'a parent member of the team cannot read the queue');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.join_requests), 1, 'another family reads only their own request');
reset role;
select is_empty($$ select 1 from public.team_memberships where profile_id = 'a2222222-2222-2222-2222-222222222222' $$, 'a pending request grants no membership');
select * from finish();
rollback;
