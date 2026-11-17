-- RLS tests for public.team_players (+ can_see_player via the players policy)
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email, phone) values
  ('a1111111-1111-1111-1111-111111111111', 'coach@example.test', null),
  ('a2222222-2222-2222-2222-222222222222', 'parent.ava@example.test', '+15550000001'),
  ('a3333333-3333-3333-3333-333333333333', 'parent.ben@example.test', '+15550000002'),
  ('a4444444-4444-4444-4444-444444444444', 'parent.other@example.test', '+15550000003'),
  ('a5555555-5555-5555-5555-555555555555', 'clubadmin@example.test', null),
  ('a6666666-6666-6666-6666-666666666666', 'coach.b@example.test', null),
  ('a7777777-7777-7777-7777-777777777777', 'teen@example.test', null);
update public.profiles set display_name = 'Pat Ava' where id = 'a2222222-2222-2222-2222-222222222222';
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
insert into public.club_memberships (club_id, profile_id, role) values ('c1000000-0000-0000-0000-000000000001', 'a5555555-5555-5555-5555-555555555555', 'admin');
-- Team A (club-linked): coach a1, parents a2 (Ava) and a3 (Ben). Team B: coach a6, parent a4.
insert into public.teams (id, name, sport, season_label, club_id, join_code) values
  ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall', 'c1000000-0000-0000-0000-000000000001', 'TEAMA00001'),
  ('a2000000-0000-0000-0000-00000000000b', 'Team B', 'soccer', 'Fall', null, 'TEAMB00002');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'coach'),
  ('a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', 'parent'),
  ('a1000000-0000-0000-0000-00000000000a', 'a3333333-3333-3333-3333-333333333333', 'parent'),
  ('a2000000-0000-0000-0000-00000000000b', 'a6666666-6666-6666-6666-666666666666', 'coach'),
  ('a2000000-0000-0000-0000-00000000000b', 'a4444444-4444-4444-4444-444444444444', 'parent');
insert into public.households (id, name) values
  ('11000000-0000-0000-0000-000000000001', 'Ava fam'), ('22000000-0000-0000-0000-000000000002', 'Ben fam'), ('33000000-0000-0000-0000-000000000003', 'Other fam');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222'),
  ('22000000-0000-0000-0000-000000000002', 'a3333333-3333-3333-3333-333333333333'),
  ('33000000-0000-0000-0000-000000000003', 'a4444444-4444-4444-4444-444444444444');
insert into public.players (id, household_id, first_name, last_name, date_of_birth, profile_id) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '10 years', null),
  ('92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'Ben', 'Brown', current_date - interval '9 years', null),
  ('93000000-0000-0000-0000-000000000003', '33000000-0000-0000-0000-000000000003', 'Cleo', 'Clark', current_date - interval '11 years', null),
  ('94000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000001', 'Teen', 'Adams', current_date - interval '15 years', 'a7777777-7777-7777-7777-777777777777');
insert into public.team_memberships (team_id, profile_id, role) values ('a1000000-0000-0000-0000-00000000000a', 'a7777777-7777-7777-7777-777777777777', 'player');
insert into public.team_players (id, team_id, player_id, jersey_number, position, status) values
  ('d1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001', 7, 'Forward', 'active'),
  ('d2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-000000000002', 10, 'Keeper', 'active'),
  ('d4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-00000000000a', '94000000-0000-0000-0000-000000000004', 4, null, 'inactive'),
  ('d3000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-00000000000b', '93000000-0000-0000-0000-000000000003', 7, 'Winger', 'active');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.team_players $$, '42501', null, 'anonymous users cannot read rosters');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.team_players), 3, 'staff read their team''s whole roster (incl. inactive)');
select is_empty($$ select 1 from public.team_players where team_id = 'a2000000-0000-0000-0000-00000000000b' $$, 'staff cannot read another team''s roster');
select lives_ok($$ update public.team_players set position = 'Striker', jersey_number = 9 where id = 'd1000000-0000-0000-0000-000000000001' $$, 'staff can edit a roster row');
select throws_ok($$ update public.team_players set jersey_number = 10 where id = 'd1000000-0000-0000-0000-000000000001' $$, '23505', null, 'duplicate active jersey numbers are rejected');
select lives_ok($$ update public.team_players set jersey_number = 10 where id = 'd4000000-0000-0000-0000-000000000004' $$, 'an inactive player may hold a number an active player has');
select throws_ok($$ update public.team_players set status = 'active' where id = 'd4000000-0000-0000-0000-000000000004' $$, '23505', null, 'reactivating onto a taken number is rejected');
select throws_ok($$ update public.team_players set team_id = 'a2000000-0000-0000-0000-00000000000b' where id = 'd1000000-0000-0000-0000-000000000001' $$, '42501', null, 'a roster row cannot be moved to another team');
select throws_ok($$ insert into public.team_players (team_id, player_id) values ('a1000000-0000-0000-0000-00000000000a', '93000000-0000-0000-0000-000000000003') $$, '42501', null, 'staff cannot insert roster rows directly (use place_player_on_roster)');
select is_empty($$ select 1 from public.players where id = '93000000-0000-0000-0000-000000000003' $$, 'staff cannot read a player on a different team');
select is((select count(*)::int from public.players), 3, 'staff read full player rows for their roster');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.team_players), 2, 'a parent reads only their own household''s roster rows (Ava and Teen)');
select is_empty($$ select 1 from public.players where first_name = 'Ben' $$, 'a parent cannot read a teammate''s player row');
select is_empty($$ update public.team_players set jersey_number = 1 returning 1 $$, 'a parent cannot edit the roster');
select is_empty($$ delete from public.team_players returning 1 $$, 'a parent cannot remove roster rows');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.team_players where team_id = 'a1000000-0000-0000-0000-00000000000a' $$, 'a parent of team B cannot read team A''s roster rows');
reset role; select set_config('request.jwt.claims', '{"sub":"a7777777-7777-7777-7777-777777777777","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.team_players), 1, 'a player reads only their own roster row');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.team_players), 3, 'a club admin reads the linked team''s roster');
select is((select count(*)::int from public.players), 3, 'a club admin reads the linked team''s players');
select is_empty($$ update public.team_players set jersey_number = 1 returning 1 $$, 'a club admin cannot edit the roster');
select is_empty($$ delete from public.team_players returning 1 $$, 'a club admin cannot remove roster rows');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.team_players where team_id = 'a1000000-0000-0000-0000-00000000000a' $$, 'staff of team B cannot read team A''s roster');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ delete from public.team_players where id = 'd2000000-0000-0000-0000-000000000002' $$, 'staff can remove a player from the roster');
select * from finish();
rollback;
