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

reset role;

update public.registration_events set ends_on = current_date - 400, starts_on = current_date - 410 where id = 'e1000000-0000-0000-0000-000000000001';

insert into public.registrations (id, registration_event_id, display_id, submitted_by, household_id, guardian_name, guardian_email, guardian_relationship,
  player_first_name, player_last_name, player_date_of_birth, form_version_id, status, waitlist_position, hold_expires_at)
  values ('d9000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), 'a4444444-4444-4444-4444-444444444444', null, 'Guardian 3', 'g3@example.test', 'Mother',
  'Kid3', 'Kidson3', date '2016-05-05', 'f2000000-0000-0000-0000-000000000001', 'declined', null, null);
insert into public.registrations (id, registration_event_id, display_id, submitted_by, household_id, guardian_name, guardian_email, guardian_relationship,
  player_first_name, player_last_name, player_date_of_birth, form_version_id, status, waitlist_position, hold_expires_at)
  values ('d9000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), 'a4444444-4444-4444-4444-444444444444', null, 'Guardian 4', 'g4@example.test', 'Mother',
  'Kid4', 'Kidson4', date '2016-05-05', 'f2000000-0000-0000-0000-000000000001', 'withdrawn', null, null);

update public.registrations set decision_note = 'Sorry Zed' where id = 'd9000000-0000-0000-0000-000000000003';
insert into public.registration_sensitive_answers (registration_id, answers) values ('d9000000-0000-0000-0000-000000000003', '{"allergy":"x"}');
insert into public.registration_notes (registration_id, author_id, body) values ('d9000000-0000-0000-0000-000000000003', 'a3333333-3333-3333-3333-333333333333', 'note');
update public.registrations set status = 'accepted' where id = 'd1000000-0000-0000-0000-000000000001';
update public.registrations set status = 'placed' where id = 'd1000000-0000-0000-0000-000000000001';
insert into public.waiver_acceptances (registration_id, waiver_version_id, signer_name, signer_relationship, signer_email, electronic_consent)
  values ('d9000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000001', 'Guardian 3', 'Mother', 'g3@example.test', true);
select is((select public.svc_run_registration_retention() ->> 'anonymized'), '2', 'old declined and withdrawn registrations are anonymized');
select is((select guardian_name || '/' || player_first_name || '/' || guardian_email from public.registrations where id = 'd9000000-0000-0000-0000-000000000003'), 'Anonymized/Anonymized/anonymized+d9000000-0000-0000-0000-000000000003@anonymized.invalid', 'personal data is replaced');
select is((select player_date_of_birth from public.registrations where id = 'd9000000-0000-0000-0000-000000000003'), date_trunc('year', date '2016-05-05')::date, 'date of birth is reduced to the year');
select is((select (answers = '{}'::jsonb and decision_note is null and submitted_by is null and anonymized_at is not null)::text from public.registrations where id = 'd9000000-0000-0000-0000-000000000003'), 'true', 'answers, note and links are cleared');
select is((select count(*)::int from public.registration_sensitive_answers where registration_id = 'd9000000-0000-0000-0000-000000000003'), 0, 'sensitive answers are deleted');
select is((select count(*)::int from public.registration_notes where registration_id = 'd9000000-0000-0000-0000-000000000003'), 0, 'staff notes are deleted');
select is((select signer_name from public.waiver_acceptances where registration_id = 'd9000000-0000-0000-0000-000000000003'), 'Guardian 3', 'signed waivers are append-only legal records and are left intact');
select throws_ok($$ update public.registrations set guardian_name = 'again' where id = 'd9000000-0000-0000-0000-000000000003' $$, '23514', 'registration_anonymized', 'an anonymized row never changes again');
select is((select status from public.registrations where id = 'd2000000-0000-0000-0000-000000000002'), 'submitted', 'active registrations are not anonymized');
select is((select count(*)::int from public.registration_sensitive_answers where registration_id = 'd2000000-0000-0000-0000-000000000002'), 0, 'sensitive answers of a finished event are purged (past 90 days)');
select is((select count(*)::int from public.registration_sensitive_answers where registration_id = 'd1000000-0000-0000-0000-000000000001'), 1, 'but kept for a placed player');
select is((select public.svc_run_registration_retention() ->> 'anonymized'), '0', 'a second run is a no-op');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.svc_run_registration_retention() $$, '42501', null, 'clients cannot run retention');

select * from finish();
rollback;
