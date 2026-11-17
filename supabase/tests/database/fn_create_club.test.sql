-- public.create_club
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'c@example.test');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.create_club('X', 'xxx') $$, '42501', null, 'anonymous users cannot call create_club');

reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.create_club('  Riverside FC ', 'Riverside-FC') $$, 'a signed-in user can create a club');
select is((select name || '/' || slug from public.clubs), 'Riverside FC/riverside-fc', 'name is trimmed and slug normalised');
select is((select role::text from public.club_memberships where profile_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'admin', 'creator becomes admin in the same transaction');
select throws_ok($$ select public.create_club('Dup', 'riverside-fc') $$, '23505', null, 'duplicate slug is rejected');
select throws_ok($$ select public.create_club('Bad', 'Not A Slug!') $$, '23514', null, 'invalid slug is rejected');
select throws_ok($$ select public.create_club('   ', 'valid-slug') $$, '23514', null, 'blank name is rejected');

reset role;
select is((select count(*)::int from public.audit_log where created_at = now() and action = 'club.create'), 1, 'creation is audited');
select is((select actor_id::text from public.audit_log where created_at = now() and action = 'club.create'), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'audit records the actor');
select * from finish();
rollback;
