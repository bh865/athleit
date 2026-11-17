-- RLS tests for public.profiles
-- Proves: users see/update only their own row, cannot touch anyone else's,
-- cannot insert/delete, and anonymous callers cannot read anything.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Fixtures (run as the superuser; the signup trigger creates the profiles) ----
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test', '{"display_name":"User A"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test', '{"display_name":"User B"}');

-- Anonymous --------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select * from public.profiles $$,
  '42501',
  null,
  'anonymous users cannot read profiles'
);

-- User A -----------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select results_eq(
  $$ select id::text, display_name from public.profiles $$,
  $$ values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'User A') $$,
  'user A sees exactly one profile: their own'
);

select is_empty(
  $$ select 1 from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  'user A cannot read user B''s profile by id'
);

select lives_ok(
  $$ update public.profiles set display_name = 'A renamed'
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'user A can update their own profile'
);

select is(
  (select display_name from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'A renamed',
  'user A''s update took effect'
);

-- RLS hides B's row from the UPDATE, so it silently matches zero rows.
select is_empty(
  $$ update public.profiles set display_name = 'Hacked'
     where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$,
  'user A cannot update user B''s profile (zero rows affected)'
);

select throws_ok(
  $$ update public.profiles set id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501',
  null,
  'user A cannot re-assign their profile id'
);

select throws_ok(
  $$ insert into public.profiles (id, display_name)
     values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Fake') $$,
  '42501',
  null,
  'authenticated users cannot insert profiles directly'
);

select throws_ok(
  $$ delete from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501',
  null,
  'authenticated users cannot delete profiles'
);

-- Back to superuser to verify B's data was never touched -------------------------
reset role;

select is(
  (select display_name from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'User B',
  'user B''s profile is unchanged'
);

-- User B sees only their own row too (symmetry check) ------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);

select results_eq(
  $$ select id::text from public.profiles $$,
  $$ values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  'user B sees exactly one profile: their own'
);

select is(
  (select display_name from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'User B',
  'user B reads their own display name'
);

select * from finish();
rollback;
