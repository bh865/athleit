-- public.account_deletion_blockers
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'c@example.test');
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-00000000000c', 'Club', 'blk-club');
insert into public.club_memberships (club_id, profile_id, role) values
  ('c1000000-0000-0000-0000-00000000000c', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin');
insert into public.teams (id, name, sport, season_label, join_code) values
  ('a1000000-0000-0000-0000-00000000000a', 'Solo Team', 'soccer', 'Fall', 'BLKTEAM001'),
  ('a2000000-0000-0000-0000-00000000000b', 'Shared Team', 'soccer', 'Fall', 'BLKTEAM002');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
  ('a2000000-0000-0000-0000-00000000000b', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
  ('a2000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin');
insert into public.households (id, name) values
  ('11000000-0000-0000-0000-000000000001', 'Solo fam'), ('22000000-0000-0000-0000-000000000002', 'Pair fam'),
  ('33000000-0000-0000-0000-000000000003', 'Empty fam');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22000000-0000-0000-0000-000000000002', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('33000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.players (household_id, first_name, last_name, date_of_birth) values
  ('11000000-0000-0000-0000-000000000001', 'Kid', 'One', current_date - interval '9 years'),
  ('22000000-0000-0000-0000-000000000002', 'Kid', 'Two', current_date - interval '9 years');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.account_deletion_blockers() $$, '42501', null, 'anonymous users cannot call it');

reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select is((select public.account_deletion_blockers() #>> '{teams,0,name}'), 'Solo Team', 'the only admin of a team is blocked');
select is((select jsonb_array_length(public.account_deletion_blockers() -> 'teams')), 1, 'a team with another admin is not a blocker');
select is((select public.account_deletion_blockers() #>> '{clubs,0,name}'), 'Club', 'the only admin of a club is blocked');
select is((select public.account_deletion_blockers() #>> '{households,0,name}'), 'Solo fam', 'the only guardian of a household with players is blocked');
select is((select jsonb_array_length(public.account_deletion_blockers() -> 'households')), 1, 'shared and player-less households are not blockers');

reset role; select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set local role authenticated;
select is(public.account_deletion_blockers(), '{"teams": [], "clubs": [], "households": []}'::jsonb, 'a user with nothing to hand over has no blockers, and sees only their own situation');

reset role;
select * from finish();
rollback;
