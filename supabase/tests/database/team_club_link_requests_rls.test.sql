-- RLS tests for public.team_club_link_requests
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
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.team_club_link_requests $$, '42501', null, 'anonymous users cannot read link requests');
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.team_club_link_requests), 1, 'team admin reads their team''s request');
select throws_ok($$ insert into public.team_club_link_requests (team_id, club_id) values ('a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001') $$, '42501', null, 'requests cannot be inserted directly');
select throws_ok($$ update public.team_club_link_requests set status = 'approved' $$, '42501', null, 'a team cannot approve its own request');
reset role; select set_config('request.jwt.claims', '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.team_club_link_requests), 1, 'club admin reads requests addressed to their club');
select throws_ok($$ delete from public.team_club_link_requests $$, '42501', null, 'requests cannot be deleted by clients');
reset role; select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.team_club_link_requests $$, 'a coach (not admin) cannot read the team''s request');
reset role; select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.team_club_link_requests $$, 'a club manager cannot read requests (admin only)');
reset role; select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.team_club_link_requests $$, 'an unrelated team admin reads nothing');
reset role;
select is((select club_id from public.teams where id = 'a1000000-0000-0000-0000-000000000001'), null, 'a pending request does not affiliate the team');
select * from finish();
rollback;
