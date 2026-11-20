-- fn_get_inbox
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


-- a second team for the parity test: par1 is also a parent on T2 with its own thread
insert into public.team_memberships (team_id, profile_id, role) values ('e2000000-0000-0000-0000-000000000002','bb000000-0000-0000-0000-000000000001','parent');
insert into public.threads (id, team_id, type, title, created_by) values
  ('71000000-0000-0000-0000-0000000000d1','e2000000-0000-0000-0000-000000000002','announcement','T2 news','dd000000-0000-0000-0000-000000000001');
insert into public.messages (thread_id, sender_profile_id, body) values ('71000000-0000-0000-0000-0000000000d1','dd000000-0000-0000-0000-000000000001','t2 announce');
create temp table parity(uid uuid, ok boolean);
reset role; select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000002","role":"authenticated"}', true); set local role authenticated;

select ok(
  (select coalesce(array_agg(thread_id order by thread_id), '{}') from public.get_inbox(100))
  = (select coalesce(array_agg(thread_id order by thread_id), '{}') from (
       select tl.thread_id from public.team_memberships tm, lateral public.get_thread_list(tm.team_id) tl
       where tm.profile_id='aa000000-0000-0000-0000-000000000002' and tm.status='active') s),
  'get_inbox equals the union of get_thread_list over the caller teams (coach)');
reset role; select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000001","role":"authenticated"}', true); set local role authenticated;

select ok(
  (select coalesce(array_agg(thread_id order by thread_id), '{}') from public.get_inbox(100))
  = (select coalesce(array_agg(thread_id order by thread_id), '{}') from (
       select tl.thread_id from public.team_memberships tm, lateral public.get_thread_list(tm.team_id) tl
       where tm.profile_id='aa000000-0000-0000-0000-000000000001' and tm.status='active') s),
  'get_inbox equals the union of get_thread_list over the caller teams (admin)');
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000001","role":"authenticated"}', true); set local role authenticated;

select ok(
  (select coalesce(array_agg(thread_id order by thread_id), '{}') from public.get_inbox(100))
  = (select coalesce(array_agg(thread_id order by thread_id), '{}') from (
       select tl.thread_id from public.team_memberships tm, lateral public.get_thread_list(tm.team_id) tl
       where tm.profile_id='bb000000-0000-0000-0000-000000000001' and tm.status='active') s),
  'get_inbox equals the union of get_thread_list over the caller teams (parent on two teams)');
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000002","role":"authenticated"}', true); set local role authenticated;

select ok(
  (select coalesce(array_agg(thread_id order by thread_id), '{}') from public.get_inbox(100))
  = (select coalesce(array_agg(thread_id order by thread_id), '{}') from (
       select tl.thread_id from public.team_memberships tm, lateral public.get_thread_list(tm.team_id) tl
       where tm.profile_id='bb000000-0000-0000-0000-000000000002' and tm.status='active') s),
  'get_inbox equals the union of get_thread_list over the caller teams (parent 2)');
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000003","role":"authenticated"}', true); set local role authenticated;

select ok(
  (select coalesce(array_agg(thread_id order by thread_id), '{}') from public.get_inbox(100))
  = (select coalesce(array_agg(thread_id order by thread_id), '{}') from (
       select tl.thread_id from public.team_memberships tm, lateral public.get_thread_list(tm.team_id) tl
       where tm.profile_id='bb000000-0000-0000-0000-000000000003' and tm.status='active') s),
  'get_inbox equals the union of get_thread_list over the caller teams (parent 3)');
reset role; select set_config('request.jwt.claims', '{"sub":"cc000000-0000-0000-0000-000000000001","role":"authenticated"}', true); set local role authenticated;

select ok(
  (select coalesce(array_agg(thread_id order by thread_id), '{}') from public.get_inbox(100))
  = (select coalesce(array_agg(thread_id order by thread_id), '{}') from (
       select tl.thread_id from public.team_memberships tm, lateral public.get_thread_list(tm.team_id) tl
       where tm.profile_id='cc000000-0000-0000-0000-000000000001' and tm.status='active') s),
  'get_inbox equals the union of get_thread_list over the caller teams (player 13-17)');
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000004","role":"authenticated"}', true); set local role authenticated;

select ok(
  (select coalesce(array_agg(thread_id order by thread_id), '{}') from public.get_inbox(100))
  = (select coalesce(array_agg(thread_id order by thread_id), '{}') from (
       select tl.thread_id from public.team_memberships tm, lateral public.get_thread_list(tm.team_id) tl
       where tm.profile_id='bb000000-0000-0000-0000-000000000004' and tm.status='active') s),
  'get_inbox equals the union of get_thread_list over the caller teams (removed member)');
