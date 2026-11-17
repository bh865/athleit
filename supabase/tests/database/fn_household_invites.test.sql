-- public.create_household_invite / accept_invite / revoke_invite for households
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'g1@example.test'), ('a2222222-2222-2222-2222-222222222222', 'g2@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'teamadmin@example.test'), ('a4444444-4444-4444-4444-444444444444', 'clubadmin@example.test'),
  ('a5555555-5555-5555-5555-555555555555', 'stranger@example.test');
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
insert into public.club_memberships (club_id, profile_id, role) values ('c1000000-0000-0000-0000-000000000001', 'a4444444-4444-4444-4444-444444444444', 'admin');
insert into public.teams (id, name, sport, season_label, club_id, join_code) values
  ('a1000000-0000-0000-0000-00000000000a', 'Linked', 'soccer', 'Fall', 'c1000000-0000-0000-0000-000000000001', 'LINKED0001'),
  ('a2000000-0000-0000-0000-00000000000b', 'Solo', 'soccer', 'Fall', null, 'SOLO000002');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a3333333-3333-3333-3333-333333333333', 'admin'),
  ('a2000000-0000-0000-0000-00000000000b', 'a3333333-3333-3333-3333-333333333333', 'admin');
insert into public.households (id, name) values ('11000000-0000-0000-0000-000000000001', 'G fam');
insert into public.household_members (household_id, profile_id) values ('11000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.create_household_invite('11000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous users cannot create household invites');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select * from public.create_household_invite('11000000-0000-0000-0000-000000000001') $$, '42501', null, 'a non-guardian cannot invite into a household');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
create temp table t as select 'ok'::text k, token, invite_id from public.create_household_invite('11000000-0000-0000-0000-000000000001')
  union all select 'revoked', token, invite_id from public.create_household_invite('11000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.revoke_invite((select invite_id from t where k = 'revoked')) $$, 'a guardian can revoke a household invite');
select is((select count(*)::int from public.invites), 2, 'a guardian reads their household invites');
select throws_ok($$ select * from public.create_household_invite('11000000-0000-0000-0000-000000000001', interval '200 days') $$, 'P0001', 'invalid_expiry', 'expiry is capped');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.invites $$, 'a stranger cannot read household invites');
select throws_ok($$ select * from public.accept_invite((select token from t where k = 'revoked')) $$, 'P0001', 'invite_revoked', 'a revoked household invite fails');
select is_empty($$ select 1 from public.players $$, 'a stranger sees no children');
select lives_ok($$ select * from public.accept_invite((select token from t where k = 'ok')) $$, 'a second guardian can accept');
select is((select count(*)::int from public.household_members where household_id = '11000000-0000-0000-0000-000000000001'), 2, 'both guardians are now members');
select throws_ok($$ select * from public.accept_invite((select token from t where k = 'ok')) $$, 'P0001', 'invite_exhausted', 'the single-use invite is spent');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.invites $$, 'an unrelated user has no invite access');
reset role;
select is((select household_id::text from public.invites where id = (select invite_id from t where k = 'ok')), '11000000-0000-0000-0000-000000000001', 'invite targets the household');
select throws_ok($$ insert into public.invites (household_id, team_id, role, token_hash, expires_at) values ('11000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'guardian', 'x', now() + interval '1 day') $$, '23514', null, 'an invite cannot have two targets');
select throws_ok($$ insert into public.invites (household_id, role, token_hash, expires_at) values ('11000000-0000-0000-0000-000000000001', 'coach', 'y', now() + interval '1 day') $$, '23514', null, 'household invites only carry the guardian role');
select * from finish();
rollback;
