-- public.get_link_requests
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'coach@example.test'), ('a2222222-2222-2222-2222-222222222222', 'parent@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'teamadmin@example.test'), ('a4444444-4444-4444-4444-444444444444', 'clubadmin@example.test'),
  ('a5555555-5555-5555-5555-555555555555', 'stranger@example.test'), ('a6666666-6666-6666-6666-666666666666', 'teen@example.test');
update public.profiles set display_name = 'Pat Parent' where id = 'a2222222-2222-2222-2222-222222222222';
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
insert into public.club_memberships (club_id, profile_id, role) values ('c1000000-0000-0000-0000-000000000001', 'a4444444-4444-4444-4444-444444444444', 'admin');
insert into public.teams (id, name, sport, season_label) values ('a1000000-0000-0000-0000-00000000000a', 'Hawks', 'soccer', 'Fall'), ('a2000000-0000-0000-0000-00000000000b', 'Owls', 'hockey', 'Winter');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'coach'), ('a1000000-0000-0000-0000-00000000000a', 'a3333333-3333-3333-3333-333333333333', 'admin'),
  ('a2000000-0000-0000-0000-00000000000b', 'a5555555-5555-5555-5555-555555555555', 'admin');
insert into public.households (id, name) values ('11000000-0000-0000-0000-000000000001', 'Pat fam');
insert into public.household_members (household_id, profile_id) values ('11000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222');
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '15 years');
insert into public.team_club_link_requests (team_id, club_id, requested_by) values ('a1000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000001', 'a3333333-3333-3333-3333-333333333333');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.get_link_requests('a1000000-0000-0000-0000-00000000000a') $$, '42501', null, 'anonymous users cannot call it');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is((select club_name from public.get_link_requests('a1000000-0000-0000-0000-00000000000a')), 'Riverside', 'a team admin sees the club they asked');
select is_empty($$ select * from public.get_link_requests(null, 'c1000000-0000-0000-0000-000000000001') $$, 'a team admin cannot read a club''s queue');
select is_empty($$ select * from public.get_link_requests('a1000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000001') $$, 'passing both targets returns nothing');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select * from public.get_link_requests('a1000000-0000-0000-0000-00000000000a') $$, 'a coach (not admin) sees nothing');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select is((select team_name || '/' || requested_by_name from public.get_link_requests(null, 'c1000000-0000-0000-0000-000000000001')), 'Hawks/teamadmin', 'a club admin sees the not-yet-linked team and requester');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select * from public.get_link_requests(null, 'c1000000-0000-0000-0000-000000000001') $$, 'a stranger sees nothing');
select * from finish();
rollback;
