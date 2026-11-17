-- RLS tests for public.players (+ the under-13 rule)
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent.a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent.b@example.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'teen@example.test'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'stranger@example.test');
-- Household H1 (guardian A) has Ava (10) and Teen (15); household H2 (guardian B) has Ben (9).
insert into public.households (id, name) values
  ('11000000-0000-0000-0000-000000000001', 'A family'), ('22000000-0000-0000-0000-000000000002', 'B family');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '10 years'),
  ('92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'Ben', 'Brown', current_date - interval '9 years');
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('93000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 'Teen', 'Adams', current_date - interval '15 years');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.players $$, '42501', null, 'anonymous users cannot read players');
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.players), 2, 'a guardian reads all their own children');
select is_empty($$ select 1 from public.players where id = '92000000-0000-0000-0000-000000000002' $$, 'a parent cannot read another family''s child');
select lives_ok($$ update public.players set photo_path = 'players/ava.jpg', last_name = 'Adams-Lee' where id = '91000000-0000-0000-0000-000000000001' $$, 'a guardian can edit their child');
select is_empty($$ update public.players set first_name = 'Hacked' where id = '92000000-0000-0000-0000-000000000002' returning 1 $$, 'a guardian cannot edit another family''s child');
select throws_ok($$ update public.players set profile_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' where id = '93000000-0000-0000-0000-000000000003' $$, '42501', null, 'a guardian cannot link a login directly');
select throws_ok($$ update public.players set household_id = '22000000-0000-0000-0000-000000000002' where id = '91000000-0000-0000-0000-000000000001' $$, '42501', null, 'a child cannot be moved between households');
select throws_ok($$ insert into public.players (household_id, first_name, last_name, date_of_birth) values ('11000000-0000-0000-0000-000000000001', 'X', 'Y', '2015-01-01') $$, '42501', null, 'players cannot be inserted directly (use add_child)');
select throws_ok($$ delete from public.players $$, '42501', null, 'players cannot be deleted by clients');
reset role; select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.players $$, 'a stranger reads no players');
reset role; select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.players), 1, 'the other family sees only their own child');
-- Under-13 rule (as superuser, because clients cannot write profile_id at all).
reset role;
select throws_ok($$ update public.players set profile_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' where id = '91000000-0000-0000-0000-000000000001' $$, '23514', 'player_under_13', 'an under-13 player cannot be linked to a profile');
select lives_ok($$ update public.players set profile_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' where id = '93000000-0000-0000-0000-000000000003' $$, 'a 15-year-old can be linked to a profile');
select throws_ok($$ update public.players set date_of_birth = current_date - interval '12 years' where id = '93000000-0000-0000-0000-000000000003' $$, '23514', 'player_under_13', 'a linked player''s birth date cannot be changed to under 13');
select lives_ok($$ update public.players set profile_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', date_of_birth = current_date - interval '13 years' where id = '92000000-0000-0000-0000-000000000002' $$, 'a player turning exactly 13 today may be linked');
select throws_ok($$ update public.players set date_of_birth = current_date + 1 where id = '91000000-0000-0000-0000-000000000001' $$, '23514', 'invalid_date_of_birth', 'a future birth date is rejected');
reset role; select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.players), 1, 'a linked 13+ player reads their own row only');
select is_empty($$ update public.players set first_name = 'Self' returning 1 $$, 'a linked player cannot edit their own player row');
select * from finish();
rollback;
