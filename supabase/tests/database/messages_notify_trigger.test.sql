-- messages notify trigger
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
delete from public.notification_outbox;
insert into public.push_devices (profile_id, platform, token) values ('aa000000-0000-0000-0000-000000000002','ios','ExponentPushToken[cccccccccccc]');
insert into public.push_devices (profile_id, platform, token) values ('bb000000-0000-0000-0000-000000000003','ios','ExponentPushToken[pppppppppppp]');
insert into public.messages (thread_id, sender_profile_id, body) values ('71000000-0000-0000-0000-00000000000b','bb000000-0000-0000-0000-000000000001','hello group');
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000001' ), 0, 'the sender gets nothing');
select is((select count(*)::int from public.notification_outbox where profile_id='aa000000-0000-0000-0000-000000000002' and channel='in_app'), 1, 'a recipient gets an in-app row');
select is((select count(*)::int from public.notification_outbox where profile_id='aa000000-0000-0000-0000-000000000002' and channel='push'), 1, 'and exactly one push (they have a device)');
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000003' and channel='push'), 1, 'every eligible recipient gets exactly one push');
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000002' ), 0, 'non-participants get nothing');
select is((select count(*)::int from public.notification_outbox where profile_id='dd000000-0000-0000-0000-000000000002' ), 0, 'another team gets nothing');
select is((select count(*)::int from public.notification_outbox where profile_id='aa000000-0000-0000-0000-000000000001' ), 0, 'oversight admins are not notified of group chatter');
select is((select count(*)::int from public.notification_outbox where channel='push'), 2, 'two pushes in total');
select is((select count(*)::int from public.notification_outbox where channel='email'), 0, 'no email for people who have push devices');
insert into public.messages (thread_id, sender_profile_id, body) values ('71000000-0000-0000-0000-00000000000b','bb000000-0000-0000-0000-000000000001','second in burst');
select is((select count(*)::int from public.notification_outbox where channel='push'), 2, 'a burst collapses via dedupe_key');
update public.thread_participants set muted_until = now() + interval '1 hour' where thread_id='71000000-0000-0000-0000-00000000000b' and profile_id='bb000000-0000-0000-0000-000000000003';
delete from public.notification_outbox;
select pg_sleep(0);
insert into public.messages (thread_id, sender_profile_id, body) values ('71000000-0000-0000-0000-00000000000b','aa000000-0000-0000-0000-000000000002','muted test');
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000003' ), 0, 'a muted participant gets nothing');
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000001' and channel='email'), 1, 'par1 has no device: email fallback');
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000001' and channel='push'), 0, 'and no push');
delete from public.notification_outbox;
update public.notification_preferences set enabled=false where profile_id='bb000000-0000-0000-0000-000000000001' and category='messages';
insert into public.messages (thread_id, sender_profile_id, body) values ('71000000-0000-0000-0000-00000000000b','aa000000-0000-0000-0000-000000000002','prefs test');
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000001' and channel in ('email','push')), 0, 'disabled preferences produce no delivery rows');
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000001' and channel='in_app'), 1, 'the in-app feed still records it');
delete from public.notification_outbox;
update public.thread_participants set left_at = now() where thread_id='71000000-0000-0000-0000-00000000000b' and profile_id='bb000000-0000-0000-0000-000000000001';
insert into public.messages (thread_id, sender_profile_id, body) values ('71000000-0000-0000-0000-00000000000b','aa000000-0000-0000-0000-000000000002','left test');
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000001' ), 0, 'a participant who left gets nothing');
delete from public.notification_outbox;
insert into public.messages (thread_id, sender_profile_id, body) values ('71000000-0000-0000-0000-00000000000a','aa000000-0000-0000-0000-000000000001','announce');
select is((select count(*)::int from public.notification_outbox where channel='in_app' and category='announcements'), 6, 'announcements reach every other active team member');
select is((select count(*)::int from public.notification_outbox where profile_id='aa000000-0000-0000-0000-000000000001' ), 0, 'not the sender');
select is((select count(*)::int from public.notification_outbox where profile_id='dd000000-0000-0000-0000-000000000002'  ), 0, 'not another team');
select is((select count(*)::int from public.notification_outbox where profile_id='cc000000-0000-0000-0000-000000000001' and category='announcements' and channel='in_app'), 1, 'players get announcements');
select is((select count(*)::int from public.notification_outbox where category='messages'), 0, 'announcements use their own category');
delete from public.notification_outbox;
insert into public.thread_participants (thread_id, profile_id, role) values ('71000000-0000-0000-0000-00000000000b','cc000000-0000-0000-0000-000000000001','member');
update public.thread_participants set left_at=null where thread_id='71000000-0000-0000-0000-00000000000b' and profile_id='bb000000-0000-0000-0000-000000000001';
update public.notification_preferences set include_preview=true where profile_id='aa000000-0000-0000-0000-000000000002' and channel='push' and category='messages';
insert into public.messages (thread_id, sender_profile_id, body) values ('71000000-0000-0000-0000-00000000000b','bb000000-0000-0000-0000-000000000003','secret words here');
select is((select (payload->>'sensitive')::boolean from public.notification_outbox where profile_id='aa000000-0000-0000-0000-000000000002' and channel='push'), true, 'threads with a minor are flagged sensitive');
select is((select payload ? 'preview' from public.notification_outbox where profile_id='aa000000-0000-0000-0000-000000000002' and channel='push'), false, 'and never carry a preview, even when opted in');
select is((select payload->>'title' from public.notification_outbox where profile_id='aa000000-0000-0000-0000-000000000002' and channel='push'), 'Group', 'title is the thread title');
delete from public.notification_outbox;
insert into public.threads (id, team_id, type, title, created_by) values ('71000000-0000-0000-0000-0000000000d1','e1000000-0000-0000-0000-000000000001','group','Adults','aa000000-0000-0000-0000-000000000002');
insert into public.thread_participants (thread_id, profile_id, role) values ('71000000-0000-0000-0000-0000000000d1','aa000000-0000-0000-0000-000000000002','owner'),('71000000-0000-0000-0000-0000000000d1','bb000000-0000-0000-0000-000000000003','member');
insert into public.messages (thread_id, sender_profile_id, body) values ('71000000-0000-0000-0000-0000000000d1','bb000000-0000-0000-0000-000000000003','adult chat words');
select is((select payload->>'preview' from public.notification_outbox where profile_id='aa000000-0000-0000-0000-000000000002' and channel='push'), 'adult chat words', 'an opted-in recipient gets a preview in an adult-only thread');
select is((select payload ? 'preview' from public.notification_outbox where profile_id='aa000000-0000-0000-0000-000000000002' and channel='in_app'), false, 'the in-app row never stores the preview');
delete from public.notification_outbox;
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000003","role":"authenticated"}', true); set local role authenticated;
select public.send_message('71000000-0000-0000-0000-00000000000b','via function');
reset role;
select is((select count(*)::int from public.notification_outbox where channel='in_app'), 3, 'send_message notifies the other participants (coach, par1, teen)');
reset role;
select * from finish();
rollback;
