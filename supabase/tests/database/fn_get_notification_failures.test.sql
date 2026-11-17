-- public.get_notification_failures
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','u1@example.test'),('22222222-2222-2222-2222-222222222222','u2@example.test');
insert into public.teams (id, name, sport, season_label) values ('e1000000-0000-0000-0000-000000000001','T1','soccer','Fall');
insert into public.team_memberships (team_id, profile_id, role) values ('e1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','admin'),('e1000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','parent');
insert into public.threads (id, team_id, type, title) values ('71000000-0000-0000-0000-00000000000b','e1000000-0000-0000-0000-000000000001','group','G');
insert into public.thread_participants (thread_id, profile_id, role) values ('71000000-0000-0000-0000-00000000000b','22222222-2222-2222-2222-222222222222','member');
delete from public.notification_outbox;
insert into public.notification_outbox (profile_id, category, channel, dedupe_key, status, payload, last_error) values
 ('22222222-2222-2222-2222-222222222222','messages','push','f1','failed','{"team_id":"e1000000-0000-0000-0000-000000000001","preview":"private words"}','expo_http_500'),
 ('22222222-2222-2222-2222-222222222222','messages','push','f2','sent','{"team_id":"e1000000-0000-0000-0000-000000000001"}',null),
 ('22222222-2222-2222-2222-222222222222','messages','email','f3','skipped','{"team_id":"e1000000-0000-0000-0000-000000000001"}','channel_not_configured'),
 ('22222222-2222-2222-2222-222222222222','messages','push','f4','failed','{"team_id":"99999999-9999-9999-9999-999999999999"}','x');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.get_notification_failures('e1000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous cannot call');
reset role; select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.get_notification_failures('e1000000-0000-0000-0000-000000000001')), 2, 'a team admin sees failed and skipped rows for their team only');
select is((select count(*)::int from public.get_notification_failures('e1000000-0000-0000-0000-000000000001') where last_error = 'expo_http_500'), 1, 'with the error code');
reset role; select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.get_notification_failures('e1000000-0000-0000-0000-000000000001')), 0, 'non-admins see nothing');
reset role;
select * from finish();
rollback;
