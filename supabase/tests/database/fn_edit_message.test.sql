-- public.edit_message
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('aa000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('aa000000-0000-0000-0000-000000000002', 'coach@example.test'),
  ('aa000000-0000-0000-0000-000000000003', 'mgr@example.test'),
  ('bb000000-0000-0000-0000-000000000001', 'par1@example.test'),
  ('bb000000-0000-0000-0000-000000000002', 'par2@example.test'),
  ('bb000000-0000-0000-0000-000000000003', 'par3@example.test'),
  ('cc000000-0000-0000-0000-000000000001', 'teen@example.test'),
  ('dd000000-0000-0000-0000-000000000001', 'xadmin@example.test'),
  ('dd000000-0000-0000-0000-000000000002', 'xparent@example.test');
insert into public.teams (id, name, sport, season_label) values
  ('e1000000-0000-0000-0000-000000000001', 'T1', 'soccer', 'Fall'),
  ('e2000000-0000-0000-0000-000000000002', 'T2', 'soccer', 'Fall');
insert into public.households (id, name) values
  ('f0000000-0000-0000-0000-000000000001', 'H1'), ('f0000000-0000-0000-0000-000000000002', 'H2');
insert into public.household_members (household_id, profile_id) values
  ('f0000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000002', 'bb000000-0000-0000-0000-000000000002');
insert into public.players (id, household_id, first_name, last_name, date_of_birth, profile_id) values
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Teen', 'One', current_date - interval '15 years', 'cc000000-0000-0000-0000-000000000001');
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('f1000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 'Kid', 'Two', current_date - interval '10 years');
insert into public.team_memberships (team_id, profile_id, role) values
  ('e1000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'admin'),
  ('e1000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000002', 'coach'),
  ('e1000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000003', 'manager'),
  ('e1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'parent'),
  ('e1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000002', 'parent'),
  ('e1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000003', 'parent'),
  ('e1000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'player'),
  ('e2000000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000001', 'admin'),
  ('e2000000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000002', 'parent');
-- Threads: announcement (A), group (G: coach, par1, par3), direct (D: par1 <-> par3)
insert into public.threads (id, team_id, type, title, created_by) values
  ('71000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000001', 'announcement', 'News', 'aa000000-0000-0000-0000-000000000001'),
  ('71000000-0000-0000-0000-00000000000b', 'e1000000-0000-0000-0000-000000000001', 'group', 'Group', 'aa000000-0000-0000-0000-000000000002'),
  ('71000000-0000-0000-0000-00000000000c', 'e1000000-0000-0000-0000-000000000001', 'direct', null, 'bb000000-0000-0000-0000-000000000001');
insert into public.thread_participants (thread_id, profile_id, role, joined_at) values
  ('71000000-0000-0000-0000-00000000000b', 'aa000000-0000-0000-0000-000000000002', 'owner', now() - interval '10 days'),
  ('71000000-0000-0000-0000-00000000000b', 'bb000000-0000-0000-0000-000000000001', 'member', now() - interval '10 days'),
  ('71000000-0000-0000-0000-00000000000b', 'bb000000-0000-0000-0000-000000000003', 'member', now() - interval '1 day'),
  ('71000000-0000-0000-0000-00000000000c', 'bb000000-0000-0000-0000-000000000001', 'owner', now() - interval '10 days'),
  ('71000000-0000-0000-0000-00000000000c', 'bb000000-0000-0000-0000-000000000003', 'member', now() - interval '10 days');
insert into public.messages (id, thread_id, sender_profile_id, body, created_at) values
  ('81000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-00000000000b', 'aa000000-0000-0000-0000-000000000002', 'old group msg', now() - interval '5 days'),
  ('81000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-00000000000b', 'bb000000-0000-0000-0000-000000000001', 'new group msg', now() - interval '1 hour'),
  ('81000000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-00000000000c', 'bb000000-0000-0000-0000-000000000001', 'dm', now() - interval '1 hour'),
  ('81000000-0000-0000-0000-000000000004', '71000000-0000-0000-0000-00000000000a', 'aa000000-0000-0000-0000-000000000001', 'announce', now());
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.edit_message('81000000-0000-0000-0000-000000000002','x') $$, '42501', null, 'anonymous cannot edit');
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000001","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.edit_message('81000000-0000-0000-0000-000000000002','edited') $$, 'sender edits own message');
select is((select body from public.messages where id='81000000-0000-0000-0000-000000000002'), 'edited', 'body changed');
select is((select edited_at is not null from public.messages where id='81000000-0000-0000-0000-000000000002'), true, 'edited_at set');
select throws_ok($$ select public.edit_message('81000000-0000-0000-0000-000000000001','x') $$, '42501', null, 'cannot edit someone elses message');
select throws_ok($$ select public.edit_message('81000000-0000-0000-0000-000000000002','  ') $$, '23514', null, 'empty edit refused');
reset role; select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000002","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.edit_message('81000000-0000-0000-0000-000000000002','x') $$, '42501', null, 'staff cannot edit others');
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000001","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.delete_message('81000000-0000-0000-0000-000000000002') $$, 'delete own');
select throws_ok($$ select public.edit_message('81000000-0000-0000-0000-000000000002','x') $$, 'P0001', 'message_removed', 'cannot edit a deleted message');
reset role; select set_config('request.jwt.claims', '{"sub":"dd000000-0000-0000-0000-000000000002","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.edit_message('81000000-0000-0000-0000-000000000002','x') $$, '42501', null, 'another team cannot edit');
reset role;
select * from finish();
rollback;
