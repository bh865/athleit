-- public.create_thread
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
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','group','x',array['bb000000-0000-0000-0000-000000000001']::uuid[]) $$, '42501', null, 'anonymous cannot create threads');
reset role; select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000002","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','announcement','Season news',array[]::uuid[]) $$, 'staff create an announcement');
select lives_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','group','Parents',array['bb000000-0000-0000-0000-000000000001','bb000000-0000-0000-0000-000000000003']::uuid[]) $$, 'staff create a group');
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','group','Teen group',array['cc000000-0000-0000-0000-000000000001']::uuid[]) $$, 'P0001', 'minor_group_needs_two_adults', 'a minor group with one staff adult and no guardian is refused');
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','group','Teen group',array['cc000000-0000-0000-0000-000000000001','bb000000-0000-0000-0000-000000000003']::uuid[]) $$, 'P0001', 'minor_group_needs_two_adults', 'a non-guardian parent does not satisfy the rule');
select lives_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','group','Teen+admin',array['cc000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001']::uuid[]) $$, 'two staff adults satisfy the rule');
select lives_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','group','Teen+guardian',array['cc000000-0000-0000-0000-000000000001','bb000000-0000-0000-0000-000000000001']::uuid[]) $$, 'one staff adult plus the minors guardian satisfies the rule');
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','group','No one',array[]::uuid[]) $$, 'P0001', 'group_needs_participants', 'group needs participants');
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','announcement',' ',array[]::uuid[]) $$, '23514', null, 'announcement needs a title');
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','group','X',array['dd000000-0000-0000-0000-000000000002']::uuid[]) $$, 'P0001', 'participant_not_in_team', 'cannot add someone from another team');
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','bogus','X',array['bb000000-0000-0000-0000-000000000001']::uuid[]) $$, '23514', null, 'invalid type refused');
select lives_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','direct',null,array['bb000000-0000-0000-0000-000000000001']::uuid[]) $$, 'staff can open a direct thread with a guardian');
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','direct',null,array['cc000000-0000-0000-0000-000000000001']::uuid[]) $$, 'P0001', 'direct_minor_guardian_only', 'staff cannot open a 1:1 with a minor');
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','direct',null,array['bb000000-0000-0000-0000-000000000001','bb000000-0000-0000-0000-000000000003']::uuid[]) $$, 'P0001', 'direct_needs_one_participant', 'direct needs exactly one other');
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000001","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','announcement','x',array[]::uuid[]) $$, '42501', null, 'parents cannot create announcements');
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','group','x',array['bb000000-0000-0000-0000-000000000003']::uuid[]) $$, '42501', null, 'parents cannot create groups');
select lives_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','direct',null,array['bb000000-0000-0000-0000-000000000003']::uuid[]) $$, 'parents can open a direct thread with an adult');
select is(public.create_thread('e1000000-0000-0000-0000-000000000001','direct',null,array['bb000000-0000-0000-0000-000000000003']::uuid[]), public.create_thread('e1000000-0000-0000-0000-000000000001','direct',null,array['bb000000-0000-0000-0000-000000000003']::uuid[]), 'the same pair reuses its direct thread');
select is(public.create_thread('e1000000-0000-0000-0000-000000000001','direct',null,array['bb000000-0000-0000-0000-000000000003']::uuid[]), '71000000-0000-0000-0000-00000000000c'::uuid, 'the existing direct thread is reused');
select lives_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','direct',null,array['cc000000-0000-0000-0000-000000000001']::uuid[]) $$, 'a guardian can open a 1:1 with their own minor');
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000003","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','direct',null,array['cc000000-0000-0000-0000-000000000001']::uuid[]) $$, 'P0001', 'direct_minor_guardian_only', 'a non-guardian parent cannot open a 1:1 with a minor');
reset role; select set_config('request.jwt.claims', '{"sub":"cc000000-0000-0000-0000-000000000001","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','direct',null,array['bb000000-0000-0000-0000-000000000003']::uuid[]) $$, 'P0001', 'direct_minor_guardian_only', 'a teen cannot open a 1:1 with a non-guardian adult');
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','direct',null,array['aa000000-0000-0000-0000-000000000002']::uuid[]) $$, 'P0001', 'direct_minor_guardian_only', 'a teen cannot open a 1:1 with staff');
select lives_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','direct',null,array['bb000000-0000-0000-0000-000000000001']::uuid[]) $$, 'a teen can open a 1:1 with their guardian');
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','group','x',array['bb000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000002']::uuid[]) $$, '42501', null, 'teens cannot create groups');
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','announcement','x',array[]::uuid[]) $$, '42501', null, 'teens cannot create announcements');
reset role; select set_config('request.jwt.claims', '{"sub":"dd000000-0000-0000-0000-000000000002","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.create_thread('e1000000-0000-0000-0000-000000000001','direct',null,array['bb000000-0000-0000-0000-000000000001']::uuid[]) $$, '42501', null, 'a non-member of the team cannot create threads');
reset role;
select is((select count(*)::int from public.audit_log where action='thread.create' and created_at = now()), 9, 'thread creation is audited');
reset role;
select * from finish();
rollback;