reset role; select set_config('request.jwt.claims', '{"sub":"dd000000-0000-0000-0000-000000000002","role":"authenticated"}', true); set local role authenticated;

select ok(
  (select coalesce(array_agg(thread_id order by thread_id), '{}') from public.get_inbox(100))
  = (select coalesce(array_agg(thread_id order by thread_id), '{}') from (
       select tl.thread_id from public.team_memberships tm, lateral public.get_thread_list(tm.team_id) tl
       where tm.profile_id='dd000000-0000-0000-0000-000000000002' and tm.status='active') s),
  'get_inbox equals the union of get_thread_list over the caller teams (other-team parent)');
reset role; select set_config('request.jwt.claims', '{"sub":"dd000000-0000-0000-0000-000000000001","role":"authenticated"}', true); set local role authenticated;

select ok(
  (select coalesce(array_agg(thread_id order by thread_id), '{}') from public.get_inbox(100))
  = (select coalesce(array_agg(thread_id order by thread_id), '{}') from (
       select tl.thread_id from public.team_memberships tm, lateral public.get_thread_list(tm.team_id) tl
       where tm.profile_id='dd000000-0000-0000-0000-000000000001' and tm.status='active') s),
  'get_inbox equals the union of get_thread_list over the caller teams (other-team admin)');
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000001","role":"authenticated"}', true); set local role authenticated;

select is((select count(*)::int from public.get_inbox(100) where team_id='e2000000-0000-0000-0000-000000000002'), 1, 'a person on two teams sees both teams in one list');
select is((select team_name from public.get_inbox(100) where thread_id='71000000-0000-0000-0000-0000000000d1'), 'T2', 'each row carries its team name');
select is((select other_profile_id from public.get_inbox(100) where thread_id='71000000-0000-0000-0000-00000000000c'), 'bb000000-0000-0000-0000-000000000003'::uuid, 'direct rows carry the other profile id');
select is((select last_read_count from public.get_inbox(100) where thread_id='71000000-0000-0000-0000-00000000000b'), null, 'a parent never gets read counts');
select is((select count(*)::int from public.get_inbox(100) where thread_id='71000000-0000-0000-0000-00000000000b' and unread_count > 0), 1, 'unread excludes own messages and honours join time');
-- pinned first, and a pinned thread is not repeated on later pages
select public.set_thread_pinned('71000000-0000-0000-0000-00000000000c', true);
select is((select thread_id from public.get_inbox(100) limit 1), '71000000-0000-0000-0000-00000000000c'::uuid, 'pinned threads come first');
select is((select count(*)::int from public.get_inbox(100, now() + interval '1 day', 'ffffffff-ffff-ffff-ffff-ffffffffffff') where pinned_at is not null), 0, 'cursor pages exclude pinned threads');
-- stranger and removed member never see threads they cannot read
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000004","role":"authenticated"}', true); set local role authenticated;

select is((select count(*)::int from public.get_inbox(100) where thread_id='71000000-0000-0000-0000-00000000000b'), 0, 'a removed member does not get the group');
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000002","role":"authenticated"}', true); set local role authenticated;

select is((select count(*)::int from public.get_inbox(100) where thread_id in ('71000000-0000-0000-0000-00000000000c','71000000-0000-0000-0000-00000000000b')), 0, 'another family never gets a direct thread or a group they are not in');
reset role; select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000002","role":"authenticated"}', true); set local role authenticated;

select ok((select last_read_total from public.get_inbox(100) where thread_id='71000000-0000-0000-0000-00000000000b') is null, 'no read counts when the newest message is not the caller''s');
reset role; insert into public.messages (thread_id, sender_profile_id, body) values ('71000000-0000-0000-0000-00000000000b','aa000000-0000-0000-0000-000000000002','coach says');
insert into public.message_reads (thread_id, profile_id, last_read_message_id)
  select '71000000-0000-0000-0000-00000000000b','bb000000-0000-0000-0000-000000000001', id from public.messages where thread_id='71000000-0000-0000-0000-00000000000b' and body='coach says';
reset role; select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000002","role":"authenticated"}', true); set local role authenticated;

select is((select last_read_count from public.get_inbox(100) where thread_id='71000000-0000-0000-0000-00000000000b'), 1, 'staff see how many have read their newest message');
select is((select last_read_total from public.get_inbox(100) where thread_id='71000000-0000-0000-0000-00000000000b'), 2, 'out of the other participants');

reset role;
select * from finish();
rollback;
