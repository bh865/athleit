-- public.delete_invite
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'admin@example.test'),
  ('a2222222-2222-2222-2222-222222222222', 'coach@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'guardian@example.test'),
  ('a4444444-4444-4444-4444-444444444444', 'stranger@example.test');
insert into public.teams (id, name, sport, season_label) values ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'admin'),
  ('a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', 'coach');
insert into public.households (id, name) values ('11000000-0000-0000-0000-000000000001', 'G fam');
insert into public.household_members (household_id, profile_id) values ('11000000-0000-0000-0000-000000000001', 'a3333333-3333-3333-3333-333333333333');
insert into public.invites (id, team_id, role, token_hash, expires_at, created_by, revoked_at) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'parent', repeat('a', 64), now() + interval '1 day', 'a1111111-1111-1111-1111-111111111111', now()),
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 'parent', repeat('b', 64), now() + interval '1 day', 'a1111111-1111-1111-1111-111111111111', null);
insert into public.invites (id, household_id, role, token_hash, expires_at, created_by, revoked_at) values
  ('b3000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 'guardian', repeat('c', 64), now() + interval '1 day', 'a3333333-3333-3333-3333-333333333333', now());

set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.delete_invite('b1000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous users cannot delete');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.delete_invite('b1000000-0000-0000-0000-000000000001') $$, '42501', null, 'a stranger cannot delete');
select throws_ok($$ select public.delete_invite('b3000000-0000-0000-0000-000000000003') $$, '42501', null, 'a stranger cannot delete a household invite');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.delete_invite('b1000000-0000-0000-0000-000000000001') $$, '42501', null, 'a coach who did not create it cannot delete');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.delete_invite('b1000000-0000-0000-0000-000000000001') $$, 'a team admin can delete a revoked invite');
select lives_ok($$ select public.delete_invite('b2000000-0000-0000-0000-000000000002') $$, 'and an active one');
select is((select count(*)::int from public.invites where team_id = 'a1000000-0000-0000-0000-00000000000a'), 0, 'both are gone');
select throws_ok($$ select public.delete_invite('b1000000-0000-0000-0000-000000000001') $$, '42501', null, 'deleting a missing invite is refused');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.delete_invite('b3000000-0000-0000-0000-000000000003') $$, 'a guardian can delete a revoked household invite');
reset role;
select is((select count(*)::int from public.audit_log where created_at = now() and action = 'invite.delete'), 3, 'deletions are audited');
select * from finish();
rollback;
