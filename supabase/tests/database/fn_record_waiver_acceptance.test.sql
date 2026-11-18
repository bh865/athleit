begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'admin@example.test'), ('a2222222-2222-2222-2222-222222222222', 'manager@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'coach@example.test'), ('a4444444-4444-4444-4444-444444444444', 'parent@example.test'),
  ('a5555555-5555-5555-5555-555555555555', 'outsider@example.test'), ('a6666666-6666-6666-6666-666666666666', 'cadmin@example.test'),
  ('a7777777-7777-7777-7777-777777777777', 'admin2@example.test'), ('a8888888-8888-8888-8888-888888888888', 'parent2@example.test');
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-00000000000c', 'Club', 'test-club-p5');
insert into public.club_memberships (club_id, profile_id, role) values ('c1000000-0000-0000-0000-00000000000c', 'a6666666-6666-6666-6666-666666666666', 'admin');
insert into public.teams (id, name, sport, season_label, join_code, club_id) values
  ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall', 'TEAMA00001', 'c1000000-0000-0000-0000-00000000000c'),
  ('a2000000-0000-0000-0000-00000000000b', 'Team B', 'soccer', 'Fall', 'TEAMB00002', null);
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'admin'), ('a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', 'manager'), ('a1000000-0000-0000-0000-00000000000a', 'a3333333-3333-3333-3333-333333333333', 'coach'),
  ('a1000000-0000-0000-0000-00000000000a', 'a4444444-4444-4444-4444-444444444444', 'parent'), ('a2000000-0000-0000-0000-00000000000b', 'a7777777-7777-7777-7777-777777777777', 'admin');
insert into public.households (id, name) values
  ('11000000-0000-0000-0000-000000000001', 'P fam'), ('22000000-0000-0000-0000-000000000002', 'P2 fam');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a4444444-4444-4444-4444-444444444444'), ('22000000-0000-0000-0000-000000000002', 'a8888888-8888-8888-8888-888888888888');

insert into public.forms (id, team_id, name) values ('f1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'Season form');
insert into public.form_versions (id, form_id, version, schema, published_by) values
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 1, '{"fields":[{"id":"shirt","type":"dropdown","label":"Shirt size","options":[{"value":"s","label":"S"},{"value":"m","label":"M"}],"required":true},{"id":"allergy","type":"long_text","label":"Allergies","sensitive":true}]}', 'a1111111-1111-1111-1111-111111111111');
insert into public.waivers (id, team_id, title, draft_body) values ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'Liability', 'I agree.');
insert into public.waiver_versions (id, waiver_id, version, title, body, content_hash)
  values ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 1, 'Liability', 'I agree.',
          encode(extensions.digest(convert_to('I agree.', 'UTF8'), 'sha256'), 'hex'));
insert into public.registration_events (id, team_id, title, slug, kind, status, capacity, waitlist_enabled, form_version_id,
    waiver_version_ids, opens_at, closes_at, created_by)
  values ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'Fall season', 'fall-season-2026', 'season', 'open', 2, true,
    'f2000000-0000-0000-0000-000000000001', array['b2000000-0000-0000-0000-000000000001']::uuid[],
    now() - interval '1 day', now() + interval '30 days', 'a1111111-1111-1111-1111-111111111111');
insert into public.registrations (id, registration_event_id, display_id, submitted_by, household_id, guardian_name, guardian_email,
    guardian_relationship, player_first_name, player_last_name, player_date_of_birth, form_version_id, answers, status)
  values
  ('d1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), 'a4444444-4444-4444-4444-444444444444',
    '11000000-0000-0000-0000-000000000001', 'Pat Parent', 'Pat@Example.test', 'Mother', 'Ava', 'Adams', current_date - interval '10 years',
    'f2000000-0000-0000-0000-000000000001', '{"shirt":"s"}', 'submitted'),
  ('d2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), 'a8888888-8888-8888-8888-888888888888',
    '22000000-0000-0000-0000-000000000002', 'Paula Parent', 'paula@example.test', 'Mother', 'Pia', 'Park', current_date - interval '9 years',
    'f2000000-0000-0000-0000-000000000001', '{"shirt":"m"}', 'submitted');
