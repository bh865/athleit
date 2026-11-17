-- delivery plumbing: kick is a safe no-op without secrets; the sweep is scheduled; trigger exists
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','u1@example.test'),('22222222-2222-2222-2222-222222222222','u2@example.test');
insert into public.teams (id, name, sport, season_label) values ('e1000000-0000-0000-0000-000000000001','T1','soccer','Fall');
insert into public.team_memberships (team_id, profile_id, role) values ('e1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','admin'),('e1000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','parent');
insert into public.threads (id, team_id, type, title) values ('71000000-0000-0000-0000-00000000000b','e1000000-0000-0000-0000-000000000001','group','G');
insert into public.thread_participants (thread_id, profile_id, role) values ('71000000-0000-0000-0000-00000000000b','22222222-2222-2222-2222-222222222222','member');
delete from public.notification_outbox;
select lives_ok($$ select private.kick_delivery() $$, 'kick without Vault secrets is a no-op');
select lives_ok($$ insert into public.notification_outbox (profile_id, category, channel, dedupe_key) values ('22222222-2222-2222-2222-222222222222','messages','push','z1') $$, 'inserting an outbox row never fails because of the kick');
select lives_ok($$ select private.sweep_notifications() $$, 'the sweep runs');
select is((select count(*)::int from cron.job where jobname='notification-sweep' and schedule='* * * * *'), 1, 'the one-minute sweep is scheduled');
select is((select count(*)::int from pg_trigger where tgname='notification_outbox_kick' and not tgisinternal), 1, 'the statement-level kick trigger exists');
reset role;
select * from finish();
rollback;
