begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'admin@example.test'), ('a2222222-2222-2222-2222-222222222222', 'manager@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'coach@example.test'), ('a4444444-4444-4444-4444-444444444444', 'parent@example.test'),
  ('a5555555-5555-5555-5555-555555555555', 'outsider@example.test');
insert into public.teams (id, name, sport, season_label, join_code) values
  ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall', 'TEAMA00001');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'admin'),
  ('a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', 'manager'),
  ('a1000000-0000-0000-0000-00000000000a', 'a3333333-3333-3333-3333-333333333333', 'coach'),
  ('a1000000-0000-0000-0000-00000000000a', 'a4444444-4444-4444-4444-444444444444', 'parent');
insert into public.households (id, name) values ('11000000-0000-0000-0000-000000000001', 'P fam');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a4444444-4444-4444-4444-444444444444');
insert into public.players (id, household_id, first_name, last_name, date_of_birth)
  values ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '10 years');
insert into public.team_players (team_id, player_id, jersey_number) values
  ('a1000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001', 7);
insert into public.waivers (id, team_id, title, draft_body) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'Liability', 'I agree.');
insert into public.waiver_versions (id, waiver_id, version, title, body, content_hash) values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 1, 'Liability', 'I agree.',
   encode(extensions.digest(convert_to('I agree.', 'UTF8'), 'sha256'), 'hex'));
insert into public.team_required_waivers (team_id, waiver_id) values
  ('a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000001');

-- Permissions: only managers and admins may remind.
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.remind_waiver_signers('a1000000-0000-0000-0000-00000000000a') $$, '42501', 'forbidden', 'a coach cannot send reminders');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.remind_waiver_signers('a1000000-0000-0000-0000-00000000000a') $$, '42501', 'forbidden', 'a parent cannot send reminders');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.remind_waiver_signers('a1000000-0000-0000-0000-00000000000a') $$, '42501', 'forbidden', 'an outsider cannot send reminders');

-- A manager reminds the guardian of the player whose waiver is missing.
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is(public.remind_waiver_signers('a1000000-0000-0000-0000-00000000000a'), 1, 'one player was reminded');
select is((select count(*)::int from public.waiver_reminders), 1, 'the reminder is recorded');
-- Rate limit: a second call inside 24 hours sends nothing.
select is(public.remind_waiver_signers('a1000000-0000-0000-0000-00000000000a'), 0, 'no second reminder inside 24 hours');
select is(public.remind_waiver_signers('a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001'), 0, 'a single-player reminder is rate limited too');
reset role;
select is((select count(*)::int from public.notification_outbox where profile_id = 'a4444444-4444-4444-4444-444444444444' and payload ->> 'title' = 'Waiver needs your signature' and channel = 'in_app'), 1, 'the guardian gets exactly one in-app notice');
select is((select payload ->> 'body' from public.notification_outbox where profile_id = 'a4444444-4444-4444-4444-444444444444' and payload ->> 'title' = 'Waiver needs your signature' and channel = 'in_app'), 'Liability is waiting for you', 'the notice names the waiver, not the child');

-- After 24 hours it can go again.
update public.waiver_reminders set sent_at = now() - interval '25 hours';
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is(public.remind_waiver_signers('a1000000-0000-0000-0000-00000000000a'), 1, 'an admin can remind again after the cool-down');

-- Signed players are skipped.
reset role;
insert into public.waiver_acceptances (player_id, waiver_version_id, signer_name, signer_relationship, signer_email, electronic_consent)
  values ('91000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'Pat', 'Mother', 'p@e.co', true);
update public.waiver_reminders set sent_at = now() - interval '48 hours';
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is(public.remind_waiver_signers('a1000000-0000-0000-0000-00000000000a'), 0, 'players who signed are not reminded');

-- Staff read the reminder times; a parent reads none; nobody can write directly.
select is((select count(*)::int from public.waiver_reminders) > 0, true, 'staff read reminders');
select throws_ok($$ insert into public.waiver_reminders (waiver_id, player_id, team_id) values ('b1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a') $$, '42501', null, 'direct inserts are refused');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.waiver_reminders), 0, 'a parent reads no reminders');
reset role;
select is((select count(*)::int from public.audit_log where action = 'waiver.remind'), 5, 'each call is audited');

select * from finish();
rollback;
