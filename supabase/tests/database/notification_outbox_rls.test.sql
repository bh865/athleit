-- public.notification_outbox RLS
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','u1@example.test'),('22222222-2222-2222-2222-222222222222','u2@example.test');
insert into public.notification_outbox (profile_id, category, channel, dedupe_key, status) values ('11111111-1111-1111-1111-111111111111','messages','in_app','k1','sent'),('11111111-1111-1111-1111-111111111111','messages','push','k2','pending'),('22222222-2222-2222-2222-222222222222','messages','in_app','k3','sent');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select 1 from public.notification_outbox $$, '42501', null, 'anonymous has no access');
reset role; select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.notification_outbox), 1, 'a user sees only their own in-app rows (never delivery rows)');
select throws_ok($$ insert into public.notification_outbox (profile_id, category, channel, dedupe_key) values ('11111111-1111-1111-1111-111111111111','messages','in_app','k9') $$, '42501', null, 'no direct inserts');
select throws_ok($$ update public.notification_outbox set status='sent' $$, '42501', null, 'no direct updates');
select throws_ok($$ delete from public.notification_outbox $$, '42501', null, 'no direct deletes');
reset role;
select throws_ok($$ insert into public.notification_outbox (profile_id, category, channel, dedupe_key) values ('11111111-1111-1111-1111-111111111111','messages','in_app','k1') $$, '23505', null, 'dedupe_key is unique');
select throws_ok($$ insert into public.notification_outbox (profile_id, category, channel, dedupe_key, status) values ('11111111-1111-1111-1111-111111111111','messages','push','k7','weird') $$, '23514', null, 'status is constrained');
reset role;
select * from finish();
rollback;
