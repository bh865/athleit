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

reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.grant_registration_capability('a1000000-0000-0000-0000-00000000000a', null, 'a3333333-3333-3333-3333-333333333333') $$, '42501', 'forbidden', 'a manager cannot grant');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.grant_registration_capability('a1000000-0000-0000-0000-00000000000a', null, 'a3333333-3333-3333-3333-333333333333') $$, '42501', 'forbidden', 'a coach cannot grant themselves');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.grant_registration_capability('a1000000-0000-0000-0000-00000000000a', null, 'a4444444-4444-4444-4444-444444444444') $$, '23514', 'grantee_not_staff', 'a parent cannot be a grantee');
select throws_ok($$ select public.grant_registration_capability('a1000000-0000-0000-0000-00000000000a', null, 'a3333333-3333-3333-3333-333333333333', 'everything') $$, '22023', 'unknown_capability', 'unknown capabilities are rejected');
select lives_ok($$ select public.grant_registration_capability('a1000000-0000-0000-0000-00000000000a', null, 'a3333333-3333-3333-3333-333333333333') $$, 'an admin grants a coach');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is(private.can_read_sensitive('a1000000-0000-0000-0000-00000000000a', null), true, 'the coach now holds the capability');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is(private.can_read_sensitive('a1000000-0000-0000-0000-00000000000a', null), false, 'a manager without the grant does not');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.grant_registration_capability('a1000000-0000-0000-0000-00000000000a', null, 'a3333333-3333-3333-3333-333333333333', 'sensitive_answers', false) $$, 'an admin revokes');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is(private.can_read_sensitive('a1000000-0000-0000-0000-00000000000a', null), false, 'revoked');
reset role;
select is((select count(*)::int from public.audit_log where action = 'registration.capability' and created_at = now()), 2, 'grants are audited');

select * from finish();
rollback;
