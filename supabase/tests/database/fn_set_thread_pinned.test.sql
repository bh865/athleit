-- fn_set_thread_pinned
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
insert into auth.users (id, email) values ('bb000000-0000-0000-0000-000000000004', 'par4@example.test');
insert into public.team_memberships (team_id, profile_id, role) values
  ('e1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000004', 'parent');
insert into public.thread_participants (thread_id, profile_id, role, joined_at, left_at) values
  ('71000000-0000-0000-0000-00000000000b', 'bb000000-0000-0000-0000-000000000004', 'member', now() - interval '10 days', now() - interval '2 days');


reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000001","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.set_thread_pinned('71000000-0000-0000-0000-00000000000b', true) $$, 'a participant can pin a group');
select ok((select pinned_at is not null from public.thread_user_state where thread_id='71000000-0000-0000-0000-00000000000b' and profile_id='bb000000-0000-0000-0000-000000000001'), 'pin stored on own row');
select lives_ok($$ select public.set_thread_pinned('71000000-0000-0000-0000-00000000000a', true) $$, 'a member can pin an announcement');
select is((select count(*)::int from public.thread_participants where thread_id='71000000-0000-0000-0000-00000000000a' and profile_id='bb000000-0000-0000-0000-000000000001'), 0, 'pinning an announcement creates no participant row');
select is(private.can_post_thread('71000000-0000-0000-0000-00000000000a'), false, 'the pin row grants no posting');
select lives_ok($$ select public.set_thread_pinned('71000000-0000-0000-0000-00000000000b', false) $$, 'unpin');
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000002","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.set_thread_pinned('71000000-0000-0000-0000-00000000000b', true) $$, '42501', null, 'a non-participant stranger-in-team cannot pin a group');
select is((select count(*)::int from public.thread_participants where thread_id='71000000-0000-0000-0000-00000000000b' and profile_id='bb000000-0000-0000-0000-000000000002'), 0, 'and no row was created');
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000004","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.set_thread_pinned('71000000-0000-0000-0000-00000000000b', true) $$, '42501', null, 'a removed member cannot pin');
select is((select count(*)::int from public.thread_user_state where thread_id='71000000-0000-0000-0000-00000000000b' and profile_id='bb000000-0000-0000-0000-000000000004'), 0, 'and the removed row stays unpinned');
reset role; select set_config('request.jwt.claims', '{"sub":"dd000000-0000-0000-0000-000000000002","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.set_thread_pinned('71000000-0000-0000-0000-00000000000a', true) $$, '42501', null, 'another team cannot pin an announcement');
select is((select count(*)::int from public.thread_user_state where thread_id='71000000-0000-0000-0000-00000000000a' and profile_id='dd000000-0000-0000-0000-000000000002'), 0, 'and no stranger row is created');
reset role; select set_config('request.jwt.claims', '{"sub":"cc000000-0000-0000-0000-000000000001","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.set_thread_pinned('71000000-0000-0000-0000-00000000000a', true) $$, 'a player 13-17 can pin the team announcement thread');
reset role;
-- the 6th pin returns a friendly error
insert into public.threads (id, team_id, type, title, created_by)
  select ('72000000-0000-0000-0000-00000000000'||g)::uuid, 'e1000000-0000-0000-0000-000000000001', 'group', 'G'||g, 'aa000000-0000-0000-0000-000000000002' from generate_series(1,5) g;
insert into public.thread_participants (thread_id, profile_id, role)
  select ('72000000-0000-0000-0000-00000000000'||g)::uuid, 'bb000000-0000-0000-0000-000000000001', 'member' from generate_series(1,5) g;
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000001","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.set_thread_pinned(('72000000-0000-0000-0000-00000000000'||g)::uuid, true) from generate_series(1,4) g $$, 'pins 2-5 fit (the group was pinned first)');
select throws_ok($$ select public.set_thread_pinned('72000000-0000-0000-0000-000000000005', true) $$, 'P0001', 'pin_limit_reached', 'the sixth pin returns a friendly error');


-- Other members cannot read someone else's pin state.
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000003","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.thread_user_state where profile_id='bb000000-0000-0000-0000-000000000001'), 0, 'a fellow member cannot read another member''s pin state');
select is((select count(*)::int from public.thread_user_state where profile_id='bb000000-0000-0000-0000-000000000003'), 0, 'and has none of their own yet');
-- Pins on threads the caller can no longer read do not use a slot.
reset role;
insert into public.threads (id, team_id, type, title, created_by)
  select ('73000000-0000-0000-0000-00000000000'||g)::uuid, 'e2000000-0000-0000-0000-000000000002', 'announcement', 'Gone'||g, 'dd000000-0000-0000-0000-000000000001' from generate_series(1,5) g;
insert into public.thread_user_state (thread_id, profile_id, pinned_at)
  select ('73000000-0000-0000-0000-00000000000'||g)::uuid, 'bb000000-0000-0000-0000-000000000003', now() from generate_series(1,5) g;
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000003","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.set_thread_pinned('71000000-0000-0000-0000-00000000000b', true) $$, 'stale pins on unreadable threads do not count toward the cap');
reset role;
select * from finish();
rollback;
