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
insert into public.registration_events (id, team_id, title, slug, status, capacity, waitlist_enabled, form_version_id, price_cents, payment_timing, payment_hold_minutes, opens_at, closes_at)
  values ('e5000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-00000000000a', 'Paid camp', 'paid-camp-aaa', 'open', 1, true, 'f2000000-0000-0000-0000-000000000001', 2500, 'at_submission', 30, now() - interval '1 day', now() + interval '9 days');
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', date '2016-05-05'),
  ('92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'Pia', 'Park', date '2016-06-06');
insert into public.connected_accounts (team_id, stripe_account_id, charges_enabled, details_submitted, payouts_enabled, onboarding_status) values ('a1000000-0000-0000-0000-00000000000a', 'acct_rules1', true, true, true, 'ready');
select throws_ok($$ select * from public.svc_create_registration('e5000000-0000-0000-0000-000000000005', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'gina@example.test', '555-0100', 'Father', 'Kid', 'Kidson', date '2016-05-05', null, null, '{"shirt":"s"}'::jsonb, '{}'::jsonb) $$, '23514', 'account_required', 'a paid at_submission event refuses anonymous submissions');
select lives_ok($$ select * from public.svc_create_registration('e5000000-0000-0000-0000-000000000005', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'gina@example.test', '555-0100', 'Father', 'Kid', 'Kidson', date '2016-05-05', '91000000-0000-0000-0000-000000000001', 'a4444444-4444-4444-4444-444444444444', '{"shirt":"s"}'::jsonb, '{}'::jsonb) $$, 'a signed-in guardian can submit');
select is((select (hold_expires_at between now() + interval '29 minutes' and now() + interval '31 minutes')::text from public.registrations where registration_event_id = 'e5000000-0000-0000-0000-000000000005'), 'true', 'an unpaid hold is set from payment_hold_minutes');
select is(private.registration_taken('e5000000-0000-0000-0000-000000000005'), 1, 'a running hold takes a spot');
select is((select status from public.svc_create_registration('e5000000-0000-0000-0000-000000000005', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'second@example.test', '555-0100', 'Father', 'Pia', 'Kidson', date '2016-05-05', '92000000-0000-0000-0000-000000000002', 'a8888888-8888-8888-8888-888888888888', '{"shirt":"s"}'::jsonb, '{}'::jsonb)), 'waitlisted', 'the next one is waitlisted when the held spot fills capacity');
select is((select waitlist_position from public.registrations where player_first_name = 'Pia' and registration_event_id = 'e5000000-0000-0000-0000-000000000005'), 1, 'with position 1');
update public.registrations set hold_expires_at = now() - interval '1 minute' where registration_event_id = 'e5000000-0000-0000-0000-000000000005' and status = 'submitted';
select is(private.registration_taken('e5000000-0000-0000-0000-000000000005'), 0, 'an expired hold stops taking a spot');
update public.registrations set hold_expires_at = null where registration_event_id = 'e5000000-0000-0000-0000-000000000005' and status = 'submitted';
select is(private.registration_taken('e5000000-0000-0000-0000-000000000005'), 1, 'a paid hold (no expiry) keeps its spot');
update public.registration_events set waitlist_enabled = false where id = 'e5000000-0000-0000-0000-000000000005';
select throws_ok($$ select * from public.svc_create_registration('e5000000-0000-0000-0000-000000000005', 'f2000000-0000-0000-0000-000000000001', 'Gina Guardian', 'third@example.test', '555-0100', 'Father', 'Kid', 'Kidson', date '2016-05-05', '91000000-0000-0000-0000-000000000001', 'a4444444-4444-4444-4444-444444444444', '{"shirt":"s"}'::jsonb, '{}'::jsonb) $$, '23514', 'registration_full', 'a full event without a waitlist refuses');

select * from finish();
rollback;