insert into public.registration_sensitive_answers (registration_id, answers) values
  ('d1000000-0000-0000-0000-000000000001', '{"allergy":"peanuts"}'), ('d2000000-0000-0000-0000-000000000002', '{"allergy":"none"}');
insert into public.registration_notes (registration_id, author_id, body) values
  ('d1000000-0000-0000-0000-000000000001', 'a3333333-3333-3333-3333-333333333333', 'Strong left foot');

insert into public.players (id, household_id, first_name, last_name, date_of_birth)
  values ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '10 years');
insert into public.team_players (team_id, player_id, jersey_number) values ('a1000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001', 7);
insert into public.team_required_waivers (team_id, waiver_id) values ('a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000001');

insert into storage.objects (bucket_id, name, metadata) values
  ('documents', 'team/a1000000-0000-0000-0000-00000000000a/dd100001-0000-0000-0000-000000000001/rules.pdf', '{"size": 1000, "mimetype": "application/pdf"}'),
  ('documents', 'team/a1000000-0000-0000-0000-00000000000a/dd100002-0000-0000-0000-000000000002/staff.pdf', '{"size": 2000, "mimetype": "application/pdf"}'),
  ('documents', 'team/a1000000-0000-0000-0000-00000000000a/dd100003-0000-0000-0000-000000000003/old.pdf', '{"size": 3000, "mimetype": "application/pdf"}'),
  ('documents', 'team/a1000000-0000-0000-0000-00000000000a/dd100009-0000-0000-0000-000000000009/orphan.pdf', '{"size": 10, "mimetype": "application/pdf"}'),
  ('waiver-copies', 'wc/ac000000-0000-0000-0000-000000000001.pdf', '{"size": 100, "mimetype": "application/pdf"}'),
  ('registration-covers', 'a1000000-0000-0000-0000-00000000000a/cover.png', '{"size": 100, "mimetype": "image/png"}');
