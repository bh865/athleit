-- RLS tests for public.household_members
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
select throws_ok($$ select * from public.household_members $$, '42501', null, 'anonymous users cannot read household members');
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.household_members), 1, 'a guardian reads only their own household''s members');
select is_empty($$ select 1 from public.household_members where household_id = '22000000-0000-0000-0000-000000000002' $$, 'cannot read another family''s members');
select throws_ok($$ insert into public.household_members (household_id, profile_id) values ('11000000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd') $$, '42501', null, 'cannot add yourself or others to a household directly');
select throws_ok($$ insert into public.household_members (household_id, profile_id) values ('22000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$, '42501', null, 'cannot join another family''s household');
select throws_ok($$ delete from public.household_members $$, '42501', null, 'members cannot be deleted by clients');
select throws_ok($$ update public.household_members set household_id = '22000000-0000-0000-0000-000000000002' $$, '42501', null, 'members cannot be moved');
reset role; select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.household_members $$, 'a non-member reads nothing');
select * from finish();
rollback;
