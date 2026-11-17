-- public.rotate_team_join_code
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'g1@example.test'), ('a2222222-2222-2222-2222-222222222222', 'g2@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'teamadmin@example.test'), ('a4444444-4444-4444-4444-444444444444', 'clubadmin@example.test'),
  ('a5555555-5555-5555-5555-555555555555', 'stranger@example.test');
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
insert into public.club_memberships (club_id, profile_id, role) values ('c1000000-0000-0000-0000-000000000001', 'a4444444-4444-4444-4444-444444444444', 'admin');
insert into public.teams (id, name, sport, season_label, club_id, join_code) values
  ('a1000000-0000-0000-0000-00000000000a', 'Linked', 'soccer', 'Fall', 'c1000000-0000-0000-0000-000000000001', 'LINKED0001'),
  ('a2000000-0000-0000-0000-00000000000b', 'Solo', 'soccer', 'Fall', null, 'SOLO000002');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a3333333-3333-3333-3333-333333333333', 'admin'),
  ('a2000000-0000-0000-0000-00000000000b', 'a3333333-3333-3333-3333-333333333333', 'admin');
insert into public.households (id, name) values ('11000000-0000-0000-0000-000000000001', 'G fam');
insert into public.household_members (household_id, profile_id) values ('11000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111');
insert into public.team_memberships (team_id, profile_id, role) values ('a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', 'coach');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.rotate_team_join_code('a1000000-0000-0000-0000-00000000000a') $$, '42501', null, 'anonymous users cannot rotate');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.rotate_team_join_code('a1000000-0000-0000-0000-00000000000a') $$, '42501', null, 'a coach cannot rotate the code');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.rotate_team_join_code('a1000000-0000-0000-0000-00000000000a') $$, '42501', null, 'a stranger cannot rotate the code');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.rotate_team_join_code('a1000000-0000-0000-0000-00000000000a') $$, 'a team admin can rotate the code');
select isnt((select join_code from public.teams where id = 'a1000000-0000-0000-0000-00000000000a'), 'LINKED0001', 'the code changed');
select matches((select join_code from public.teams where id = 'a1000000-0000-0000-0000-00000000000a'), '^[A-Z0-9]{10}$', 'the new code is 10 upper-case characters');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.request_to_join('LINKED0001') $$, 'P0001', 'team_not_found', 'the old code no longer works');
reset role;
select is((select count(*)::int from public.audit_log where action = 'team.rotate_join_code'), 1, 'rotation is audited');
select * from finish();
rollback;
