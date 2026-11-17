-- public.create_event (single events, recurrence, DST, caps)
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
insert into public.locations (id, team_id, name) values
  ('10c00000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'Field 3'), ('10c00000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', 'Gym');
insert into public.opponents (id, team_id, name) values
  ('10a00000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'Hawks'), ('10a00000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', 'Owls');
reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', now(), now() + interval '1 hour', 'UTC') $$, '42501', null, 'anonymous users cannot create events');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', now(), now() + interval '1 hour', 'UTC') $$, '42501', 'forbidden', 'a parent cannot create events');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', now(), now() + interval '1 hour', 'UTC') $$, '42501', 'forbidden', 'a club admin without a team role cannot create events');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', now(), now() + interval '1 hour', 'UTC') $$, '42501', 'forbidden', 'staff cannot create events for another team');
reset role; select set_config('request.jwt.claims', '{"sub":"a7777777-7777-7777-7777-777777777777","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', now(), now() + interval '1 hour', 'UTC') $$, '42501', 'forbidden', 'a player cannot create events');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'game', ' Game vs Hawks ', '2027-05-01 14:00+00', '2027-05-01 16:00+00', 'America/New_York', '10c00000-0000-0000-0000-00000000000a', null, '10a00000-0000-0000-0000-00000000000a', 'home', 'Bring water', 30, '{"period_count": 2, "period_minutes": 35}') $$, 'staff create a single game');
select is((select title from public.events where starts_at = '2027-05-01 14:00+00'), 'Game vs Hawks', 'the title is trimmed');
select is((select series_id from public.events where starts_at = '2027-05-01 14:00+00'), null, 'a single event has no series');
select is((select revision from public.events where starts_at = '2027-05-01 14:00+00'), 1, 'revision starts at 1');
select is((select created_by from public.events where starts_at = '2027-05-01 14:00+00'), 'a1111111-1111-1111-1111-111111111111'::uuid, 'created_by is the caller');
reset role;
select is((select count(*)::int from public.audit_log where action = 'event.create' and team_id = 'a1000000-0000-0000-0000-00000000000a'), 1, 'event creation is audited');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select occurrences from public.create_event('a1000000-0000-0000-0000-00000000000a', 'event', 'Picnic', '2027-05-02 14:00+00', '2027-05-02 16:00+00', 'UTC')), 1, 'the result reports one occurrence');
select lives_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'Free text place', '2027-05-03 14:00+00', '2027-05-03 15:00+00', 'UTC', null, 'Behind the school') $$, 'a free-text location is accepted');
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', '2027-05-04 14:00+00', '2027-05-04 15:00+00', 'Mars/Olympus') $$, '23514', 'invalid_timezone', 'an invalid IANA timezone is rejected');
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', '2027-05-04 15:00+00', '2027-05-04 14:00+00', 'UTC') $$, '23514', 'ends_before_start', 'ends_at must be after starts_at');
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', '2027-05-04 14:00+00', '2027-05-04 15:00+00', 'UTC', '10c00000-0000-0000-0000-00000000000b') $$, '23514', 'location_wrong_team', 'a location from another team is rejected');
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'game', 'x', '2027-05-04 14:00+00', '2027-05-04 15:00+00', 'UTC', null, null, '10a00000-0000-0000-0000-00000000000b') $$, '23514', 'opponent_wrong_team', 'an opponent from another team is rejected');
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', '2027-05-04 14:00+00', '2027-05-04 15:00+00', 'UTC', null, null, '10a00000-0000-0000-0000-00000000000a') $$, '23514', null, 'an opponent is only allowed on games');
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'concert', 'x', '2027-05-04 14:00+00', '2027-05-04 15:00+00', 'UTC') $$, '23514', null, 'unknown event types are rejected');
-- recurrence: DST. America/New_York springs forward on 2027-03-14; a 17:30 practice must stay 17:30 local.
select is((select occurrences from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'DST practice', '2027-03-02 22:30+00', '2027-03-03 00:00+00', 'America/New_York', null, null, null, null, null, null, null, '{"weekdays": [2], "count": 4}')), 4, 'a weekly series of four is materialized');
select is((select string_agg(to_char(starts_at at time zone 'America/New_York', 'HH24:MI'), ',' order by starts_at) from public.events where title = 'DST practice'), '17:30,17:30,17:30,17:30', 'local wall-clock time stays 17:30 across the DST change');
select is((select string_agg(to_char(starts_at at time zone 'UTC', 'MM-DD HH24:MI'), ',' order by starts_at) from public.events where title = 'DST practice'), '03-02 22:30,03-09 22:30,03-16 21:30,03-23 21:30', 'the UTC instants shift by an hour after the change');
select is((select string_agg(((ends_at - starts_at))::text, ',' order by starts_at) from public.events where title = 'DST practice'), '01:30:00,01:30:00,01:30:00,01:30:00', 'the duration is constant');
select is((select count(distinct series_id)::int from public.events where title = 'DST practice'), 1, 'all occurrences share one series');
select is((select count(*)::int from public.event_series where weekdays = array[2]::smallint[] and starts_on = '2027-03-02'), 1, 'one series row records the rule');
reset role;
select is((select count(*)::int from public.audit_log where action = 'event_series.create' and team_id = 'a1000000-0000-0000-0000-00000000000a'), 1, 'a series is audited once, not per occurrence');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
-- fall back (2027-11-07): 5:30 PM stays 5:30 PM
select is((select occurrences from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'Fall practice', '2027-11-02 21:30+00', '2027-11-02 23:00+00', 'America/New_York', null, null, null, null, null, null, null, '{"weekdays": [2], "count": 3}')), 3, 'a series across the fall-back change');
select is((select string_agg(to_char(starts_at at time zone 'America/New_York', 'HH24:MI'), ',' order by starts_at) from public.events where title = 'Fall practice'), '17:30,17:30,17:30', 'local time is stable across fall-back too');
-- multiple weekdays, intervals, until
select is((select occurrences from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'TT', '2027-06-01 21:30+00', '2027-06-01 23:00+00', 'America/New_York', null, null, null, null, null, null, null, '{"weekdays": [4, 2], "count": 5}')), 5, 'Tuesday/Thursday series of five');
select is((select string_agg(to_char(starts_at at time zone 'America/New_York', 'Dy'), ',' order by starts_at) from public.events where title = 'TT'), 'Tue,Thu,Tue,Thu,Tue', 'weekdays alternate in order');
select is((select occurrences from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'Biweekly', '2027-06-01 21:30+00', '2027-06-01 23:00+00', 'America/New_York', null, null, null, null, null, null, null, '{"weekdays": [2], "interval": 2, "count": 3}')), 3, 'a biweekly series');
select is((select string_agg(to_char(starts_at at time zone 'America/New_York', 'MM-DD'), ',' order by starts_at) from public.events where title = 'Biweekly'), '06-01,06-15,06-29', 'biweekly dates are two weeks apart');
select is((select occurrences from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'Until', '2027-06-01 21:30+00', '2027-06-01 23:00+00', 'America/New_York', null, null, null, null, null, null, null, '{"weekdays": [2], "until": "2027-06-22"}')), 4, 'until is inclusive');
select is((select occurrences from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'Off day', '2027-06-02 21:30+00', '2027-06-02 23:00+00', 'America/New_York', null, null, null, null, null, null, null, '{"weekdays": [2], "count": 2}')), 2, 'a start date that is not on a listed weekday is not itself an occurrence');
select is((select to_char(min(starts_at) at time zone 'America/New_York', 'MM-DD') from public.events where title = 'Off day'), '06-08', 'the first occurrence is the next listed weekday');
-- caps and invalid rules
select is((select occurrences from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'Max', '2027-01-04 22:00+00', '2027-01-04 23:00+00', 'UTC', null, null, null, null, null, null, null, '{"weekdays": [1], "count": 52}')), 52, 'exactly 52 occurrences is allowed');
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'Too many', '2027-01-04 22:00+00', '2027-01-04 23:00+00', 'UTC', null, null, null, null, null, null, null, '{"weekdays": [1], "count": 53}') $$, '23514', 'series_cap_exceeded', 'more than 52 occurrences is rejected, not truncated');
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'Too many', '2027-01-04 22:00+00', '2027-01-04 23:00+00', 'UTC', null, null, null, null, null, null, null, '{"weekdays": [1, 2, 3, 4, 5], "until": "2027-12-01"}') $$, '23514', 'series_cap_exceeded', 'an until rule that yields more than 52 is rejected');
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'Long', '2027-01-04 22:00+00', '2027-01-04 23:00+00', 'UTC', null, null, null, null, null, null, null, '{"weekdays": [1], "until": "2029-01-01"}') $$, '23514', 'series_cap_exceeded', 'a series longer than 366 days is rejected');
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', '2027-01-04 22:00+00', '2027-01-04 23:00+00', 'UTC', null, null, null, null, null, null, null, '{"weekdays": [1], "until": "2027-02-01", "count": 3}') $$, '23514', 'invalid_recurrence', 'until and count together are rejected');
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', '2027-01-04 22:00+00', '2027-01-04 23:00+00', 'UTC', null, null, null, null, null, null, null, '{"weekdays": [1]}') $$, '23514', 'invalid_recurrence', 'a rule needs an end');
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', '2027-01-04 22:00+00', '2027-01-04 23:00+00', 'UTC', null, null, null, null, null, null, null, '{"weekdays": [8], "count": 2}') $$, '23514', 'invalid_recurrence', 'weekdays outside 1-7 are rejected');
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', '2027-01-04 22:00+00', '2027-01-04 23:00+00', 'UTC', null, null, null, null, null, null, null, '{"weekdays": [], "count": 2}') $$, '23514', 'invalid_recurrence', 'empty weekdays are rejected');
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', '2027-01-04 22:00+00', '2027-01-04 23:00+00', 'UTC', null, null, null, null, null, null, null, '{"weekdays": [1], "count": 2, "interval": 9}') $$, '23514', 'invalid_recurrence', 'an interval over 4 weeks is rejected');
select throws_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', '2027-01-04 22:00+00', '2027-01-04 23:00+00', 'UTC', null, null, null, null, null, null, null, '{"weekdays": [1], "count": 2, "freq": "daily"}') $$, '23514', 'invalid_recurrence', 'unknown rule keys are rejected');
select is((select count(*)::int from public.events where title = 'Too many' or title = 'Long'), 0, 'a rejected series leaves nothing behind');
select * from finish();
rollback;
