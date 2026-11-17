-- public.claim_notifications
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','u1@example.test'),('22222222-2222-2222-2222-222222222222','u2@example.test');
insert into public.teams (id, name, sport, season_label) values ('e1000000-0000-0000-0000-000000000001','T1','soccer','Fall');
insert into public.team_memberships (team_id, profile_id, role) values ('e1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','admin'),('e1000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','parent');
insert into public.threads (id, team_id, type, title) values ('71000000-0000-0000-0000-00000000000b','e1000000-0000-0000-0000-000000000001','group','G');
insert into public.thread_participants (thread_id, profile_id, role) values ('71000000-0000-0000-0000-00000000000b','22222222-2222-2222-2222-222222222222','member');
delete from public.notification_outbox;
insert into public.notification_outbox (id, profile_id, category, channel, dedupe_key, status, deliver_after, attempts) values
 ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','messages','push','k1','pending', now() - interval '1 minute', 0),
 ('a0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','messages','push','k2','pending', now() + interval '8 hours', 0),
 ('a0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','messages','email','k3','failed', now() - interval '1 second', 2),
 ('a0000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','messages','push','k4','failed', now() - interval '1 second', 5),
 ('a0000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','messages','push','k5','sent', now() - interval '1 hour', 1),
 ('a0000000-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','messages','in_app','k6','sent', now() - interval '1 hour', 0),
 ('a0000000-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','messages','push','k7','sending', now() - interval '1 minute', 1),
 ('a0000000-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','messages','push','k8','sending', now() + interval '3 minutes', 1);
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.claim_notifications(10) $$, '42501', null, 'anonymous cannot claim');
reset role; select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select * from public.claim_notifications(10) $$, '42501', null, 'signed-in users cannot claim');
reset role; set local role service_role;
select is((select count(*)::int from public.claim_notifications(10)), 3, 'claims due pending, due failed and expired-lease rows only');
reset role;
select is((select status from public.notification_outbox where id='a0000000-0000-0000-0000-000000000001'), 'sending', 'claimed rows move to sending');
select is((select deliver_after > now() + interval '4 minutes' from public.notification_outbox where id='a0000000-0000-0000-0000-000000000001'), true, 'with a lease');
select is((select status from public.notification_outbox where id='a0000000-0000-0000-0000-000000000002'), 'pending', 'deferred (quiet-hours) rows are left alone');
select is((select status from public.notification_outbox where id='a0000000-0000-0000-0000-000000000004'), 'failed', 'rows past the attempt limit are never claimed');
select is((select status from public.notification_outbox where id='a0000000-0000-0000-0000-000000000006'), 'sent', 'in-app rows are never claimed');
set local role service_role;
select is((select count(*)::int from public.claim_notifications(10)), 0, 'a second claim returns nothing: no double delivery');
reset role;
select * from finish();
rollback;
