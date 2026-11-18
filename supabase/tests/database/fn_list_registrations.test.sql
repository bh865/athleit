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
insert into public.registrations (id, registration_event_id, display_id, submitted_by, household_id, guardian_name, guardian_email, guardian_relationship,
  player_first_name, player_last_name, player_date_of_birth, form_version_id, status, waitlist_position, hold_expires_at)
  values ('d9000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), 'a8888888-8888-8888-8888-888888888888', null, 'Guardian 3', 'g3@example.test', 'Mother',
  'Kid3', 'Kidson3', date '2016-05-05', 'f2000000-0000-0000-0000-000000000001', 'waitlisted', 1, null);

update public.registration_events set waiver_version_ids = waiver_version_ids where id = 'e1000000-0000-0000-0000-000000000001';
reset role; select set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
select throws_ok($$ select * from public.list_registrations('e1000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous cannot list');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.list_registrations('e1000000-0000-0000-0000-000000000001')), 0, 'a parent lists nothing');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.list_registrations('e1000000-0000-0000-0000-000000000001')), 0, 'an outsider lists nothing');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.list_registrations('e1000000-0000-0000-0000-000000000001')), 0, 'a club admin lists nothing for a team-issued event');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.list_registrations('e1000000-0000-0000-0000-000000000001')), 3, 'a coach lists the event''s registrations');
select is((select max(total_count)::int from public.list_registrations('e1000000-0000-0000-0000-000000000001', p_limit => 1)), 3, 'total_count ignores paging');
select is((select count(*)::int from public.list_registrations('e1000000-0000-0000-0000-000000000001', p_limit => 1, p_offset => 2)), 1, 'paging works');
select is((select count(*)::int from public.list_registrations('e1000000-0000-0000-0000-000000000001', p_status => array['waitlisted'])), 1, 'status filter');
select is((select waitlist_rank from public.list_registrations('e1000000-0000-0000-0000-000000000001', p_status => array['waitlisted'])), 1::bigint, 'waitlist rank is exposed');
select is((select count(*)::int from public.list_registrations('e1000000-0000-0000-0000-000000000001', p_search => 'pia')), 1, 'search by player name');
select is((select count(*)::int from public.list_registrations('e1000000-0000-0000-0000-000000000001', p_search => '%')), 0, 'LIKE wildcards are not interpreted');
select is((select count(*)::int from public.list_registrations('e1000000-0000-0000-0000-000000000001', p_missing_waivers => true)), 3, 'all three are missing a waiver');
select is((select (guardian_email is not null)::text from public.list_registrations('e1000000-0000-0000-0000-000000000001', p_limit => 1)), 'true', 'staff see guardian contact fields');
reset role;
insert into public.waiver_acceptances (registration_id, waiver_version_id, signer_name, signer_relationship, signer_email, electronic_consent)
  values ('d1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'Pat', 'Mother', 'p@e.co', true);
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.list_registrations('e1000000-0000-0000-0000-000000000001', p_missing_waivers => true)), 2, 'a signed waiver leaves the missing list');
select is((select count(*)::int from public.list_registrations('e1000000-0000-0000-0000-000000000001', p_missing_waivers => false)), 1, 'and joins the complete list');
select is((select waivers_signed from public.list_registrations('e1000000-0000-0000-0000-000000000001', p_search => 'REG-') where player_first_name = 'Ava'), 1, 'signed count is shown');

select * from finish();
rollback;
