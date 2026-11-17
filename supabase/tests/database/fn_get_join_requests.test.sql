-- public.get_join_requests
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
insert into public.join_requests (team_id, requester_id, player_id, message) values ('a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', '91000000-0000-0000-0000-000000000001', 'Hello');
insert into public.join_requests (team_id, requester_id, status) values ('a1000000-0000-0000-0000-00000000000a', 'a5555555-5555-5555-5555-555555555555', 'declined');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.get_join_requests('a1000000-0000-0000-0000-00000000000a') $$, '42501', null, 'anonymous users cannot call it');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.get_join_requests('a1000000-0000-0000-0000-00000000000a')), 2, 'staff see their team''s queue');
select is((select requester_name || '/' || player_first_name from public.get_join_requests('a1000000-0000-0000-0000-00000000000a') where status = 'pending'), 'Pat Parent/Ava', 'requester and child names are shown for pending requests');
select is((select count(*)::int from public.get_join_requests('a1000000-0000-0000-0000-00000000000a') where status = 'declined' and player_first_name is null), 1, 'declined requests do not expose a child');
select is_empty($$ select * from public.get_join_requests('a2000000-0000-0000-0000-00000000000b') $$, 'staff cannot read another team''s queue');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select * from public.get_join_requests('a1000000-0000-0000-0000-00000000000a') $$, 'a requester cannot read the queue');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select * from public.get_join_requests('a1000000-0000-0000-0000-00000000000a') $$, 'a club admin cannot read the queue');
select * from finish();
rollback;
