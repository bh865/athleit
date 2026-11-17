-- public.decide_player_login_claim
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
  ('b1000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000003', 'a3333333-3333-3333-3333-333333333333'),
  ('b2000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222'),
  ('b3000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000002', 'a4444444-4444-4444-4444-444444444444');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.decide_player_login_claim('b1000000-0000-0000-0000-000000000001', true) $$, '42501', null, 'anonymous users cannot decide');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.decide_player_login_claim('b1000000-0000-0000-0000-000000000001', true) $$, '42501', null, 'a claimant cannot approve their own claim');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.decide_player_login_claim('b1000000-0000-0000-0000-000000000001', true) $$, '42501', null, 'another family''s guardian cannot decide');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.decide_player_login_claim('b1000000-0000-0000-0000-000000000001', true) $$, 'a guardian can approve a claim');
select is((select profile_id::text from public.players where id = '93000000-0000-0000-0000-000000000003'), 'a3333333-3333-3333-3333-333333333333', 'approval links the profile');
select lives_ok($$ select public.decide_player_login_claim('b2000000-0000-0000-0000-000000000002', false) $$, 'a guardian can decline a claim');
select is((select profile_id from public.players where id = '91000000-0000-0000-0000-000000000001'), null, 'a declined claim links nothing');
select throws_ok($$ select public.decide_player_login_claim('b2000000-0000-0000-0000-000000000002', true) $$, 'P0001', 'request_not_pending', 'cannot decide twice');
select throws_ok($$ select public.decide_player_login_claim('b3000000-0000-0000-0000-000000000003', true) $$, '23514', 'player_under_13', 'an under-13 player cannot be linked even by approval');
reset role;
select is((select count(*)::int from public.audit_log where created_at = now() and action in ('player.claim_login_approve', 'player.claim_login_decline')), 2, 'decisions are audited');
select * from finish();
rollback;
