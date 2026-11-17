-- RLS tests for public.player_login_claims
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email, email_confirmed_at) values
  ('a1111111-1111-1111-1111-111111111111', 'guardian@example.test', now()),
  ('a2222222-2222-2222-2222-222222222222', 'teen@example.test', now()),
  ('a3333333-3333-3333-3333-333333333333', 'other@example.test', now()),
  ('a4444444-4444-4444-4444-444444444444', 'kid@example.test', now()),
  ('a5555555-5555-5555-5555-555555555555', 'guardian2@example.test', now());
insert into auth.users (id, email) values ('a6666666-6666-6666-6666-666666666666', 'unconfirmed.teen@example.test');
insert into public.households (id, name) values ('11000000-0000-0000-0000-000000000001', 'G fam'), ('22000000-0000-0000-0000-000000000002', 'G2 fam');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111'),
  ('22000000-0000-0000-0000-000000000002', 'a5555555-5555-5555-5555-555555555555');
insert into public.players (id, household_id, first_name, last_name, date_of_birth, login_invite_email) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Teen', 'Tee', current_date - interval '15 years', 'Teen@Example.test'),
  ('92000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 'Kid', 'Tee', current_date - interval '11 years', 'kid@example.test'),
  ('93000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 'Review', 'Tee', current_date - interval '14 years', null),
  ('94000000-0000-0000-0000-000000000004', '22000000-0000-0000-0000-000000000002', 'Mail', 'Gee', current_date - interval '16 years', 'unconfirmed.teen@example.test');
insert into public.player_login_claims (id, player_id, profile_id) values
  ('b1000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000003', 'a3333333-3333-3333-3333-333333333333');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.player_login_claims $$, '42501', null, 'anonymous users cannot read claims');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.player_login_claims), 1, 'a claimant reads their own claim');
select throws_ok($$ insert into public.player_login_claims (player_id, profile_id) values ('93000000-0000-0000-0000-000000000003', 'a3333333-3333-3333-3333-333333333333') $$, '42501', null, 'claims cannot be inserted directly');
select throws_ok($$ update public.player_login_claims set status = 'approved' $$, '42501', null, 'a claimant cannot approve their own claim');
select throws_ok($$ delete from public.player_login_claims $$, '42501', null, 'claims cannot be deleted by clients');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.player_login_claims), 1, 'a guardian reads claims on their child');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.player_login_claims $$, 'another family''s guardian reads nothing');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.player_login_claims $$, 'an unrelated user reads nothing');
select * from finish();
rollback;
