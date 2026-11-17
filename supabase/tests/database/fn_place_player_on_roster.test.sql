-- public.place_player_on_roster
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'coach@example.test'),
  ('a2222222-2222-2222-2222-222222222222', 'parent@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'coachb@example.test'),
  ('a4444444-4444-4444-4444-444444444444', 'parent2@example.test'),
  ('a5555555-5555-5555-5555-555555555555', 'teen@example.test'),
  ('a6666666-6666-6666-6666-666666666666', 'assistant@example.test');
insert into public.teams (id, name, sport, season_label, join_code) values
  ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall', 'TEAMA00001'),
  ('a2000000-0000-0000-0000-00000000000b', 'Team B', 'soccer', 'Fall', 'TEAMB00002');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'admin'),
  ('a1000000-0000-0000-0000-00000000000a', 'a6666666-6666-6666-6666-666666666666', 'parent'),
  ('a2000000-0000-0000-0000-00000000000b', 'a3333333-3333-3333-3333-333333333333', 'admin');
insert into public.households (id, name) values ('11000000-0000-0000-0000-000000000001', 'P fam'), ('22000000-0000-0000-0000-000000000002', 'P2 fam');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222'),
  ('22000000-0000-0000-0000-000000000002', 'a4444444-4444-4444-4444-444444444444');
insert into public.players (id, household_id, first_name, last_name, date_of_birth, profile_id) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '10 years', null),
  ('92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'Pia', 'Park', current_date - interval '9 years', null),
  ('93000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 'Teen', 'Adams', current_date - interval '15 years', 'a5555555-5555-5555-5555-555555555555');
insert into public.join_requests (team_id, requester_id, player_id, status) values
  ('a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', '91000000-0000-0000-0000-000000000001', 'approved'),
  ('a1000000-0000-0000-0000-00000000000a', 'a4444444-4444-4444-4444-444444444444', '92000000-0000-0000-0000-000000000002', 'pending');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.place_player_on_roster('a1000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous users cannot place players');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.place_player_on_roster('a1000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001') $$, '42501', null, 'a parent cannot place players');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.place_player_on_roster('a1000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001') $$, '42501', null, 'staff of another team cannot place players');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.place_player_on_roster('a1000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001', 7::smallint, ' Forward ') $$, 'staff can place an approved child');
select is((select jersey_number::text || '/' || position from public.team_players where player_id = '91000000-0000-0000-0000-000000000001'), '7/Forward', 'jersey and position are stored');
select throws_ok($$ select public.place_player_on_roster('a1000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-000000000002') $$, 'P0001', 'player_not_eligible', 'a child with only a pending request cannot be placed');
select throws_ok($$ select public.place_player_on_roster('a1000000-0000-0000-0000-00000000000a', '93000000-0000-0000-0000-000000000003') $$, 'P0001', 'player_not_eligible', 'an unrelated child cannot be placed');
reset role;
update public.join_requests set status = 'approved' where player_id = '92000000-0000-0000-0000-000000000002';
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.place_player_on_roster('a1000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-000000000002', 7::smallint) $$, '23505', null, 'a jersey number already taken by an active player is rejected');
select lives_ok($$ select public.place_player_on_roster('a1000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-000000000002', 8::smallint, 'Keeper') $$, 'a free number works');
select lives_ok($$ select public.place_player_on_roster('a1000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-000000000002', 8::smallint, 'Keeper', 'inactive') $$, 're-placing updates the existing roster row');
select is((select count(*)::int from public.team_players where player_id = '92000000-0000-0000-0000-000000000002'), 1, 'no duplicate roster row');
select lives_ok($$ select public.place_player_on_roster('a1000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001', 12::smallint, 'Forward') $$, 'staff can change a number via the function');
select throws_ok($$ select public.place_player_on_roster('a1000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-000000000002', 100::smallint) $$, '23514', null, 'jersey numbers above 99 are rejected');
select is((select count(*)::int from public.get_guardian_contacts('91000000-0000-0000-0000-000000000001')), 1, 'once rostered, staff can read the guardian contact');
reset role;
select is((select count(*)::int from public.audit_log where action = 'roster.place'), 4, 'placements are audited');
select * from finish();
rollback;
