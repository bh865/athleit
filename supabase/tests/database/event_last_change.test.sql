-- update_event records last_change (previous time or place); get_event returns it
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
insert into public.event_series (id, team_id, type, weekdays, starts_on, occurrence_count, timezone, local_start_time, duration_minutes) values
  ('5e000000-0000-0000-0000-0000000000a5', 'a1000000-0000-0000-0000-00000000000a', 'practice', array[2], '2027-06-01', 3, 'America/New_York', '17:30', 90);
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone, series_id)
select ('e3000000-0000-0000-0000-00000000000' || n)::uuid, 'a1000000-0000-0000-0000-00000000000a', 'practice', 'Practice', ('2027-06-01 21:30+00'::timestamptz + (n - 1) * interval '7 days'),
       ('2027-06-01 23:00+00'::timestamptz + (n - 1) * interval '7 days'), 'America/New_York', '5e000000-0000-0000-0000-0000000000a5' from generate_series(1, 3) n;
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone, location_text) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'game', 'A game', '2027-07-01 14:00+00', '2027-07-01 16:00+00', 'UTC', 'Field 3');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select last_change from public.get_event('e1000000-0000-0000-0000-000000000001')), null, 'a fresh event has no last_change');
select public.update_event('e1000000-0000-0000-0000-000000000001', 'this', '{"title": "Renamed"}');
select is((select last_change from public.get_event('e1000000-0000-0000-0000-000000000001')), null, 'a title edit leaves it null');
select public.update_event('e1000000-0000-0000-0000-000000000001', 'this', '{"starts_at": "2027-07-01T15:00:00Z", "ends_at": "2027-07-01T17:00:00Z"}');
select is((select last_change ->> 'kind' from public.get_event('e1000000-0000-0000-0000-000000000001')), 'time', 'a time change records kind time');
select is((select (last_change ->> 'prev_starts_at')::timestamptz from public.get_event('e1000000-0000-0000-0000-000000000001')), '2027-07-01 14:00+00'::timestamptz, 'with the previous start');
select is((select (last_change ->> 'prev_ends_at')::timestamptz from public.get_event('e1000000-0000-0000-0000-000000000001')), '2027-07-01 16:00+00'::timestamptz, 'and the previous end');
select is((select (last_change ->> 'revision')::int from public.get_event('e1000000-0000-0000-0000-000000000001')), 2, 'and the revision it produced');
select public.update_event('e1000000-0000-0000-0000-000000000001', 'this', '{"notes": "Bring water"}');
select is((select last_change ->> 'kind' from public.get_event('e1000000-0000-0000-0000-000000000001')), 'time', 'a notes edit leaves the recorded change alone');
select public.update_event('e1000000-0000-0000-0000-000000000001', 'this', '{"location_text": "Field 5"}');
select is((select last_change ->> 'kind' || ':' || (last_change ->> 'prev_place') from public.get_event('e1000000-0000-0000-0000-000000000001')), 'place:Field 3', 'a place change replaces it with the previous place');
select is((select (last_change ->> 'revision')::int from public.get_event('e1000000-0000-0000-0000-000000000001')), 3, 'at the new revision');
select public.update_event('e1000000-0000-0000-0000-000000000001', 'this', '{"location_text": "Field 6", "arrive_early_minutes": 30, "starts_at": "2027-07-01T16:00:00Z", "ends_at": "2027-07-01T18:00:00Z"}');
select is((select last_change ->> 'kind' from public.get_event('e1000000-0000-0000-0000-000000000001')), 'both', 'time and place together record kind both');
select public.update_event('e1000000-0000-0000-0000-000000000001', 'this', '{"arrive_early_minutes": 45}');
select is((select (last_change ->> 'revision')::int from public.get_event('e1000000-0000-0000-0000-000000000001')), 4, 'an arrive-early-only change bumps the revision but keeps the previous time or place note');
select is(public.update_event('e3000000-0000-0000-0000-000000000001', 'all', '{"local_start_time": "18:30"}'), 3, 'a series edit with scope all');
select is((select count(*)::int from public.events where series_id = '5e000000-0000-0000-0000-0000000000a5' and last_change ->> 'kind' = 'time'), 3, 'writes last_change on every occurrence');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select last_change ->> 'kind' from public.get_event('e3000000-0000-0000-0000-000000000002')), 'time', 'a guardian reads it through get_event');
select is((select count(*)::int from public.get_event('e3000000-0000-0000-0000-000000000002') where last_change::text ilike '%Ava%' or last_change::text ilike '%Teen%' or last_change::text ilike '%Ivy%'), 0, 'it never contains a child''s name');
select throws_ok($$ update public.events set last_change = '{}' where id = 'e1000000-0000-0000-0000-000000000001' $$, '42501', null, 'a parent cannot write it directly');
select * from finish();
rollback;
