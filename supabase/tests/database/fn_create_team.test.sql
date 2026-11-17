-- public.create_team
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'c@example.test'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'd@example.test'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'e@example.test');
-- Club 1: admin E, manager B. T1 (admin A) is independent; T2 (admin D) is independent.
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
insert into public.club_memberships (club_id, profile_id, role) values
  ('c1000000-0000-0000-0000-000000000001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'admin'),
  ('c1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'manager');
insert into public.teams (id, name, sport, season_label) values
  ('a1000000-0000-0000-0000-000000000001', 'U10 Hawks', 'soccer', 'Fall 2026'),
  ('a2000000-0000-0000-0000-000000000002', 'U12 Owls', 'hockey', 'Winter 2026');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
  ('a1000000-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'coach'),
  ('a2000000-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.create_team('X', 'soccer', 's') $$, '42501', null, 'anonymous users cannot call create_team');
reset role; select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.create_team(' Hawks ', 'volleyball', ' Spring 2027 ') $$, 'a signed-in user can create an independent team');
select is((select count(*)::int from public.teams where name = 'Hawks' and sport = 'volleyball' and season_label = 'Spring 2027'), 1, 'team created with trimmed fields');
select is((select count(*)::int from public.team_memberships tm join public.teams t on t.id = tm.team_id where t.name = 'Hawks' and tm.profile_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' and tm.role = 'admin'), 1, 'creator becomes admin in the same transaction');
select is((select club_id from public.teams where name = 'Hawks'), null, 'no club link by default');
select throws_ok($$ select public.create_team('   ', 'soccer', 's') $$, '23514', null, 'blank name is rejected');
select throws_ok($$ select public.create_team('Bad', 'cricket', 's') $$, '22P02', null, 'unknown sport is rejected');
select lives_ok($$ select public.create_team('Linked', 'soccer', 'Fall', 'c1000000-0000-0000-0000-000000000001') $$, 'a team can be created with a club link request');
select is((select club_id from public.teams where name = 'Linked'), null, 'creating with a club does NOT affiliate the team');
select is((select status::text from public.team_club_link_requests where team_id = (select id from public.teams where name = 'Linked')), 'pending', 'a pending link request is filed instead');
select throws_ok($$ select public.create_team('Ghost', 'soccer', 'Fall', '99999999-9999-9999-9999-999999999999') $$, 'P0001', 'club_not_found', 'unknown club is rejected');
select is((select count(*)::int from public.teams where name = 'Ghost'), 0, 'a failed create leaves no team behind');
reset role;
select is((select count(*)::int from public.audit_log where created_at = now() and action = 'team.create'), 2, 'team creation is audited');
select * from finish();
rollback;
