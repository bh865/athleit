-- private.enqueue_notification and quiet hours
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
select is((select private.quiet_hours_deliver_after('2026-01-15 12:00:00+00'::timestamptz, '21:00'::time, '07:00'::time, 'America/New_York')), '2026-01-15 12:00:00+00'::timestamptz, 'outside the window: immediate (07:00 EST is 12:00 UTC, window ends)');
select is((select private.quiet_hours_deliver_after('2026-01-15 04:00:00+00'::timestamptz, '21:00'::time, '07:00'::time, 'America/New_York')), '2026-01-15 12:00:00+00'::timestamptz, 'inside the window after midnight: until 07:00 local');
select is((select private.quiet_hours_deliver_after('2026-01-15 03:00:00+00'::timestamptz, '21:00'::time, '07:00'::time, 'America/New_York')), '2026-01-15 12:00:00+00'::timestamptz, 'before midnight local (22:00): deferred to 07:00 next day');
select is((select private.quiet_hours_deliver_after('2026-01-15 22:30:00+00'::timestamptz, '21:00'::time, '07:00'::time, 'UTC')), '2026-01-16 07:00:00+00'::timestamptz, 'crossing midnight in UTC');
select is((select private.quiet_hours_deliver_after('2026-01-15 14:00:00+00'::timestamptz, '13:00'::time, '15:00'::time, 'UTC')), '2026-01-15 15:00:00+00'::timestamptz, 'same-day window');
select is((select private.quiet_hours_deliver_after('2026-01-15 16:00:00+00'::timestamptz, '13:00'::time, '15:00'::time, 'UTC')), '2026-01-15 16:00:00+00'::timestamptz, 'after a same-day window: immediate');
select is(private.quiet_hours_deliver_after(now(), null, null, 'UTC'), now(), 'no quiet hours: immediate');
insert into public.push_devices (profile_id, platform, token) values ('bb000000-0000-0000-0000-000000000003','ios','ExponentPushToken[pppppppppppp]');
update public.notification_preferences set quiet_hours_start='00:00', quiet_hours_end='23:59:59', timezone='UTC' where profile_id='bb000000-0000-0000-0000-000000000003' and channel='push';
select private.enqueue_notification('bb000000-0000-0000-0000-000000000003','messages','{"kind":"message"}'::jsonb,'t1', null, null, false);
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000003' and channel='push' and deliver_after > now()), 1, 'quiet hours defer delivery (deliver_after in the future), not drop it');
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000003' and channel='in_app'), 1, 'in-app rows ignore quiet hours');
select private.enqueue_notification('bb000000-0000-0000-0000-000000000003','messages','{"kind":"message"}'::jsonb,'t1', null, null, false);
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000003' ), 2, 'the same dedupe base twice is collapsed');
select private.enqueue_notification('bb000000-0000-0000-0000-000000000003','schedule','{}'::jsonb,'t2', null, 'preview text', false);
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000003' and category='schedule' and payload ? 'preview'), 0, 'previews are off by default');
update public.notification_preferences set include_preview=true where profile_id='bb000000-0000-0000-0000-000000000003' and channel='push' and category='schedule';
select private.enqueue_notification('bb000000-0000-0000-0000-000000000003','schedule','{}'::jsonb,'t3', null, 'preview text', false);
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000003' and category='schedule' and channel='push' and payload->>'preview'='preview text'), 1, 'opted-in previews are included');
select private.enqueue_notification('bb000000-0000-0000-0000-000000000003','schedule','{}'::jsonb,'t4', null, 'preview text', true);
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000003' and dedupe_key='t4:push' and payload ? 'preview'), 0, 'sensitive threads never include a preview');
update public.push_devices set revoked_at=now() where profile_id='bb000000-0000-0000-0000-000000000003';
select private.enqueue_notification('bb000000-0000-0000-0000-000000000003','schedule','{}'::jsonb,'t5', null, null, false);
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000003' and dedupe_key='t5:push'), 0, 'a revoked device gets no push');
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000003' and dedupe_key='t5:email'), 1, 'email is the fallback when there is no active push device');
update public.notification_preferences set enabled=false where profile_id='bb000000-0000-0000-0000-000000000003' and channel='email' and category='schedule';
select private.enqueue_notification('bb000000-0000-0000-0000-000000000003','schedule','{}'::jsonb,'t6', null, null, false);
select is((select count(*)::int from public.notification_outbox where profile_id='bb000000-0000-0000-0000-000000000003' and dedupe_key like 't6:%' and channel<>'in_app'), 0, 'email honours preferences');
delete from public.notification_outbox;
select private.notify_schedule_change('e1000000-0000-0000-0000-000000000001','time_changed','b1000000-0000-0000-0000-000000000001','Practice','v1');
select private.notify_schedule_change('e1000000-0000-0000-0000-000000000001','time_changed','b1000000-0000-0000-0000-000000000001','Practice','v1');
select is((select count(*)::int from public.notification_outbox where channel='in_app' and category='schedule'), 7, 'schedule changes reach every active team member once');
select is((select count(*)::int from public.notification_outbox where category='schedule' and profile_id in ('dd000000-0000-0000-0000-000000000002','dd000000-0000-0000-0000-000000000001')), 0, 'and nobody on another team');
select throws_ok($$ select private.notify_schedule_change('e1000000-0000-0000-0000-000000000001','bogus','b1000000-0000-0000-0000-000000000001','x') $$, '23514', null, 'unknown change kind refused');
reset role;
select * from finish();
rollback;
