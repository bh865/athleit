-- public.preview_invite
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'coach@example.test'), ('a2222222-2222-2222-2222-222222222222', 'parent@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'teamadmin@example.test'), ('a4444444-4444-4444-4444-444444444444', 'clubadmin@example.test'),
  ('a5555555-5555-5555-5555-555555555555', 'stranger@example.test'), ('a6666666-6666-6666-6666-666666666666', 'teen@example.test');
update public.profiles set display_name = 'Pat Parent' where id = 'a2222222-2222-2222-2222-222222222222';
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
insert into public.club_memberships (club_id, profile_id, role) values ('c1000000-0000-0000-0000-000000000001', 'a4444444-4444-4444-4444-444444444444', 'admin');
insert into public.teams (id, name, sport, season_label) values ('a1000000-0000-0000-0000-00000000000a', 'Hawks', 'soccer', 'Fall'), ('a2000000-0000-0000-0000-00000000000b', 'Owls', 'hockey', 'Winter');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'coach'), ('a1000000-0000-0000-0000-00000000000a', 'a3333333-3333-3333-3333-333333333333', 'admin'),
  ('a2000000-0000-0000-0000-00000000000b', 'a5555555-5555-5555-5555-555555555555', 'admin');
insert into public.households (id, name) values ('11000000-0000-0000-0000-000000000001', 'Pat fam');
insert into public.household_members (household_id, profile_id) values ('11000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222');
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '15 years');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
create temp table t as select 'ok'::text k, token from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'coach')
  union all select 'revoked', token from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'coach');
select public.revoke_invite((select invite_id from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'coach'))) ;
reset role;
update public.invites set revoked_at = now() where token_hash = encode(sha256(convert_to((select token from t where k = 'revoked'), 'utf8')), 'hex');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.preview_invite('x') $$, '42501', null, 'anonymous users cannot preview');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is((select target_name || '/' || role || '/' || valid::text from public.preview_invite((select token from t where k = 'ok'))), 'Hawks/coach/true', 'previews the target, role and validity');
select is((select reason from public.preview_invite((select token from t where k = 'revoked'))), 'invite_revoked', 'reports a revoked invite');
select is((select reason from public.preview_invite('nope')), 'invite_invalid', 'reports an unknown token');
reset role;
select is((select use_count from public.invites where token_hash = encode(sha256(convert_to((select token from t where k = 'ok'), 'utf8')), 'hex')), 0, 'previewing never consumes the invite');
select * from finish();
rollback;