insert into public.documents (id, team_id, title, category, storage_path, mime_type, size_bytes, visibility, pinned, uploaded_by, archived_at) values
  ('dd100001-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'Rules', 'rules', 'team/a1000000-0000-0000-0000-00000000000a/dd100001-0000-0000-0000-000000000001/rules.pdf', 'application/pdf', 1000, 'team_members', true, 'a1111111-1111-1111-1111-111111111111', null),
  ('dd100002-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 'Staff notes', 'other', 'team/a1000000-0000-0000-0000-00000000000a/dd100002-0000-0000-0000-000000000002/staff.pdf', 'application/pdf', 2000, 'staff_only', false, 'a1111111-1111-1111-1111-111111111111', null),
  ('dd100003-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-00000000000a', 'Old schedule', 'schedule', 'team/a1000000-0000-0000-0000-00000000000a/dd100003-0000-0000-0000-000000000003/old.pdf', 'application/pdf', 3000, 'team_members', false, 'a1111111-1111-1111-1111-111111111111', now());

reset role; select set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
select throws_ok($$ select public.record_waiver_acceptance('b2000000-0000-0000-0000-000000000001', 'Pat Parent', 'Mother', 'Pat@Example.test', true, 'd1000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous cannot sign through the authenticated function');
reset role; select set_config('request.jwt.claims', '{"sub":"a8888888-8888-8888-8888-888888888888","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.record_waiver_acceptance('b2000000-0000-0000-0000-000000000001', 'Pat Parent', 'Mother', 'Pat@Example.test', true, 'd1000000-0000-0000-0000-000000000001') $$, '42501', 'forbidden', 'another family cannot sign for this registration');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.record_waiver_acceptance('b2000000-0000-0000-0000-000000000001', 'Pat Parent', 'Mother', 'Pat@Example.test', true, 'd1000000-0000-0000-0000-000000000001') $$, '42501', 'forbidden', 'staff cannot sign for a family');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.record_waiver_acceptance('b2000000-0000-0000-0000-000000000001', 'Pat Parent', 'Mother', 'Pat@Example.test', false, 'd1000000-0000-0000-0000-000000000001') $$, '23514', 'consent_required', 'consent to electronic records is required');
select lives_ok($$ select public.record_waiver_acceptance('b2000000-0000-0000-0000-000000000001', 'Pat Parent', 'Mother', 'Pat@Example.test', true, 'd1000000-0000-0000-0000-000000000001') $$, 'the registrant signs');
select throws_ok($$ select public.record_waiver_acceptance('b2000000-0000-0000-0000-000000000001', 'Pat Parent', 'Mother', 'Pat@Example.test', true, 'd1000000-0000-0000-0000-000000000001') $$, '23505', null, 'signing twice is refused');
select is((select signer_email || '/' || (signer_profile_id = 'a4444444-4444-4444-4444-444444444444')::text from public.waiver_acceptances), 'pat@example.test/true', 'email normalized and signer profile recorded');
select is((select count(*)::int from public.waiver_acceptance_evidence), 0, 'no IP or user agent is recorded on the client path');
select throws_ok($$ select public.record_waiver_acceptance('b2000000-0000-0000-0000-000000000001', 'P', 'M', 'p@e.co', true, 'd1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001') $$, '22023', 'invalid_subject', 'exactly one subject');
select throws_ok($$ select public.record_waiver_acceptance('b2000000-0000-0000-0000-0000000000ff', 'P', 'M', 'p@e.co', true, 'd1000000-0000-0000-0000-000000000001') $$, 'P0002', 'waiver_not_found', 'unknown versions are refused');
reset role;
insert into public.waivers (id, team_id, title, draft_body) values ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 'Other', 'x');
insert into public.waiver_versions (id, waiver_id, version, title, body, content_hash) values ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 1, 'Other', 'x', encode(extensions.digest(convert_to('x', 'UTF8'), 'sha256'), 'hex'));
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.record_waiver_acceptance('b2000000-0000-0000-0000-000000000002', 'Pat Parent', 'Mother', 'Pat@Example.test', true, 'd1000000-0000-0000-0000-000000000001') $$, '23514', 'waiver_not_part_of_event', 'a waiver that is not part of the event is refused');
select lives_ok($$ select public.record_waiver_acceptance('b2000000-0000-0000-0000-000000000001', 'Pat Parent', 'Mother', 'pat@example.test', true, null, '91000000-0000-0000-0000-000000000001') $$, 'a guardian signs for their rostered child');
reset role; select set_config('request.jwt.claims', '{"sub":"a8888888-8888-8888-8888-888888888888","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.record_waiver_acceptance('b2000000-0000-0000-0000-000000000001', 'P', 'M', 'p@e.co', true, null, '91000000-0000-0000-0000-000000000001') $$, '42501', 'forbidden', 'another family cannot sign for the child');
reset role;
insert into public.waiver_versions (id, waiver_id, version, title, body, content_hash) values ('b2000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 2, 'Liability', 'v2', encode(extensions.digest(convert_to('v2', 'UTF8'), 'sha256'), 'hex'));
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.record_waiver_acceptance('b2000000-0000-0000-0000-000000000001', 'P', 'M', 'p@e.co', true, null, '91000000-0000-0000-0000-000000000001') $$, '23514', 'waiver_version_outdated', 'only the current version can be signed for a rostered player');
reset role;
update public.registrations set status = 'accepted' where id = 'd1000000-0000-0000-0000-000000000001';
update public.registrations set status = 'declined' where id = 'd2000000-0000-0000-0000-000000000002';
reset role; select set_config('request.jwt.claims', '{"sub":"a8888888-8888-8888-8888-888888888888","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.record_waiver_acceptance('b2000000-0000-0000-0000-000000000001', 'Pat Parent', 'Mother', 'Pat@Example.test', true, 'd2000000-0000-0000-0000-000000000002') $$, '23514', 'registration_closed', 'a declined registration cannot sign');
reset role;
select is((select count(*)::int from public.audit_log where action = 'waiver.accept' and created_at = now()), 2, 'signatures are audited');

select * from finish();
rollback;
