-- RLS tests for public.team_memberships (+ last-admin rule, audit)
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
select throws_ok($$ select * from public.team_memberships $$, '42501', null, 'anonymous users cannot read memberships');
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.team_memberships), 3, 'team admin reads all memberships of their team only');
select throws_ok($$ insert into public.team_memberships (team_id, profile_id, role) values ('a1000000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'coach') $$, '42501', null, 'memberships cannot be inserted directly');
select lives_ok($$ update public.team_memberships set role = 'manager' where id = 'f0000000-0000-0000-0000-00000000000b' $$, 'team admin can change a role');
select throws_ok($$ update public.team_memberships set team_id = 'a2000000-0000-0000-0000-000000000002' where id = 'f0000000-0000-0000-0000-00000000000b' $$, '42501', null, 'team_id is not editable');
select is_empty($$ update public.team_memberships set role = 'admin' where team_id = 'a2000000-0000-0000-0000-000000000002' returning 1 $$, 'cannot touch another team''s memberships');
select throws_ok($$ update public.team_memberships set role = 'coach' where id = 'f0000000-0000-0000-0000-00000000000a' $$, 'P0001', 'last_admin', 'the last admin cannot be demoted');
select throws_ok($$ update public.team_memberships set status = 'inactive' where id = 'f0000000-0000-0000-0000-00000000000a' $$, 'P0001', 'last_admin', 'the last admin cannot be deactivated');
select throws_ok($$ delete from public.team_memberships where id = 'f0000000-0000-0000-0000-00000000000a' $$, 'P0001', 'last_admin', 'the last admin cannot leave');
select lives_ok($$ update public.team_memberships set role = 'admin' where id = 'f0000000-0000-0000-0000-00000000000b' $$, 'a second admin can be promoted');
select lives_ok($$ update public.team_memberships set role = 'coach' where id = 'f0000000-0000-0000-0000-00000000000a' $$, 'with two admins the first can step down');
reset role; select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ delete from public.team_memberships where id = 'f0000000-0000-0000-0000-00000000000c' $$, 'a team admin can remove a member');
select throws_ok($$ delete from public.team_memberships where id = 'f0000000-0000-0000-0000-00000000000b' $$, 'P0001', 'last_admin', 'the remaining admin cannot leave');
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ update public.team_memberships set role = 'admin' where id = 'f0000000-0000-0000-0000-00000000000a' returning 1 $$, 'a coach cannot promote themselves');
select lives_ok($$ delete from public.team_memberships where id = 'f0000000-0000-0000-0000-00000000000a' $$, 'a non-admin member can leave');
reset role; select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.team_memberships $$, 'a removed user reads nothing');
reset role; select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.team_memberships), 1, 'another team''s admin sees only their own team''s membership');
select is_empty($$ delete from public.team_memberships where team_id = 'a1000000-0000-0000-0000-000000000001' returning 1 $$, 'cannot remove members of another team');
reset role; select set_config('request.jwt.claims', '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.team_memberships $$, 'a club admin has no membership read access');
reset role;
select ok((select count(*) from public.audit_log where team_id = 'a1000000-0000-0000-0000-000000000001' and action like 'team_memberships.%') >= 5, 'role changes and removals are audited');
select is((select before ->> 'role' from public.audit_log where action = 'team_memberships.update' and (before ->> 'id')::uuid = 'f0000000-0000-0000-0000-00000000000b' order by id limit 1), 'coach', 'audit stores before image');
select * from finish();
rollback;
