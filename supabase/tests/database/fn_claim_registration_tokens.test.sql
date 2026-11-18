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
insert into public.registrations (id, registration_event_id, display_id, guardian_name, guardian_email, guardian_relationship, player_first_name, player_last_name, player_date_of_birth, form_version_id, status, verified_at)
  values ('d9000000-0000-0000-0000-000000000040', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), 'Anon', 'anon@example.test', 'Mother', 'Cy', 'Cole', date '2016-01-02', 'f2000000-0000-0000-0000-000000000001', 'submitted', now());
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.svc_issue_claim_token('d9000000-0000-0000-0000-000000000040', repeat('a', 64)) $$, '42501', null, 'clients cannot mint claim tokens');
select throws_ok($$ select public.svc_claim_registration(repeat('a', 64), 'a4444444-4444-4444-4444-444444444444') $$, '42501', null, 'clients cannot claim with a token directly');
select throws_ok($$ select public.claim_my_registrations() $$, '42883', null, 'the email-match claim no longer exists');
reset role;
select lives_ok($$ select public.svc_issue_claim_token('d9000000-0000-0000-0000-000000000040', repeat('a', 64)) $$, 'a claim token is issued for an unclaimed, verified registration');
select throws_ok($$ select public.svc_issue_claim_token('d1000000-0000-0000-0000-000000000001', repeat('b', 64)) $$, '23514', 'not_claimable', 'but not for an already-claimed one');
select throws_ok($$ select public.svc_claim_registration(repeat('9', 64), 'a4444444-4444-4444-4444-444444444444') $$, '22023', 'invalid_token', 'unknown token');
insert into public.registration_verification_tokens (registration_id, purpose, token_hash, expires_at) values ('d9000000-0000-0000-0000-000000000040', 'verify', repeat('c', 64), now() + interval '1 hour');
select throws_ok($$ select public.svc_claim_registration(repeat('c', 64), 'a4444444-4444-4444-4444-444444444444') $$, '22023', 'invalid_token', 'a verification token is not a claim token');
select is(public.svc_claim_registration(repeat('a', 64), 'a4444444-4444-4444-4444-444444444444'), 'd9000000-0000-0000-0000-000000000040'::uuid, 'the token claims the registration for the signed-in user');
select is((select submitted_by from public.registrations where id = 'd9000000-0000-0000-0000-000000000040'), 'a4444444-4444-4444-4444-444444444444'::uuid, 'submitted_by is set');
select throws_ok($$ select public.svc_claim_registration(repeat('a', 64), 'a8888888-8888-8888-8888-888888888888') $$, '22023', 'invalid_token', 'replay is refused (the first claimer keeps it)');
select is((select count(*)::int from public.audit_log where action = 'registration.claim' and created_at = now()), 1, 'the claim is audited');
reset role;
insert into public.registrations (id, registration_event_id, display_id, submitted_by, household_id, guardian_name, guardian_email, guardian_relationship,
  player_first_name, player_last_name, player_date_of_birth, form_version_id, status, waitlist_position, hold_expires_at)
  values ('d9000000-0000-0000-0000-000000000041', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), null, null, 'Guardian 41', 'g41@example.test', 'Mother',
  'Kid41', 'Kidson41', date '2016-05-05', 'f2000000-0000-0000-0000-000000000001', 'submitted', null, null);

update public.registrations set verified_at = now() where id = 'd9000000-0000-0000-0000-000000000041';
select lives_ok($$ select public.svc_issue_claim_token('d9000000-0000-0000-0000-000000000041', repeat('d', 64)) $$, 'second registration');
update public.registration_verification_tokens set expires_at = now() - interval '1 second' where token_hash = repeat('d', 64);
select throws_ok($$ select public.svc_claim_registration(repeat('d', 64), 'a4444444-4444-4444-4444-444444444444') $$, '22023', 'invalid_token', 'an expired claim token is refused');
update public.registrations set status = 'declined' where id = 'd9000000-0000-0000-0000-000000000041';
select throws_ok($$ select public.svc_issue_claim_token('d9000000-0000-0000-0000-000000000041', repeat('e', 64)) $$, '23514', 'not_claimable', 'a declined registration cannot be claimed');

select * from finish();
rollback;
