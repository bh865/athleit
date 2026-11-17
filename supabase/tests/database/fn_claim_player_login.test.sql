-- public.claim_player_login
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
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.claim_player_login('91000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous users cannot claim a login');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.claim_player_login('92000000-0000-0000-0000-000000000002') $$, '23514', 'player_under_13', 'an under-13 player cannot be linked, even with a matching email');
select is_empty($$ select 1 from public.player_login_claims $$, 'no claim is recorded for an under-13 player');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is(public.claim_player_login('91000000-0000-0000-0000-000000000001'), 'pending', 'a non-matching email creates a review request instead of linking');
select is((select count(*)::int from public.players where profile_id = 'a3333333-3333-3333-3333-333333333333'), 0, 'a pending claim links nothing');
select throws_ok($$ select public.claim_player_login('91000000-0000-0000-0000-000000000001') $$, '23505', null, 'a duplicate pending claim is rejected');
select throws_ok($$ select public.claim_player_login('99999999-9999-9999-9999-999999999999') $$, 'P0001', 'player_not_found', 'an unknown player fails');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select is(public.claim_player_login('94000000-0000-0000-0000-000000000004'), 'pending', 'an UNCONFIRMED email never auto-approves, even when it matches');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is(public.claim_player_login('91000000-0000-0000-0000-000000000001'), 'approved', 'a matching confirmed email (case-insensitive) auto-approves');
select is((select profile_id::text from public.players where id = '91000000-0000-0000-0000-000000000001'), 'a2222222-2222-2222-2222-222222222222', 'the player is linked to the claimant''s profile');
select is((select count(*)::int from public.player_login_claims where status = 'approved'), 1, 'the approved claim is recorded');
select throws_ok($$ select public.claim_player_login('91000000-0000-0000-0000-000000000001') $$, 'P0001', 'player_already_linked', 'an already-linked player cannot be claimed again');
reset role;
select is((select login_invite_email from public.players where id = '91000000-0000-0000-0000-000000000001'), null, 'the invite email is cleared once used');
select is((select count(*)::int from public.audit_log where action like 'player.claim_login%'), 3, 'claims are audited');
select * from finish();
rollback;
