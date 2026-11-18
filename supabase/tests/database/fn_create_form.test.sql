begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'admin@example.test'), ('a2222222-2222-2222-2222-222222222222', 'manager@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'coach@example.test'), ('a4444444-4444-4444-4444-444444444444', 'parent@example.test'),
  ('a5555555-5555-5555-5555-555555555555', 'outsider@example.test'), ('a6666666-6666-6666-6666-666666666666', 'cadmin@example.test'),
  ('a7777777-7777-7777-7777-777777777777', 'admin2@example.test'), ('a8888888-8888-8888-8888-888888888888', 'parent2@example.test');
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-00000000000c', 'Club', 'test-club-p5');
insert into public.club_memberships (club_id, profile_id, role) values ('c1000000-0000-0000-0000-00000000000c', 'a6666666-6666-6666-6666-666666666666', 'admin');
insert into public.teams (id, name, sport, season_label, join_code, club_id) values
  ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall', 'TEAMA00001', 'c1000000-0000-0000-0000-00000000000c'),
  ('a2000000-0000-0000-0000-00000000000b', 'Team B', 'soccer', 'Fall', 'TEAMB00002', null);
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'admin'), ('a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', 'manager'), ('a1000000-0000-0000-0000-00000000000a', 'a3333333-3333-3333-3333-333333333333', 'coach'),
  ('a1000000-0000-0000-0000-00000000000a', 'a4444444-4444-4444-4444-444444444444', 'parent'), ('a2000000-0000-0000-0000-00000000000b', 'a7777777-7777-7777-7777-777777777777', 'admin');
insert into public.households (id, name) values
  ('11000000-0000-0000-0000-000000000001', 'P fam'), ('22000000-0000-0000-0000-000000000002', 'P2 fam');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a4444444-4444-4444-4444-444444444444'), ('22000000-0000-0000-0000-000000000002', 'a8888888-8888-8888-8888-888888888888');

reset role; select set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
select throws_ok($$ select public.create_form('a1000000-0000-0000-0000-00000000000a', null, 'F') $$, '42501', null, 'anonymous cannot create a form');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.create_form('a1000000-0000-0000-0000-00000000000a', null, 'F') $$, '42501', 'forbidden', 'a parent cannot create a form');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.create_form('a1000000-0000-0000-0000-00000000000a', null, 'F') $$, '42501', 'forbidden', 'a coach cannot create a form');
reset role; select set_config('request.jwt.claims', '{"sub":"a7777777-7777-7777-7777-777777777777","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.create_form('a1000000-0000-0000-0000-00000000000a', null, 'F') $$, '42501', 'forbidden', 'another team''s admin cannot');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.create_form('a1000000-0000-0000-0000-00000000000a', null, 'F') $$, '42501', 'forbidden', 'a club admin cannot create a team form');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.create_form('a1000000-0000-0000-0000-00000000000a', null, 'Manager form') $$, 'a manager can create a form');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.create_form('a1000000-0000-0000-0000-00000000000a', null, 'Admin form') $$, 'an admin can create a form');
select throws_ok($$ select public.create_form(null, null, 'F') $$, '42501', 'forbidden', 'exactly one owner is required');
select throws_ok($$ select public.create_form('a1000000-0000-0000-0000-00000000000a', null, 'F', '{"fields":[{"id":"x","type":"short_text","label":"Social Security number"}]}') $$, '23514', 'forbidden_field', 'SSN labels are rejected');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.create_form(null, 'c1000000-0000-0000-0000-00000000000c', 'Club form') $$, 'a club admin can create a club form');
reset role;
select is((select count(*)::int from public.audit_log where action = 'form.create' and created_at = now()), 3, 'form creation is audited');

select * from finish();
rollback;
