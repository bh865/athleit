-- public.create_invite
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
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'coach') $$, '42501', null, 'anonymous users cannot create invites');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'coach') $$, 'a team admin can invite a coach');
select is((select length(token) from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'manager')), 64, 'the one-time token is returned (64 chars)');
select is((select count(*)::int from public.invites where token_hash ~ '^[0-9a-f]{64}$'), 2, 'only a SHA-256 hash is stored');
select lives_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'parent', interval '30 days', 50) $$, 'an admin can create a multi-use parent invite');
select throws_ok($$ select * from public.create_invite('a2000000-0000-0000-0000-00000000000b', null, 'coach') $$, '42501', null, 'cannot invite to another team');
select throws_ok($$ select * from public.create_invite(null, null, 'coach') $$, 'P0001', 'invalid_target', 'a target is required');
select throws_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000001', 'coach') $$, 'P0001', 'invalid_target', 'exactly one target is allowed');
select throws_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'coach', interval '200 days') $$, 'P0001', 'invalid_expiry', 'expiry is capped at 90 days');
select throws_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'owner') $$, '23514', null, 'an unknown role is rejected');
select throws_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'coach', interval '1 day', 0) $$, '23514', null, 'max_uses must be positive');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'coach') $$, '42501', null, 'a coach cannot mint staff invites (staff are added by admins)');
select throws_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'admin') $$, '42501', null, 'a coach cannot mint admin invites');
select lives_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'parent') $$, 'staff can invite parents');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'parent') $$, '42501', null, 'a non-member cannot create invites');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select * from public.create_invite(null, 'c1000000-0000-0000-0000-000000000001', 'manager') $$, 'a club admin can invite a club manager');
select throws_ok($$ select * from public.create_invite(null, 'c1000000-0000-0000-0000-000000000001', 'coach') $$, '23514', null, 'club invites only allow club roles');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select * from public.create_invite(null, 'c1000000-0000-0000-0000-000000000001', 'manager') $$, '42501', null, 'a non-admin cannot invite to a club');
reset role;
select is((select count(*)::int from public.audit_log where created_at = now() and action = 'invite.create'), 5, 'invite creation is audited');
select is((select count(*)::int from public.audit_log where created_at = now() and after::text ~ '[0-9a-f]{64}'), 0, 'tokens never appear in the audit log');
select * from finish();
rollback;
