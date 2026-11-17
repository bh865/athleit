-- public.accept_invite and public.revoke_invite
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'admin@example.test'),
  ('a2222222-2222-2222-2222-222222222222', 'coach@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'newcoach@example.test'),
  ('a4444444-4444-4444-4444-444444444444', 'newparent@example.test'),
  ('a5555555-5555-5555-5555-555555555555', 'clubadmin@example.test'),
  ('a6666666-6666-6666-6666-666666666666', 'stranger@example.test');
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
insert into public.club_memberships (club_id, profile_id, role) values ('c1000000-0000-0000-0000-000000000001', 'a5555555-5555-5555-5555-555555555555', 'admin');
insert into public.teams (id, name, sport, season_label) values
  ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall'), ('a2000000-0000-0000-0000-00000000000b', 'Team B', 'soccer', 'Fall');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'admin'),
  ('a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', 'coach');
-- Invites are minted by the real function so tokens are real; their rows are tuned afterwards.
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
create temp table t as
  select 'coach'::text k, token, invite_id from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'coach')
  union all select 'multi', token, invite_id from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'parent', interval '7 days', 2)
  union all select 'expired', token, invite_id from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'coach')
  union all select 'revoked', token, invite_id from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'coach')
  union all select 'player', token, invite_id from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'player');
select public.revoke_invite((select invite_id from t where k = 'revoked'));
reset role;
update public.invites set expires_at = now() - interval '1 minute' where id = (select invite_id from t where k = 'expired');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.accept_invite('whatever') $$, '42501', null, 'anonymous users cannot accept invites');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select * from public.accept_invite('not-a-real-token') $$, 'P0001', 'invite_invalid', 'an unknown token fails');
select throws_ok($$ select * from public.accept_invite(null) $$, 'P0001', 'invite_invalid', 'a null token fails');
select throws_ok($$ select * from public.accept_invite((select token from t where k = 'expired')) $$, 'P0001', 'invite_expired', 'an expired invite fails');
select throws_ok($$ select * from public.accept_invite((select token from t where k = 'revoked')) $$, 'P0001', 'invite_revoked', 'a revoked invite fails');
select throws_ok($$ select * from public.accept_invite((select token from t where k = 'player')) $$, '23514', 'player_role_requires_linked_player', 'a player invite needs a linked 13+ player');
select is((select count(*)::int from public.team_memberships where profile_id = 'a3333333-3333-3333-3333-333333333333'), 0, 'failed invites grant nothing');
select lives_ok($$ select * from public.accept_invite((select token from t where k = 'coach')) $$, 'a valid invite is accepted');
select is((select role::text from public.team_memberships where profile_id = 'a3333333-3333-3333-3333-333333333333'), 'coach', 'the membership has the invited role');
select throws_ok($$ select * from public.accept_invite((select token from t where k = 'coach')) $$, 'P0001', 'invite_exhausted', 'a single-use invite cannot be reused');
select lives_ok($$ select * from public.accept_invite((select token from t where k = 'multi')) $$, 'a multi-use invite works the first time');
select throws_ok($$ select * from public.accept_invite((select token from t where k = 'multi')) $$, 'P0001', 'already_member', 'accepting the same role twice reports already_member');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select * from public.accept_invite((select token from t where k = 'multi')) $$, 'a second person can use the multi-use invite');
select throws_ok($$ select * from public.accept_invite((select token from t where k = 'multi')) $$, 'P0001', 'invite_exhausted', 'a multi-use invite is exhausted after max_uses');
reset role;
select is((select use_count from public.invites where id = (select invite_id from t where k = 'multi')), 2, 'use_count tracks acceptances (failed attempts do not count)');
select is((select use_count from public.invites where id = (select invite_id from t where k = 'expired')), 0, 'an expired invite is never consumed');
select is((select count(*)::int from public.audit_log where created_at = now() and action = 'invite.accept'), 3, 'acceptances are audited');
select is((select count(*)::int from public.audit_log where created_at = now() and action = 'team_memberships.insert' and after ->> 'role' = 'coach'), 2, 'the membership grant is audited');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
create temp table tc as select token, invite_id from public.create_invite(null, 'c1000000-0000-0000-0000-000000000001', 'manager');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select * from public.accept_invite((select token from tc)) $$, 'a club invite creates a club membership');
select is((select role::text from public.club_memberships where profile_id = 'a3333333-3333-3333-3333-333333333333'), 'manager', 'the club membership has the invited role');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.revoke_invite((select invite_id from t where k = 'coach')) $$, '42501', null, 'a coach who did not create the invite cannot revoke it');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.revoke_invite((select invite_id from t where k = 'multi')) $$, 'a team admin can revoke an invite');
select lives_ok($$ select public.revoke_invite((select invite_id from t where k = 'multi')) $$, 'revoking twice is harmless');
reset role;
select ok((select revoked_at is not null from public.invites where id = (select invite_id from t where k = 'multi')), 'revoked_at is set');
select is((select count(*)::int from public.audit_log where created_at = now() and action = 'invite.revoke'), 3, 'revocations are audited');
select * from finish();
rollback;
