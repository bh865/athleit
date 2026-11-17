-- public.get_guardian_contacts (data minimization for minors)
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
select throws_ok($$ select * from public.get_guardian_contacts('91000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous users cannot read contacts');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select email from public.get_guardian_contacts('91000000-0000-0000-0000-000000000001')), 'parent.ava@example.test', 'staff read the guardian email of a rostered child');
select is((select phone from public.get_guardian_contacts('91000000-0000-0000-0000-000000000001')), '+15550000001', 'staff read the guardian phone of a rostered child');
select is_empty($$ select * from public.get_guardian_contacts('93000000-0000-0000-0000-000000000003') $$, 'staff cannot read contacts for a child on another team');
select is_empty($$ select * from public.get_guardian_contacts('94000000-0000-0000-0000-000000000004') $$, 'staff cannot read contacts for an inactive roster entry');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.get_guardian_contacts('91000000-0000-0000-0000-000000000001')), 1, 'a guardian reads the contacts of their own child');
select is_empty($$ select * from public.get_guardian_contacts('92000000-0000-0000-0000-000000000002') $$, 'a parent cannot read another family''s guardian contacts (same team)');
select is_empty($$ select * from public.get_guardian_contacts('93000000-0000-0000-0000-000000000003') $$, 'a parent cannot read contacts for a child on another team');
reset role; select set_config('request.jwt.claims', '{"sub":"a7777777-7777-7777-7777-777777777777","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select * from public.get_guardian_contacts('91000000-0000-0000-0000-000000000001') $$, 'a teammate player cannot read guardian contacts');
select is_empty($$ select * from public.get_guardian_contacts('94000000-0000-0000-0000-000000000004') $$, 'a player cannot read their own guardians'' contacts (guardians only)');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select * from public.get_guardian_contacts('91000000-0000-0000-0000-000000000001') $$, 'a club admin cannot read guardian contacts');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select * from public.get_guardian_contacts('91000000-0000-0000-0000-000000000001') $$, 'staff of another team cannot read contacts');
select * from finish();
rollback;
