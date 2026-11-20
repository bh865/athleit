-- public.platform_settings: no client grants and no policies; only SECURITY DEFINER functions and the service role touch it
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create function pg_temp.login(u uuid) returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true); end $f$;
create function pg_temp.anon() returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true); end $f$;

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'plain@example.test'), ('a2222222-2222-2222-2222-222222222222', 'platform.owner@example.test');
insert into public.platform_admins (profile_id, role) values ('a2222222-2222-2222-2222-222222222222', 'owner');

select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select throws_ok($$select count(*) from public.platform_settings$$, '42501', null, 'a signed-in user cannot read platform_settings');
select throws_ok($$delete from public.platform_settings$$, '42501', null, 'a signed-in user cannot delete from platform_settings');
reset role;
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select throws_ok($$select count(*) from public.platform_settings$$, '42501', null, 'even a platform admin has no table access, only functions');
reset role;
select pg_temp.anon();
select throws_ok($$select count(*) from public.platform_settings$$, '42501', null, 'anon cannot read platform_settings');
reset role;
select * from finish();
rollback;
