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

reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select * from public.svc_create_registration('e1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'gina@example.test', '555-0100', 'Father', 'Kid', 'Kidson', date '2016-05-05', null, null, '{"shirt":"s"}'::jsonb, '{}'::jsonb) $$, '42501', null, 'clients cannot call the service function');
reset role; select set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
select throws_ok($$ select * from public.svc_create_registration('e1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'gina@example.test', '555-0100', 'Father', 'Kid', 'Kidson', date '2016-05-05', null, null, '{"shirt":"s"}'::jsonb, '{}'::jsonb) $$, '42501', null, 'anonymous cannot call the service function');
reset role;
select is((select status from public.svc_create_registration('e1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'gina@example.test', '555-0100', 'Father', 'Kid', 'Kidson', date '2016-05-05', null, null, '{"shirt":"s"}'::jsonb, '{}'::jsonb) ), 'pending_verification', 'an anonymous submission starts as pending_verification');
select is((select count(*)::int from public.registration_sensitive_answers), 2, 'no sensitive row when none was submitted');
select is((select display_id ~ '^REG-[0-9]{4,}$' from public.svc_create_registration('e1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'zoe@example.test', '555-0100', 'Father', 'Zoe', 'Kidson', date '2016-05-05', null, null, '{"shirt":"s"}'::jsonb, '{}'::jsonb) ), true, 'display ids look like REG-1042');
select is((select count(*)::int from public.registration_sensitive_answers), 2, 'still two (control)');
select lives_ok($$ select * from public.svc_create_registration('e1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'sam@example.test', '555-0100', 'Father', 'Sam', 'Kidson', date '2016-05-05', null, 'a8888888-8888-8888-8888-888888888888', '{"shirt":"s"}'::jsonb, '{"allergy":"bees"}'::jsonb) $$, 'a signed-in guardian submits with sensitive answers');
select is((select s.answers ->> 'allergy' from public.registration_sensitive_answers s join public.registrations r on r.id = s.registration_id where r.player_first_name = 'Sam'), 'bees', 'sensitive answers go to the separate table');
select is((select (answers ? 'allergy')::text from public.registrations where player_first_name = 'Sam'), 'false', 'and never into ordinary answers');
select is((select status from public.registrations where player_first_name = 'Sam'), 'submitted', 'signed-in guardians skip verification');
select is((select count(*)::int from public.audit_log where action = 'registration.submit' and created_at = now() and after::text ~* 'example\.test|Gina|bees'), 0, 'the audit trail holds no PII or answers');
select throws_ok($$ select * from public.svc_create_registration('e1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'a1@example.test', '555-0100', 'Father', 'A1', 'Kidson', date '2016-05-05', null, null, '{"evil":"x"}'::jsonb, '{}'::jsonb) $$, '22023', 'unknown_answer', 'unknown answer keys are rejected');
select throws_ok($$ select * from public.svc_create_registration('e1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'a2@example.test', '555-0100', 'Father', 'A2', 'Kidson', date '2016-05-05', null, null, '{"allergy":"x"}'::jsonb, '{}'::jsonb) $$, '22023', 'unknown_answer', 'a sensitive field cannot be sent as an ordinary answer');
select throws_ok($$ select * from public.svc_create_registration('e1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'a3@example.test', '555-0100', 'Father', 'A3', 'Kidson', date '2016-05-05', null, null, '{"shirt":"s"}'::jsonb, '{"shirt":"s"}'::jsonb) $$, '22023', 'unknown_answer', 'an ordinary field cannot be sent as sensitive');
select throws_ok($$ select * from public.svc_create_registration('e1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'gina@example.test', '555-0100', 'Father', 'Kid', 'Kidson', date '2016-05-05', null, null, '{"shirt":"s"}'::jsonb, '{}'::jsonb) $$, '23505', null, 'the same child cannot register twice for an event');
select throws_ok($$ select * from public.svc_create_registration('e1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-0000000000ff', 'G', 'g@example.test', null, 'M', 'A', 'B', date '2016-05-05', null, null, '{}', '{}') $$, '23514', 'form_version_mismatch', 'the form version must be the event''s');
select throws_ok($$ select * from public.svc_create_registration('e1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'x@example.test', '555-0100', 'Father', 'Pia2', 'Kidson', date '2016-05-05', '91000000-0000-0000-0000-000000000001', 'a8888888-8888-8888-8888-888888888888', '{"shirt":"s"}'::jsonb, '{}'::jsonb) $$, '42501', 'player_not_yours', 'a player that is not yours is refused');
update public.registration_events set eligibility = '{"type":"birth_date","min":"2030-01-01"}' where id = 'e1000000-0000-0000-0000-000000000001';
select throws_ok($$ select * from public.svc_create_registration('e1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'old@example.test', '555-0100', 'Father', 'Old', 'Kidson', date '2016-05-05', null, null, '{"shirt":"s"}'::jsonb, '{}'::jsonb) $$, '23514', 'not_eligible', 'an ineligible date of birth is refused');
update public.registration_events set eligibility = null, opens_at = now() + interval '1 day' where id = 'e1000000-0000-0000-0000-000000000001';
select throws_ok($$ select * from public.svc_create_registration('e1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'early@example.test', '555-0100', 'Father', 'Early', 'Kidson', date '2016-05-05', null, null, '{"shirt":"s"}'::jsonb, '{}'::jsonb) $$, '23514', 'not_open_yet', 'before the window opens');
update public.registration_events set opens_at = now() - interval '2 days', closes_at = now() - interval '1 day' where id = 'e1000000-0000-0000-0000-000000000001';
select throws_ok($$ select * from public.svc_create_registration('e1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'late@example.test', '555-0100', 'Father', 'Late', 'Kidson', date '2016-05-05', null, null, '{"shirt":"s"}'::jsonb, '{}'::jsonb) $$, '23514', 'registration_closed', 'after the window closes');
update public.registration_events set closes_at = now() + interval '5 days', status = 'closed' where id = 'e1000000-0000-0000-0000-000000000001';
select throws_ok($$ select * from public.svc_create_registration('e1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'closed@example.test', '555-0100', 'Father', 'Closed', 'Kidson', date '2016-05-05', null, null, '{"shirt":"s"}'::jsonb, '{}'::jsonb) $$, '23514', 'registration_closed', 'a closed event refuses submissions');

select * from finish();
rollback;
