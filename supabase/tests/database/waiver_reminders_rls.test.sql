begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'admin@example.test'), ('a3333333-3333-3333-3333-333333333333', 'coach@example.test'),
  ('a4444444-4444-4444-4444-444444444444', 'parent@example.test'), ('a5555555-5555-5555-5555-555555555555', 'outsider@example.test');
insert into public.teams (id, name, sport, season_label, join_code) values
  ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall', 'TEAMA00001');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'admin'),
  ('a1000000-0000-0000-0000-00000000000a', 'a3333333-3333-3333-3333-333333333333', 'coach'),
  ('a1000000-0000-0000-0000-00000000000a', 'a4444444-4444-4444-4444-444444444444', 'parent');
insert into public.households (id, name) values ('11000000-0000-0000-0000-000000000001', 'P fam');
insert into public.players (id, household_id, first_name, last_name, date_of_birth)
  values ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '10 years');
insert into public.waivers (id, team_id, title, draft_body) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'Liability', 'I agree.');
insert into public.waiver_reminders (waiver_id, player_id, team_id, sent_by) values
  ('b1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111');

reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.waiver_reminders), 1, 'an admin reads reminders');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.waiver_reminders), 1, 'a coach reads reminders');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.waiver_reminders), 0, 'a parent reads none');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.waiver_reminders), 0, 'an outsider reads none');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ insert into public.waiver_reminders (waiver_id, player_id, team_id) values ('b1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a') $$, '42501', null, 'not even an admin writes directly');
select throws_ok($$ delete from public.waiver_reminders $$, '42501', null, 'nobody deletes reminders');
reset role;

select * from finish();
rollback;
