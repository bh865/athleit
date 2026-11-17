-- public.unlink_team_from_club
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
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.unlink_team_from_club('a1000000-0000-0000-0000-00000000000a') $$, '42501', null, 'anonymous users cannot unlink');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.unlink_team_from_club('a1000000-0000-0000-0000-00000000000a') $$, '42501', null, 'a stranger cannot unlink');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.unlink_team_from_club('a2000000-0000-0000-0000-00000000000b') $$, 'P0001', 'not_affiliated', 'an independent team cannot be unlinked');
select lives_ok($$ select public.unlink_team_from_club('a1000000-0000-0000-0000-00000000000a') $$, 'a team admin can end the affiliation');
select is((select club_id from public.teams where id = 'a1000000-0000-0000-0000-00000000000a'), null, 'club_id is cleared');
reset role;
update public.teams set club_id = 'c1000000-0000-0000-0000-000000000001' where id = 'a1000000-0000-0000-0000-00000000000a';
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.unlink_team_from_club('a1000000-0000-0000-0000-00000000000a') $$, 'a club admin can end the affiliation');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.unlink_team_from_club('a1000000-0000-0000-0000-00000000000a') $$, '42501', null, 'a guardian cannot unlink');
reset role;
select is((select count(*)::int from public.audit_log where action = 'team.affiliation_change'), 3, 'each change is audited (superuser relink included)');
select * from finish();
rollback;
