-- public.request_club_link and public.find_club
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
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.request_club_link('a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous users cannot request a link');
select throws_ok($$ select * from public.find_club('riverside') $$, '42501', null, 'anonymous users cannot look up clubs');
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select is((select slug from public.find_club(' Riverside ')), 'riverside', 'a signed-in user can find a club by slug');
select is_empty($$ select * from public.find_club('nope') $$, 'unknown slug finds nothing');
select lives_ok($$ select public.request_club_link('a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001') $$, 'a team admin can request affiliation');
select throws_ok($$ select public.request_club_link('a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001') $$, '23505', null, 'a second pending request for the same club is rejected');
select throws_ok($$ select public.request_club_link('a2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001') $$, '42501', null, 'cannot request on behalf of another team');
reset role; select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.request_club_link('a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001') $$, '42501', null, 'a coach (not admin) cannot request affiliation');
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.request_club_link('a1000000-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999') $$, 'P0001', 'club_not_found', 'unknown club is rejected');
reset role;
select is((select count(*)::int from public.audit_log where created_at = now() and action = 'club_link.request'), 1, 'the request is audited');
select * from finish();
rollback;
