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
update public.registration_events set capacity = 1, auto_promote_waitlist = false where id = 'e1000000-0000-0000-0000-000000000001';
insert into public.registrations (id, registration_event_id, display_id, submitted_by, household_id, guardian_name, guardian_email, guardian_relationship,
  player_first_name, player_last_name, player_date_of_birth, form_version_id, status, waitlist_position, hold_expires_at)
  values ('d9000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), 'a4444444-4444-4444-4444-444444444444', null, 'Guardian 3', 'g3@example.test', 'Mother',
  'Kid3', 'Kidson3', date '2016-05-05', 'f2000000-0000-0000-0000-000000000001', 'submitted', null, null);
insert into public.registrations (id, registration_event_id, display_id, submitted_by, household_id, guardian_name, guardian_email, guardian_relationship,
  player_first_name, player_last_name, player_date_of_birth, form_version_id, status, waitlist_position, hold_expires_at)
  values ('d9000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), 'a4444444-4444-4444-4444-444444444444', null, 'Guardian 4', 'g4@example.test', 'Mother',
  'Kid4', 'Kidson4', date '2016-05-05', 'f2000000-0000-0000-0000-000000000001', 'submitted', null, null);
insert into public.registrations (id, registration_event_id, display_id, submitted_by, household_id, guardian_name, guardian_email, guardian_relationship,
  player_first_name, player_last_name, player_date_of_birth, form_version_id, status, waitlist_position, hold_expires_at)
  values ('d9000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), 'a4444444-4444-4444-4444-444444444444', null, 'Guardian 5', 'g5@example.test', 'Mother',
  'Kid5', 'Kidson5', date '2016-05-05', 'f2000000-0000-0000-0000-000000000001', 'submitted', null, null);

reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.decide_registration('d1000000-0000-0000-0000-000000000001', 'accept', null) $$, 'the last spot goes to the first accepted registration');
select throws_ok($$ select public.decide_registration('d2000000-0000-0000-0000-000000000002', 'accept', null) $$, '23514', 'capacity_full', 'a second acceptance for the same spot is refused');
select throws_ok($$ select public.decide_registration('d9000000-0000-0000-0000-000000000003', 'accept', null) $$, '23514', 'capacity_full', 'and so is a third');
select is((select taken from public.registration_capacity_summary('e1000000-0000-0000-0000-000000000001')), 1, 'taken never exceeds capacity');
select lives_ok($$ select public.decide_registration('d2000000-0000-0000-0000-000000000002', 'waitlist', null) $$, 'the second goes to the waitlist');
select lives_ok($$ select public.decide_registration('d9000000-0000-0000-0000-000000000003', 'waitlist', null) $$, 'then the third');
select lives_ok($$ select public.decide_registration('d9000000-0000-0000-0000-000000000004', 'waitlist', null) $$, 'then the fourth');
select is((select string_agg(waitlist_position::text, ',' order by waitlist_position) from public.registrations where status = 'waitlisted'), '1,2,3', 'waitlist positions are 1,2,3 in decision order');
select lives_ok($$ select public.withdraw_registration('d9000000-0000-0000-0000-000000000003') $$, 'the middle one withdraws');
select is((select string_agg(waitlist_position::text, ',' order by waitlist_position) from public.registrations where status = 'waitlisted'), '1,3', 'positions are never renumbered (stable order)');
select lives_ok($$ select public.decide_registration('d1000000-0000-0000-0000-000000000001', 'decline', null) $$, 'the accepted one declines');
select is(public.promote_from_waitlist('e1000000-0000-0000-0000-000000000001'), 'd2000000-0000-0000-0000-000000000002'::uuid, 'staff promote: the earliest waitlisted registration gets the spot');
select is(public.promote_from_waitlist('e1000000-0000-0000-0000-000000000001'), null::uuid, 'and only one: the event is full again');
select is((select count(*)::int from public.team_players), 0, 'accepted never means placed: nobody is on any roster');
reset role;
select is((select count(*)::int from public.registrations where status in ('accepted', 'placed')), 1, 'the database holds exactly one accepted registration for one spot');

select * from finish();
rollback;
