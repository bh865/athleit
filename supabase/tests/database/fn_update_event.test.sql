-- public.update_event (scopes this / this_and_following / all)
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create function pg_temp.n(q text) returns int language plpgsql as $f$ declare c int; begin execute q; get diagnostics c = row_count; return c; end $f$;

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'coach@example.test'), ('a2222222-2222-2222-2222-222222222222', 'parent.ava@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'parent.ben@example.test'), ('a4444444-4444-4444-4444-444444444444', 'parent.other@example.test'),
  ('a5555555-5555-5555-5555-555555555555', 'clubadmin@example.test'), ('a6666666-6666-6666-6666-666666666666', 'coach.b@example.test'),
  ('a7777777-7777-7777-7777-777777777777', 'teen@example.test'), ('a8888888-8888-8888-8888-888888888888', 'admin@example.test'),
  ('a9999999-9999-9999-9999-999999999999', 'loner@example.test');
update public.profiles set display_name = 'Pat Ava' where id = 'a2222222-2222-2222-2222-222222222222';
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
insert into public.club_memberships (club_id, profile_id, role) values ('c1000000-0000-0000-0000-000000000001', 'a5555555-5555-5555-5555-555555555555', 'admin');
-- Team A (club-linked, soccer): admin, coach, parents Ava/Ben, player Teen. Team B (basketball): coach B, parent Other.
insert into public.teams (id, name, sport, season_label, club_id, join_code) values
  ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall 2026', 'c1000000-0000-0000-0000-000000000001', 'TEAMA00001'),
  ('a2000000-0000-0000-0000-00000000000b', 'Team B', 'basketball', 'Fall 2026', null, 'TEAMB00002');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a8888888-8888-8888-8888-888888888888', 'admin'),
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'coach'),
  ('a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', 'parent'),
  ('a1000000-0000-0000-0000-00000000000a', 'a3333333-3333-3333-3333-333333333333', 'parent'),
  ('a2000000-0000-0000-0000-00000000000b', 'a6666666-6666-6666-6666-666666666666', 'coach'),
  ('a2000000-0000-0000-0000-00000000000b', 'a4444444-4444-4444-4444-444444444444', 'parent');
insert into public.households (id, name) values
  ('11000000-0000-0000-0000-000000000001', 'Ava fam'), ('22000000-0000-0000-0000-000000000002', 'Ben fam'), ('33000000-0000-0000-0000-000000000003', 'Other fam');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222'),
  ('22000000-0000-0000-0000-000000000002', 'a3333333-3333-3333-3333-333333333333'),
  ('33000000-0000-0000-0000-000000000003', 'a4444444-4444-4444-4444-444444444444');
