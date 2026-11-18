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

select lives_ok($$ select private.validate_form_schema('{"fields":[]}') $$, 'an empty form is valid');
select lives_ok($$ select private.validate_form_schema('{"fields":[{"id":"a","type":"single_choice","label":"Pick","options":[{"value":"x","label":"X"}],"sensitive":true}]}') $$, 'a choice field with options is valid');
select throws_ok($$ select private.validate_form_schema(null) $$, '23514', 'invalid_form_schema', 'null is invalid');
select throws_ok($$ select private.validate_form_schema('[]') $$, '23514', 'invalid_form_schema', 'an array is invalid');
select throws_ok($$ select private.validate_form_schema('{"fields":{}}') $$, '23514', 'invalid_form_schema', 'fields must be an array');
select throws_ok($$ select private.validate_form_schema('{"fields":[],"extra":1}') $$, '23514', 'invalid_form_schema', 'unknown top-level keys are rejected');
select throws_ok($$ select private.validate_form_schema('{"fields":[{"id":"A","type":"short_text","label":"x"}]}') $$, '23514', 'invalid_field_id', 'ids are lower snake case');
select throws_ok($$ select private.validate_form_schema('{"fields":[{"id":"a","type":"short_text"}]}') $$, '23514', 'invalid_field_label', 'a label is required');
select throws_ok($$ select private.validate_form_schema('{"fields":[{"id":"a","type":"short_text","label":"x","onclick":"1"}]}') $$, '23514', 'invalid_field', 'unknown field keys are rejected');
select throws_ok($$ select private.validate_form_schema('{"fields":[{"id":"a","type":"short_text","label":"Driver''s license #"}]}') $$, '23514', 'forbidden_field', 'driver''s license is forbidden');
select throws_ok($$ select private.validate_form_schema('{"fields":[{"id":"a","type":"short_text","label":"Name","help":"Enter your passport number"}]}') $$, '23514', 'forbidden_field', 'help text is checked too');
select throws_ok($$ select private.validate_form_schema('{"fields":[{"id":"a","type":"short_text","label":"CVV"}]}') $$, '23514', 'forbidden_field', 'CVV is forbidden');
select lives_ok($$ select private.validate_form_schema('{"fields":[{"id":"a","type":"short_text","label":"Classroom assignment"}]}') $$, 'ordinary labels containing no banned word pass');
select throws_ok($$ select private.validate_form_schema('{"fields":[{"id":"a","type":"dropdown","label":"x","options":[{"value":"1","label":"a"},{"value":"1","label":"b"}]}]}') $$, '23514', 'duplicate_option', 'duplicate option values are rejected');
select throws_ok($$ select private.validate_form_schema((select jsonb_build_object('fields', jsonb_agg(jsonb_build_object('id', 'f' || g, 'type', 'short_text', 'label', 'x'))) from generate_series(1, 61) g)) $$, '23514', 'form_too_large', 'more than 60 fields is rejected');

select * from finish();
rollback;
