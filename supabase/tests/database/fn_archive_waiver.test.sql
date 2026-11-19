begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'admin@example.test'), ('a2222222-2222-2222-2222-222222222222', 'manager@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'coach@example.test'), ('a5555555-5555-5555-5555-555555555555', 'outsider@example.test');
insert into public.teams (id, name, sport, season_label, join_code) values
  ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall', 'TEAMA00001');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'admin'),
  ('a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', 'manager'),
  ('a1000000-0000-0000-0000-00000000000a', 'a3333333-3333-3333-3333-333333333333', 'coach');
insert into public.waivers (id, team_id, title, draft_body) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'Liability', 'I agree.');
insert into public.waiver_versions (id, waiver_id, version, title, body, content_hash) values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 1, 'Liability', 'I agree.',
   encode(extensions.digest(convert_to('I agree.', 'UTF8'), 'sha256'), 'hex'));

reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.archive_waiver('b1000000-0000-0000-0000-000000000001') $$, '42501', 'forbidden', 'a coach cannot archive a waiver');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.archive_waiver('b1000000-0000-0000-0000-000000000001') $$, '42501', 'forbidden', 'an outsider cannot archive a waiver');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.archive_waiver('b1000000-0000-0000-0000-000000000001') $$, 'a manager archives a waiver');
reset role;
select is((select archived_at is not null from public.waivers where id = 'b1000000-0000-0000-0000-000000000001'), true, 'it is archived');
select is((select count(*)::int from public.waiver_versions where waiver_id = 'b1000000-0000-0000-0000-000000000001'), 1, 'published versions are untouched');
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.publish_waiver_version('b1000000-0000-0000-0000-000000000001') $$, '23514', 'waiver_archived', 'an archived waiver cannot be published');
select lives_ok($$ select public.archive_waiver('b1000000-0000-0000-0000-000000000001', false) $$, 'an admin restores it');
reset role;
select is((select archived_at is null from public.waivers where id = 'b1000000-0000-0000-0000-000000000001'), true, 'it is restored');
select is((select count(*)::int from public.audit_log where action in ('waiver.archive', 'waiver.unarchive')), 2, 'both changes are audited');

select * from finish();
rollback;