insert into public.players (id, household_id, first_name, last_name, date_of_birth, profile_id) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '10 years', null),
  ('92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'Ben', 'Brown', current_date - interval '9 years', null),
  ('93000000-0000-0000-0000-000000000003', '33000000-0000-0000-0000-000000000003', 'Cleo', 'Clark', current_date - interval '11 years', null),
  ('94000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000001', 'Teen', 'Adams', current_date - interval '15 years', 'a7777777-7777-7777-7777-777777777777'),
  ('95000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000001', 'Ivy', 'Adams', current_date - interval '8 years', null),
  ('96000000-0000-0000-0000-000000000006', '22000000-0000-0000-0000-000000000002', 'Dan', 'Brown', current_date - interval '9 years', null);
insert into public.team_memberships (team_id, profile_id, role) values ('a1000000-0000-0000-0000-00000000000a', 'a7777777-7777-7777-7777-777777777777', 'player');
-- Active on A: Ava, Ben, Teen. Inactive on A: Dan. Active on B: Cleo, Ivy (Ava's second team).
insert into public.team_players (id, team_id, player_id, jersey_number, status) values
  ('d1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001', 7, 'active'),
  ('d2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-000000000002', 10, 'active'),
  ('d4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-00000000000a', '94000000-0000-0000-0000-000000000004', 4, 'active'),
  ('d6000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-00000000000a', '96000000-0000-0000-0000-000000000006', 9, 'inactive'),
  ('d3000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-00000000000b', '93000000-0000-0000-0000-000000000003', 7, 'active'),
  ('d5000000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-00000000000b', '95000000-0000-0000-0000-000000000005', 8, 'active');

reset role;
insert into public.opponents (id, team_id, name) values ('10a00000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'Hawks');
insert into public.event_series (id, team_id, type, weekdays, starts_on, occurrence_count, timezone, local_start_time, duration_minutes) values
  ('5e000000-0000-0000-0000-0000000000a5', 'a1000000-0000-0000-0000-00000000000a', 'practice', array[2], '2027-06-01', 6, 'America/New_York', '17:30', 90);
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone, series_id)
select ('e1000000-0000-0000-0000-00000000000' || n)::uuid, 'a1000000-0000-0000-0000-00000000000a', 'practice', 'Practice', ('2027-06-01 21:30+00'::timestamptz + (n - 1) * interval '7 days'),
       ('2027-06-01 23:00+00'::timestamptz + (n - 1) * interval '7 days'), 'America/New_York', '5e000000-0000-0000-0000-0000000000a5' from generate_series(1, 6) n;
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone) values
  ('e2000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', 'practice', 'B practice', '2027-06-02 21:30+00', '2027-06-02 23:00+00', 'America/New_York');
reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.update_event('e1000000-0000-0000-0000-000000000001', 'this', '{"title": "x"}') $$, '42501', null, 'anonymous users cannot update events');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.update_event('e1000000-0000-0000-0000-000000000001', 'this', '{"title": "x"}') $$, '42501', 'forbidden', 'a parent cannot update events');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.update_event('e1000000-0000-0000-0000-000000000001', 'this', '{"title": "x"}') $$, '42501', 'forbidden', 'a club admin cannot update events');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.update_event('e1000000-0000-0000-0000-000000000001', 'this', '{"title": "x"}') $$, '42501', 'forbidden', 'staff of another team cannot update events');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.update_event('e2000000-0000-0000-0000-00000000000b', 'this', '{"title": "x"}') $$, '42501', 'forbidden', 'staff cannot update another team''s event');
select throws_ok($$ select public.update_event('e1000000-0000-0000-0000-000000000001', 'sometimes', '{"title": "x"}') $$, '23514', 'invalid_scope', 'an unknown scope is rejected');
select throws_ok($$ select public.update_event('e1000000-0000-0000-0000-000000000001', 'this', '{}') $$, '23514', 'invalid_patch', 'an empty patch is rejected');
select throws_ok($$ select public.update_event('e1000000-0000-0000-0000-000000000001', 'this', '{"team_id": "a2000000-0000-0000-0000-00000000000b"}') $$, '23514', 'invalid_patch', 'fields outside the whitelist (team_id) are rejected');
select throws_ok($$ select public.update_event('e1000000-0000-0000-0000-000000000001', 'all', '{"starts_at": "2027-06-01T10:00:00Z"}') $$, '23514', 'invalid_patch', 'absolute times cannot be applied across a series');
-- scope: this
select is(public.update_event('e1000000-0000-0000-0000-000000000003', 'this', '{"title": "Only this", "notes": "n"}'), 1, 'scope this changes exactly one event');
select is((select string_agg(title, ',' order by starts_at) from public.events where series_id = '5e000000-0000-0000-0000-0000000000a5'), 'Practice,Practice,Only this,Practice,Practice,Practice', 'only the targeted occurrence was renamed');
select is((select revision from public.events where id = 'e1000000-0000-0000-0000-000000000003'), 1, 'a title/notes change does not bump the revision');
-- scope: this_and_following
select is(public.update_event('e1000000-0000-0000-0000-000000000004', 'this_and_following', '{"location_text": "Field 9"}'), 3, 'this_and_following changes the event and the later ones');
select is((select string_agg(coalesce(location_text, '-'), ',' order by starts_at) from public.events where series_id = '5e000000-0000-0000-0000-0000000000a5'), '-,-,-,Field 9,Field 9,Field 9', 'earlier occurrences are untouched');
select is((select string_agg(revision::text, ',' order by starts_at) from public.events where series_id = '5e000000-0000-0000-0000-0000000000a5'), '1,1,1,2,2,2', 'a location change bumps revision on exactly the changed rows');
-- scope: all (local time change, DST-safe)
select is(public.update_event('e1000000-0000-0000-0000-000000000001', 'all', '{"local_start_time": "18:00"}'), 6, 'scope all changes every scheduled occurrence');
select is((select string_agg(to_char(starts_at at time zone 'America/New_York', 'HH24:MI'), ',' order by starts_at) from public.events where series_id = '5e000000-0000-0000-0000-0000000000a5'), '18:00,18:00,18:00,18:00,18:00,18:00', 'every occurrence moved to 6:00 PM local');
select is((select string_agg(((ends_at - starts_at))::text, ',') from (select * from public.events where series_id = '5e000000-0000-0000-0000-0000000000a5' order by starts_at limit 2) x), '01:30:00,01:30:00', 'the duration is preserved when only the start moves');
select is((select string_agg(revision::text, ',' order by starts_at) from public.events where series_id = '5e000000-0000-0000-0000-0000000000a5'), '2,2,2,3,3,3', 'a time change bumps revision');
select is(public.update_event('e1000000-0000-0000-0000-000000000002', 'all', '{"duration_minutes": 60}'), 6, 'a duration change applies to all');
select is((select string_agg(((ends_at - starts_at))::text, ',') from (select * from public.events where series_id = '5e000000-0000-0000-0000-0000000000a5' order by starts_at limit 2) x), '01:00:00,01:00:00', 'durations updated');
-- a single occurrence can move on its own
select is(public.update_event('e1000000-0000-0000-0000-000000000005', 'this', '{"starts_at": "2027-07-06T20:00:00Z"}'), 1, 'one occurrence can be moved to an exact time');
select is((select (ends_at - starts_at)::text from public.events where id = 'e1000000-0000-0000-0000-000000000005'), '01:00:00', 'moving the start keeps the duration');
select is((select count(*)::int from public.events where series_id = '5e000000-0000-0000-0000-0000000000a5' and starts_at = '2027-07-06T20:00:00Z'), 1, 'and only that one moved');
-- clearing and changing fields
select lives_ok($$ select public.update_event('e1000000-0000-0000-0000-000000000001', 'this', '{"notes": null, "arrive_early_minutes": 15}') $$, 'a JSON null clears a nullable field');
select is((select arrive_early_minutes::int from public.events where id = 'e1000000-0000-0000-0000-000000000001'), 15, 'arrive_early_minutes is set');
select throws_ok($$ select public.update_event('e1000000-0000-0000-0000-000000000001', 'this', '{"opponent_id": "10a00000-0000-0000-0000-00000000000a"}') $$, '23514', null, 'an opponent cannot be set on a practice');
select throws_ok($$ select public.update_event('e1000000-0000-0000-0000-000000000001', 'this', '{"timezone": "Nope/Zone"}') $$, '23514', 'invalid_timezone', 'an invalid timezone is rejected');
reset role;
select is((select count(*)::int from public.audit_log where action = 'event.update' and team_id = 'a1000000-0000-0000-0000-00000000000a'), 6, 'each successful update call writes one audit row');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
-- non-series event ignores scope; cancelled events cannot be edited
reset role;
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone) values
  ('e9000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-00000000000a', 'event', 'Solo', '2027-06-20 14:00+00', '2027-06-20 15:00+00', 'UTC');
update public.events set status = 'cancelled', cancelled_reason = 'Rain' where id = 'e1000000-0000-0000-0000-000000000006';
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is(public.update_event('e9000000-0000-0000-0000-000000000009', 'all', '{"title": "Solo renamed"}'), 1, 'a non-series event is always just itself');
select throws_ok($$ select public.update_event('e1000000-0000-0000-0000-000000000006', 'this', '{"title": "x"}') $$, '23514', 'event_cancelled', 'a cancelled event cannot be edited');
select is(public.update_event('e1000000-0000-0000-0000-000000000001', 'all', '{"title": "Renamed"}'), 5, 'cancelled occurrences are skipped by series scopes');
select is((select title from public.events where id = 'e1000000-0000-0000-0000-000000000006'), 'Practice', 'the cancelled occurrence kept its title');
select * from finish();
rollback;
