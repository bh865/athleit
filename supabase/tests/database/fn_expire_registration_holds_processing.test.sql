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
insert into public.waiver_acceptances (id, registration_id, waiver_version_id, signer_name, signer_relationship, signer_profile_id, signer_email, electronic_consent, signed_copy_path)
  values ('ac000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'Pat Parent', 'Mother', 'a4444444-4444-4444-4444-444444444444', 'PAT@example.test', true, 'wc/ac000000-0000-0000-0000-000000000001.pdf');
insert into public.waiver_acceptance_evidence (acceptance_id, ip_address, user_agent) values ('ac000000-0000-0000-0000-000000000001', '203.0.113.9', 'TestAgent/1.0');
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

insert into public.players (id, household_id, first_name, last_name, date_of_birth) values ('92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'Pia', 'Park', current_date - interval '9 years');
insert into public.connected_accounts (team_id, stripe_account_id, charges_enabled, details_submitted, payouts_enabled, onboarding_status)
  values ('a1000000-0000-0000-0000-00000000000a', 'acct_test123', true, true, true, 'ready');
insert into public.registration_events (id, team_id, title, slug, kind, status, capacity, waitlist_enabled, form_version_id, price_cents, payment_timing, payment_hold_minutes, opens_at, closes_at, created_by) values
  ('e2000000-0000-0000-0000-0000000000a2', 'a1000000-0000-0000-0000-00000000000a', 'Paid camp AA', 'paid-camp-aa-001', 'camp', 'open', 5, true, 'f2000000-0000-0000-0000-000000000001', 2500, 'after_acceptance', 30, now() - interval '1 day', now() + interval '30 days', 'a1111111-1111-1111-1111-111111111111'),
  ('e3000000-0000-0000-0000-0000000000a3', 'a1000000-0000-0000-0000-00000000000a', 'Paid camp AS', 'paid-camp-as-001', 'camp', 'open', 2, true, 'f2000000-0000-0000-0000-000000000001', 3000, 'at_submission', 30, now() - interval '1 day', now() + interval '30 days', 'a1111111-1111-1111-1111-111111111111');

reset role;
select lives_ok($$ select * from public.svc_create_registration('e3000000-0000-0000-0000-0000000000a3', 'f2000000-0000-0000-0000-000000000001', 'Pat Parent', 'pr1@example.test', '555-0100', 'Mother', 'Ava', 'Adams', (current_date - interval '10 years')::date, '91000000-0000-0000-0000-000000000001', 'a4444444-4444-4444-4444-444444444444', '{"shirt":"s"}'::jsonb, '{}'::jsonb) $$, 'Ava submits');
select lives_ok($$ select * from public.svc_create_registration('e3000000-0000-0000-0000-0000000000a3', 'f2000000-0000-0000-0000-000000000001', 'Pat Parent', 'pr2@example.test', '555-0100', 'Mother', 'Pia', 'Park', (current_date - interval '9 years')::date, '92000000-0000-0000-0000-000000000002', 'a8888888-8888-8888-8888-888888888888', '{"shirt":"s"}'::jsonb, '{}'::jsonb) $$, 'Pia submits');
update public.registrations set hold_expires_at = now() - interval '5 minutes' where registration_event_id = 'e3000000-0000-0000-0000-0000000000a3';
update public.payment_requests set status = 'processing' where registration_id in (select id from public.registrations where registration_event_id = 'e3000000-0000-0000-0000-0000000000a3');
select is(private.expire_registration_holds(), 0, 'processing within the 15 minute grace: nothing expires');
update public.registrations set hold_expires_at = now() - interval '30 minutes' where player_first_name = 'Ava' and registration_event_id = 'e3000000-0000-0000-0000-0000000000a3';
select is(private.expire_registration_holds(), 1, 'an abandoned checkout (processing, 30 minutes past the hold) expires');
select is((select status from public.payment_requests where registration_id = (select id from public.registrations where player_first_name = 'Ava' and registration_event_id = 'e3000000-0000-0000-0000-0000000000a3')), 'cancelled', 'its request is cancelled');
select is((select status from public.registrations where player_first_name = 'Pia' and registration_event_id = 'e3000000-0000-0000-0000-0000000000a3'), 'submitted', 'the other is untouched');

select * from finish();
rollback;
