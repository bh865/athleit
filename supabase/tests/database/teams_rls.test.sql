-- RLS tests for public.teams
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
select throws_ok($$ select * from public.teams $$, '42501', null, 'anonymous users cannot read teams');
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.teams), 1, 'team admin reads only their own team');
select lives_ok($$ update public.teams set name = 'U10 Hawks Red', season_label = 'Spring 2027' where id = 'a1000000-0000-0000-0000-000000000001' $$, 'team admin can edit name and season');
select is((select name from public.teams where id = 'a1000000-0000-0000-0000-000000000001'), 'U10 Hawks Red', 'edit took effect');
select throws_ok($$ update public.teams set club_id = null where id = 'a1000000-0000-0000-0000-000000000001' $$, '42501', null, 'a team cannot change its own club_id');
select throws_ok($$ update public.teams set club_id = 'c1000000-0000-0000-0000-000000000001' where id = 'a2000000-0000-0000-0000-000000000002' $$, '42501', null, 'a team cannot set its own club_id');
select throws_ok($$ update public.teams set join_code = 'HACKED' where id = 'a1000000-0000-0000-0000-000000000001' $$, '42501', null, 'join_code is not client-editable');
select throws_ok($$ insert into public.teams (name, sport, season_label) values ('X', 'soccer', 's') $$, '42501', null, 'teams cannot be inserted directly');
select throws_ok($$ delete from public.teams $$, '42501', null, 'teams cannot be deleted by clients');
select is_empty($$ select 1 from public.teams where id = 'a2000000-0000-0000-0000-000000000002' $$, 'team A admin cannot read team B');
reset role; select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.teams), 1, 'a coach reads their team');
select is_empty($$ update public.teams set name = 'Coach edit' where id = 'a1000000-0000-0000-0000-000000000001' returning 1 $$, 'a coach cannot edit team details');
reset role; select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.teams), 1, 'a parent reads their team');
select is_empty($$ update public.teams set name = 'Parent edit' returning 1 $$, 'a parent cannot edit team details');
reset role; select set_config('request.jwt.claims', '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.teams), 1, 'club admin reads the team linked to their club');
select is((select id::text from public.teams), 'a1000000-0000-0000-0000-000000000001', 'club admin sees the linked team, not the independent one');
select is_empty($$ update public.teams set name = 'Club edit' returning 1 $$, 'club admin without a team role cannot edit the team');
reset role; select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.teams), 1, 'independent team admin reads only their team');
select is_empty($$ select 1 from public.teams where id = 'a1000000-0000-0000-0000-000000000001' $$, 'a stranger cannot read another team');
reset role;
select is((select club_id from public.teams where id = 'a2000000-0000-0000-0000-000000000002'), null, 'independent team stayed unaffiliated');
select * from finish();
rollback;
