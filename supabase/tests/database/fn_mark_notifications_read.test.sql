-- public.mark_notifications_read
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','u1@example.test'),('22222222-2222-2222-2222-222222222222','u2@example.test');
insert into public.notification_outbox (id, profile_id, category, channel, dedupe_key, status) values ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','messages','in_app','k1','sent'),('a0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','messages','in_app','k2','sent'),('a0000000-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','messages','in_app','k3','sent'),('a0000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','messages','push','k4','sent');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.mark_notifications_read() $$, '42501', null, 'anonymous cannot call');
reset role; select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select public.mark_notifications_read(array['a0000000-0000-0000-0000-000000000001']::uuid[])), 1, 'marks selected rows');
select is((select public.mark_notifications_read()), 1, 'then the rest of their in-app rows');
reset role;
select is((select count(*)::int from public.notification_outbox where read_at is not null), 2, 'only own in-app rows changed');
reset role;
select * from finish();
rollback;
