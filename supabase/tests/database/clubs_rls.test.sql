-- RLS tests for public.clubs
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'c@example.test');
-- A administers club 1 with B as manager; C is a stranger.
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
insert into public.club_memberships (club_id, profile_id, role) values
  ('c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
  ('c1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'manager');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.clubs $$, '42501', null, 'anonymous users cannot read clubs');

reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.clubs), 1, 'club admin reads their club');
select lives_ok($$ update public.clubs set name = 'Riverside FC' where id = 'c1000000-0000-0000-0000-000000000001' $$, 'club admin can rename');
select is((select name from public.clubs), 'Riverside FC', 'rename took effect');
select throws_ok($$ update public.clubs set slug = 'other' where id = 'c1000000-0000-0000-0000-000000000001' $$, '42501', null, 'slug is not editable by clients');
select throws_ok($$ insert into public.clubs (name, slug) values ('X', 'xxx') $$, '42501', null, 'clubs cannot be inserted directly (use create_club)');
select throws_ok($$ delete from public.clubs $$, '42501', null, 'clubs cannot be deleted by clients');

reset role; select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.clubs), 1, 'club manager reads their club');
select is_empty($$ update public.clubs set name = 'Hacked' where id = 'c1000000-0000-0000-0000-000000000001' returning 1 $$, 'club manager cannot rename (zero rows)');

reset role; select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.clubs $$, 'a stranger cannot read any club');
select is_empty($$ update public.clubs set name = 'Hacked' returning 1 $$, 'a stranger cannot rename a club');

reset role;
select is((select name from public.clubs), 'Riverside FC', 'club name only changed by the admin');
select * from finish();
rollback;
