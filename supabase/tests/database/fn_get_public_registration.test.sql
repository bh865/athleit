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
select is((select public.get_public_registration('fall-season-2026') ->> 'title'), 'Fall season', 'anonymous visitors can read the public page data');
select is((select array_agg(k order by k) from jsonb_object_keys(public.get_public_registration('fall-season-2026')) k), (select array_agg(k order by k) from unnest(array['cover_image_path','contact_email','eligibility','ends_on','form','info_blocks','issuer_name','kind','location_text','noindex','opens_at','payment_timing','price_cents','requires_account','closes_at','slug','spots','sport','starts_on','state','summary','title','waitlist_enabled','waivers']) k), 'exactly the public-safe keys are returned');
select is((select public.get_public_registration('FALL-SEASON-2026') ->> 'slug'), 'fall-season-2026', 'slugs are case-insensitive');
select is((select position('example.test' in public.get_public_registration('fall-season-2026')::text)), 0, 'no registrant emails');
select is((select position('Kidson' in public.get_public_registration('fall-season-2026')::text) + position('Adams' in public.get_public_registration('fall-season-2026')::text)), 0, 'no registrant names');
select is((select position('peanuts' in public.get_public_registration('fall-season-2026')::text)), 0, 'no answers');
select is((select public.get_public_registration('fall-season-2026') ->> 'spots'), 'few', 'only a coarse spots label (2 of 2 spots left is "few")');
select is((select (public.get_public_registration('fall-season-2026') -> 'waivers' -> 0 ->> 'title')), 'Liability', 'waiver titles are listed (not bodies)');
select is((select position('I agree.' in public.get_public_registration('fall-season-2026')::text)), 0, 'waiver text is not in the public payload');
select is((select public.get_public_registration('nope-nope-nope')), null::jsonb, 'an unknown slug returns null');
select is((select public.get_public_registration(repeat('a', 200))), null::jsonb, 'an over-long slug returns null');
select throws_ok($$ select * from public.registration_events $$, '42501', null, 'anonymous still has no table access');
select throws_ok($$ select * from public.registrations $$, '42501', null, 'including registrations');
reset role;
update public.registrations set status = 'accepted' where id in ('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002');
reset role; select set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
select is((select public.get_public_registration('fall-season-2026') ->> 'spots'), 'waitlist', 'a full event with a waitlist says so');
reset role;
update public.registration_events set waitlist_enabled = false where id = 'e1000000-0000-0000-0000-000000000001';
reset role; select set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
select is((select public.get_public_registration('fall-season-2026') ->> 'spots'), 'full', 'a full event without a waitlist says full');
reset role;
insert into public.registration_events (id, team_id, title, slug, status, visibility, form_version_id) values
  ('e6000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-00000000000a', 'Draft', 'draft-public-aa', 'draft', 'public', null),
  ('e7000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-00000000000a', 'Link', 'link-only-aaa', 'open', 'link_only', 'f2000000-0000-0000-0000-000000000001'),
  ('e8000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-00000000000a', 'Members', 'members-only-aa', 'open', 'members_only', 'f2000000-0000-0000-0000-000000000001'),
  ('e9000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-00000000000a', 'Old', 'archived-pub-aa', 'archived', 'public', 'f2000000-0000-0000-0000-000000000001');
reset role; select set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
select is((select public.get_public_registration('draft-public-aa')), null::jsonb, 'drafts are not public');
select is((select public.get_public_registration('archived-pub-aa')), null::jsonb, 'archived events are not public');
select is((select public.get_public_registration('link-only-aaa') ->> 'noindex'), 'true', 'link-only pages are served with noindex');
select is((select public.get_public_registration('fall-season-2026') ->> 'noindex'), 'false', 'public pages are indexable');
select is((select public.get_public_registration('members-only-aa')), null::jsonb, 'members-only pages are hidden from anonymous visitors');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is((select public.get_public_registration('members-only-aa')), null::jsonb, 'and from signed-in outsiders');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select is((select public.get_public_registration('members-only-aa') ->> 'title'), 'Members', 'but visible to team members');

select * from finish();
rollback;
