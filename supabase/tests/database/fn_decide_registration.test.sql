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

reset role; select set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
select throws_ok($$ select public.decide_registration('d1000000-0000-0000-0000-000000000001', 'accept', null) $$, '42501', null, 'anonymous cannot decide');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.decide_registration('d1000000-0000-0000-0000-000000000001', 'accept', null) $$, '42501', 'forbidden', 'a parent cannot decide');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.decide_registration('d1000000-0000-0000-0000-000000000001', 'accept', null) $$, '42501', 'forbidden', 'a coach cannot decide');
reset role; select set_config('request.jwt.claims', '{"sub":"a7777777-7777-7777-7777-777777777777","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.decide_registration('d1000000-0000-0000-0000-000000000001', 'accept', null) $$, '42501', 'forbidden', 'another team''s admin cannot decide');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.decide_registration('d1000000-0000-0000-0000-000000000001', 'accept', null) $$, '42501', 'forbidden', 'a club admin cannot decide a team-issued registration');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.decide_registration('d1000000-0000-0000-0000-000000000001', 'maybe', null) $$, '22023', 'invalid_decision', 'unknown decisions are refused');
select is((select public.decide_registration('d1000000-0000-0000-0000-000000000001', 'accept', '  Welcome!  ') ->> 'status'), 'accepted', 'a manager accepts');
select is((select decision_note || '/' || (decided_by = 'a2222222-2222-2222-2222-222222222222')::text from public.registrations where id = 'd1000000-0000-0000-0000-000000000001'), 'Welcome!/true', 'the message and decider are recorded');
select is((select count(*)::int from public.team_players), 0, 'accepted does NOT put anyone on a roster');
select throws_ok($$ select public.decide_registration('d1000000-0000-0000-0000-000000000001', 'accept', null) $$, '23514', 'invalid_status_transition', 'accepting twice is refused');
select lives_ok($$ select public.decide_registration('d2000000-0000-0000-0000-000000000002', 'accept', null) $$, 'a second spot is accepted');
reset role;
insert into public.registrations (id, registration_event_id, display_id, submitted_by, household_id, guardian_name, guardian_email, guardian_relationship,
  player_first_name, player_last_name, player_date_of_birth, form_version_id, status, waitlist_position, hold_expires_at)
  values ('d9000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), 'a4444444-4444-4444-4444-444444444444', null, 'Guardian 3', 'g3@example.test', 'Mother',
  'Kid3', 'Kidson3', date '2016-05-05', 'f2000000-0000-0000-0000-000000000001', 'submitted', null, null);
insert into public.registrations (id, registration_event_id, display_id, submitted_by, household_id, guardian_name, guardian_email, guardian_relationship,
  player_first_name, player_last_name, player_date_of_birth, form_version_id, status, waitlist_position, hold_expires_at)
  values ('d9000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), 'a4444444-4444-4444-4444-444444444444', null, 'Guardian 4', 'g4@example.test', 'Mother',
  'Kid4', 'Kidson4', date '2016-05-05', 'f2000000-0000-0000-0000-000000000001', 'submitted', null, null);

reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.decide_registration('d9000000-0000-0000-0000-000000000003', 'accept', null) $$, '23514', 'capacity_full', 'the last spot cannot be over-accepted');
select is((select public.decide_registration('d9000000-0000-0000-0000-000000000003', 'waitlist') ->> 'status'), 'waitlisted', 'staff can waitlist instead');
select is((select waitlist_position from public.registrations where id = 'd9000000-0000-0000-0000-000000000003'), 1, 'with a stable position');
select is((select public.decide_registration('d9000000-0000-0000-0000-000000000004', 'waitlist') ->> 'status'), 'waitlisted', 'a second one waits');
select is((select waitlist_position from public.registrations where id = 'd9000000-0000-0000-0000-000000000004'), 2, 'behind the first');
select is((select public.decide_registration('d1000000-0000-0000-0000-000000000001', 'decline', 'Sorry') ->> 'status'), 'declined', 'declining an accepted registration frees the spot');
select is((select status from public.registrations where id = 'd9000000-0000-0000-0000-000000000003'), 'waitlisted', 'with staff-confirmed promotion nobody moves automatically');
select throws_ok($$ select public.decide_registration('d1000000-0000-0000-0000-000000000001', 'accept', null) $$, '23514', 'invalid_status_transition', 'a declined registration cannot be accepted');
select lives_ok($$ select public.decide_registration('d9000000-0000-0000-0000-000000000003', 'accept', null) $$, 'staff can accept from the waitlist');
select throws_ok($$ select public.decide_registration('d2000000-0000-0000-0000-000000000002', 'waitlist', null) $$, '23514', 'invalid_status_transition', 'only submitted registrations can be waitlisted');
reset role;
update public.registration_events set auto_promote_waitlist = true where id = 'e1000000-0000-0000-0000-000000000001';
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select jsonb_array_length(public.decide_registration('d2000000-0000-0000-0000-000000000002', 'decline') -> 'promoted')), 1, 'with auto-promote the first waitlisted registration is accepted');
select is((select status from public.registrations where id = 'd9000000-0000-0000-0000-000000000004'), 'accepted', 'in order');
reset role;
insert into public.registrations (id, registration_event_id, display_id, submitted_by, household_id, guardian_name, guardian_email, guardian_relationship,
  player_first_name, player_last_name, player_date_of_birth, form_version_id, status, waitlist_position, hold_expires_at)
  values ('d9000000-0000-0000-0000-000000000006', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), null, null, 'Guardian 6', 'g6@example.test', 'Mother',
  'Kid6', 'Kidson6', date '2016-05-05', 'f2000000-0000-0000-0000-000000000001', 'pending_verification', null, null);
insert into public.registrations (id, registration_event_id, display_id, submitted_by, household_id, guardian_name, guardian_email, guardian_relationship,
  player_first_name, player_last_name, player_date_of_birth, form_version_id, status, waitlist_position, hold_expires_at)
  values ('d9000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), 'a4444444-4444-4444-4444-444444444444', null, 'Guardian 7', 'g7@example.test', 'Mother',
  'Kid7', 'Kidson7', date '2016-05-05', 'f2000000-0000-0000-0000-000000000001', 'submitted', null, null);

update public.registrations set status = 'accepted' where id = 'd9000000-0000-0000-0000-000000000007';
update public.registrations set status = 'placed' where id = 'd9000000-0000-0000-0000-000000000007';
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.decide_registration('d9000000-0000-0000-0000-000000000006', 'accept', null) $$, '23514', 'unverified', 'an unverified registration cannot be decided');
select throws_ok($$ select public.decide_registration('d9000000-0000-0000-0000-000000000007', 'decline', null) $$, '23514', 'already_placed', 'a placed registration cannot be declined');
reset role;
select is((select count(*)::int from public.audit_log where action = 'registration.decide' and created_at = now()), 7, 'every decision is audited');

select * from finish();
rollback;
