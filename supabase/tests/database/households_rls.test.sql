-- RLS tests for public.households
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
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.households $$, '42501', null, 'anonymous users cannot read households');
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.households), 1, 'a guardian reads only their own household');
select lives_ok($$ update public.households set name = 'The Adamses' where id = '11000000-0000-0000-0000-000000000001' $$, 'a guardian can rename their household');
select is_empty($$ update public.households set name = 'Hacked' where id = '22000000-0000-0000-0000-000000000002' returning 1 $$, 'a guardian cannot edit another family''s household');
select throws_ok($$ insert into public.households (name) values ('x') $$, '42501', null, 'households cannot be inserted directly');
select throws_ok($$ delete from public.households $$, '42501', null, 'households cannot be deleted by clients');
reset role; select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.households $$, 'a non-member sees no households');
select is_empty($$ update public.households set name = 'Hacked' returning 1 $$, 'a non-member cannot edit households');
reset role;
select is((select name from public.households where id = '22000000-0000-0000-0000-000000000002'), 'B family', 'the other household was not changed');
select * from finish();
rollback;
