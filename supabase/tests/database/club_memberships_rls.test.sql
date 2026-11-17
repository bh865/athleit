-- RLS tests for public.club_memberships (+ last-admin rule)
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'c@example.test');
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
insert into public.club_memberships (id, club_id, profile_id, role) values
  ('e0000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
  ('e0000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'manager');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.club_memberships $$, '42501', null, 'anonymous users cannot read club memberships');

reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.club_memberships), 2, 'club admin reads every membership in their club');
select throws_ok($$ insert into public.club_memberships (club_id, profile_id, role) values ('c1000000-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'admin') $$, '42501', null, 'memberships cannot be inserted directly (invites only)');
select lives_ok($$ update public.club_memberships set role = 'admin' where id = 'e0000000-0000-0000-0000-00000000000b' $$, 'admin can promote the manager');
select throws_ok($$ update public.club_memberships set profile_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' where id = 'e0000000-0000-0000-0000-00000000000b' $$, '42501', null, 'profile_id is not editable');
select lives_ok($$ update public.club_memberships set role = 'manager' where id = 'e0000000-0000-0000-0000-00000000000a' $$, 'with two admins, one can step down');
-- A is now manager, B is the only admin.
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ update public.club_memberships set role = 'admin' where id = 'e0000000-0000-0000-0000-00000000000a' returning 1 $$, 'a manager cannot promote themselves (zero rows)');
select is((select count(*)::int from public.club_memberships), 1, 'a manager reads only their own membership');

reset role; select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ update public.club_memberships set role = 'manager' where id = 'e0000000-0000-0000-0000-00000000000b' $$, 'P0001', 'last_admin', 'the last admin cannot be demoted');
select throws_ok($$ update public.club_memberships set status = 'inactive' where id = 'e0000000-0000-0000-0000-00000000000b' $$, 'P0001', 'last_admin', 'the last admin cannot be deactivated');
select throws_ok($$ delete from public.club_memberships where id = 'e0000000-0000-0000-0000-00000000000b' $$, 'P0001', 'last_admin', 'the last admin cannot leave or be removed');
select lives_ok($$ delete from public.club_memberships where id = 'e0000000-0000-0000-0000-00000000000a' $$, 'admin can remove another member');

reset role; select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.club_memberships $$, 'a stranger reads no memberships');
select is_empty($$ delete from public.club_memberships returning 1 $$, 'a stranger cannot remove members');
select * from finish();
rollback;
