-- public.get_team_members (+ audit_log team-admin policy)
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'c@example.test'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'd@example.test'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'e@example.test');
-- Club 1 (admin: E) has team T1 (admin A, coach B, parent C). Team T2 is independent (admin D).
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
insert into public.club_memberships (club_id, profile_id, role) values ('c1000000-0000-0000-0000-000000000001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'admin');
insert into public.teams (id, name, sport, season_label, club_id, join_code) values
  ('a1000000-0000-0000-0000-000000000001', 'U10 Hawks', 'soccer', 'Fall 2026', 'c1000000-0000-0000-0000-000000000001', 'HAWKS00001'),
  ('a2000000-0000-0000-0000-000000000002', 'U12 Owls', 'hockey', 'Winter 2026', null, 'OWLS000002');
insert into public.team_memberships (id, team_id, profile_id, role) values
  ('f0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
  ('f0000000-0000-0000-0000-00000000000b', 'a1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'coach'),
  ('f0000000-0000-0000-0000-00000000000c', 'a1000000-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'parent'),
  ('f0000000-0000-0000-0000-00000000000d', 'a2000000-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.get_team_members('a1000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous users cannot call get_team_members');
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.get_team_members('a1000000-0000-0000-0000-000000000001')), 3, 'team admin lists members with display names');
select is_empty($$ select * from public.get_team_members('a2000000-0000-0000-0000-000000000002') $$, 'cannot list another team''s members');
reset role; select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.get_team_members('a1000000-0000-0000-0000-000000000001')), 3, 'a coach can list members');
reset role; select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select * from public.get_team_members('a1000000-0000-0000-0000-000000000001') $$, 'a parent cannot list members');
reset role; select set_config('request.jwt.claims', '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select * from public.get_team_members('a1000000-0000-0000-0000-000000000001') $$, 'a club admin cannot list members');
reset role;
insert into public.audit_log (action, target_type, team_id) values ('x.team1', 'teams', 'a1000000-0000-0000-0000-000000000001'), ('x.team2', 'teams', 'a2000000-0000-0000-0000-000000000002');
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.audit_log where action like 'x.%'), 1, 'team admin reads only their own team''s audit rows');
reset role; select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.audit_log where team_id = 'a1000000-0000-0000-0000-000000000001'), 0, 'a coach cannot read the audit log');
select * from finish();
rollback;
