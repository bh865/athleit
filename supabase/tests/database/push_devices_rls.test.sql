-- public.push_devices RLS
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','u1@example.test'),('22222222-2222-2222-2222-222222222222','u2@example.test');
insert into public.push_devices (profile_id, platform, token) values ('11111111-1111-1111-1111-111111111111','ios','ExponentPushToken[aaaaaaaaaaaa]'),('22222222-2222-2222-2222-222222222222','android','ExponentPushToken[bbbbbbbbbbbb]');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select 1 from public.push_devices $$, '42501', null, 'anonymous has no access');
reset role; select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.push_devices), 1, 'a user sees only their own devices');
select throws_ok($$ insert into public.push_devices (profile_id, platform, token) values ('11111111-1111-1111-1111-111111111111','ios','ExponentPushToken[cccccccccccc]') $$, '42501', null, 'no direct inserts');
select throws_ok($$ update public.push_devices set revoked_at=now() $$, '42501', null, 'no direct updates');
select throws_ok($$ delete from public.push_devices $$, '42501', null, 'no direct deletes');
reset role;
select * from finish();
rollback;
