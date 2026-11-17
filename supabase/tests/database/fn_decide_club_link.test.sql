-- public.decide_club_link
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'c@example.test'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'd@example.test'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'e@example.test');
-- Club 1: admin E, manager B. T1 (admin A) is independent; T2 (admin D) is independent.
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
insert into public.club_memberships (club_id, profile_id, role) values
  ('c1000000-0000-0000-0000-000000000001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'admin'),
  ('c1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'manager');
insert into public.teams (id, name, sport, season_label) values
  ('a1000000-0000-0000-0000-000000000001', 'U10 Hawks', 'soccer', 'Fall 2026'),
  ('a2000000-0000-0000-0000-000000000002', 'U12 Owls', 'hockey', 'Winter 2026');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
  ('a1000000-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'coach'),
  ('a2000000-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin');
insert into public.team_club_link_requests (id, team_id, club_id, requested_by) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('b2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.decide_club_link('b1000000-0000-0000-0000-000000000001', true) $$, '42501', null, 'anonymous users cannot decide');
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.decide_club_link('b1000000-0000-0000-0000-000000000001', true) $$, '42501', null, 'the requesting team admin cannot approve their own request');
reset role; select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.decide_club_link('b1000000-0000-0000-0000-000000000001', true) $$, '42501', null, 'a club manager (not admin) cannot approve');
reset role; select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.decide_club_link('b1000000-0000-0000-0000-000000000001', true) $$, '42501', null, 'an unrelated user cannot approve');
reset role; select set_config('request.jwt.claims', '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.decide_club_link('b1000000-0000-0000-0000-000000000001', true) $$, 'a club admin can approve');
select is((select club_id::text from public.teams where id = 'a1000000-0000-0000-0000-000000000001'), 'c1000000-0000-0000-0000-000000000001', 'approval sets the team''s club_id');
select throws_ok($$ select public.decide_club_link('b1000000-0000-0000-0000-000000000001', false) $$, 'P0001', 'request_not_pending', 'a decided request cannot be decided again');
select lives_ok($$ select public.decide_club_link('b2000000-0000-0000-0000-000000000002', false) $$, 'a club admin can decline');
select is((select club_id from public.teams where id = 'a2000000-0000-0000-0000-000000000002'), null, 'decline leaves the team independent');
select is((select count(*)::int from public.teams), 1, 'club admin now reads the linked team only');
select is_empty($$ update public.teams set name = 'Club edit' returning 1 $$, 'club admin still cannot edit the linked team');
reset role;
select is((select status::text from public.team_club_link_requests where id = 'b2000000-0000-0000-0000-000000000002'), 'declined', 'declined status is recorded');
select is((select count(*)::int from public.audit_log where action in ('club_link.approve', 'club_link.decline', 'team.affiliation_change')), 3, 'approval, decline and the affiliation change are audited');
select * from finish();
rollback;
