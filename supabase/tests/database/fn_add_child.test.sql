-- public.add_child (+ player role guard on team_memberships)
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent.a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent.b@example.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'teen@example.test'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'stranger@example.test');
-- Household H1 (guardian A) has Ava (10) and Teen (15); household H2 (guardian B) has Ben (9).
insert into public.households (id, name) values
  ('11000000-0000-0000-0000-000000000001', 'A family'), ('22000000-0000-0000-0000-000000000002', 'B family');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '10 years'),
  ('92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'Ben', 'Brown', current_date - interval '9 years');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.add_child(null, 'X', 'Y', '2015-01-01') $$, '42501', null, 'anonymous users cannot add children');
reset role; select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.add_child(null, ' Zoe ', ' Stone ', '2016-04-02') $$, 'a user with no household and no team can add a child');
select is((select count(*)::int from public.households), 1, 'the household was created automatically');
select is((select count(*)::int from public.household_members), 1, 'the caller is the household''s guardian');
select is((select first_name || ' ' || last_name from public.players), 'Zoe Stone', 'names are trimmed');
select lives_ok($$ select public.add_child(null, 'Max', 'Stone', '2018-09-09') $$, 'a second child reuses the household');
select is((select count(*)::int from public.households), 1, 'no second household is created');
select is((select count(distinct household_id)::int from public.players), 1, 'both children share one household');
select throws_ok($$ select public.add_child('11000000-0000-0000-0000-000000000001', 'Intruder', 'X', '2015-01-01') $$, '42501', null, 'cannot add a child to someone else''s household');
select throws_ok($$ select public.add_child(null, 'Future', 'Kid', current_date + 5) $$, '23514', null, 'a future birth date is rejected');
select throws_ok($$ select public.add_child(null, '', 'Kid', '2015-01-01') $$, '23514', null, 'a blank first name is rejected');
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.add_child('11000000-0000-0000-0000-000000000001', 'Cy', 'Adams', '2014-05-05') $$, 'a guardian can add a child to their own household by id');
select is((select count(*)::int from public.players), 2, 'family A sees only their own children (Ava and Cy)');
reset role;
select is((select count(*)::int from public.audit_log where created_at = now() and action = 'player.add_child'), 3, 'adding children is audited');
select is((select count(*)::int from public.audit_log where created_at = now() and action = 'household.create'), 1, 'automatic household creation is audited');
-- The player role requires a linked, 13+ player profile.
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
insert into public.teams (id, name, sport, season_label) values ('a1000000-0000-0000-0000-000000000001', 'T', 'soccer', 's');
select throws_ok($$ insert into public.team_memberships (team_id, profile_id, role) values ('a1000000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'player') $$, '23514', 'player_role_requires_linked_player', 'the player role needs a linked player');
select * from finish();
rollback;
