-- RLS tests for public.invites
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
-- hash of 'known-token' stored directly (superuser) so tests can read rows without the raw token
insert into public.invites (id, team_id, role, token_hash, expires_at, created_by) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'coach', 'hash-1', now() + interval '1 day', 'a2222222-2222-2222-2222-222222222222'),
  ('b2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-00000000000b', 'coach', 'hash-2', now() + interval '1 day', 'a6666666-6666-6666-6666-666666666666');
insert into public.invites (id, club_id, role, token_hash, expires_at, created_by) values
  ('b3000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'manager', 'hash-3', now() + interval '1 day', 'a5555555-5555-5555-5555-555555555555');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.invites $$, '42501', null, 'anonymous users cannot read invites');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.invites), 1, 'a creator reads the invites they created');
select is_empty($$ select 1 from public.invites where id = 'b2000000-0000-0000-0000-000000000002' $$, 'cannot read another team''s invite');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.invites), 1, 'a team admin reads their team''s invites (even ones they did not create)');
select throws_ok($$ insert into public.invites (team_id, role, token_hash, expires_at) values ('a1000000-0000-0000-0000-00000000000a', 'admin', 'h', now() + interval '1 day') $$, '42501', null, 'invites cannot be inserted directly');
select throws_ok($$ update public.invites set revoked_at = null $$, '42501', null, 'invites cannot be updated directly (no un-revoking)');
select throws_ok($$ delete from public.invites $$, '42501', null, 'invites cannot be deleted by clients');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.invites), 1, 'a club admin reads their club''s invites');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.invites), 1, 'a stranger reads only the invite they created (team B)');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.invites $$, 'an unrelated user reads no invites');
select * from finish();
rollback;
