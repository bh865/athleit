-- public.cancel_event
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
  ('5e000000-0000-0000-0000-0000000000a5', 'a1000000-0000-0000-0000-00000000000a', 'practice', array[2], '2027-06-01', 6, 'America/New_York', '17:30', 90);
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone, series_id)
select ('e1000000-0000-0000-0000-00000000000' || n)::uuid, 'a1000000-0000-0000-0000-00000000000a', 'practice', 'Practice', ('2027-06-01 21:30+00'::timestamptz + (n - 1) * interval '7 days'),
       ('2027-06-01 23:00+00'::timestamptz + (n - 1) * interval '7 days'), 'America/New_York', '5e000000-0000-0000-0000-0000000000a5' from generate_series(1, 6) n;
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone) values
  ('e2000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', 'practice', 'B practice', '2027-06-02 21:30+00', '2027-06-02 23:00+00', 'America/New_York'),
  ('e7000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-00000000000a', 'game', 'Played game', now() - interval '3 hours', now() - interval '1 hour', 'UTC');
insert into public.game_results (event_id, our_score, their_score) values ('e7000000-0000-0000-0000-000000000007', 2, 1);
reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.cancel_event('e1000000-0000-0000-0000-000000000001', 'this', 'Rain') $$, '42501', null, 'anonymous users cannot cancel events');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.cancel_event('e1000000-0000-0000-0000-000000000001', 'this', 'Rain') $$, '42501', 'forbidden', 'a parent cannot cancel events');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.cancel_event('e1000000-0000-0000-0000-000000000001', 'this', 'Rain') $$, '42501', 'forbidden', 'a club admin cannot cancel events');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.cancel_event('e1000000-0000-0000-0000-000000000001', 'this', 'Rain') $$, '42501', 'forbidden', 'staff of another team cannot cancel');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.cancel_event('e1000000-0000-0000-0000-000000000001', 'this', '   ') $$, '23514', 'reason_required', 'a reason is required');
select throws_ok($$ select public.cancel_event('e1000000-0000-0000-0000-000000000001', 'whenever', 'Rain') $$, '23514', 'invalid_scope', 'an invalid scope is rejected');
select is(public.cancel_event('e1000000-0000-0000-0000-000000000002', 'this', 'Rain'), 1, 'scope this cancels one occurrence');
select is((select status || ':' || cancelled_reason from public.events where id = 'e1000000-0000-0000-0000-000000000002'), 'cancelled:Rain', 'status and reason are stored');
select is((select revision from public.events where id = 'e1000000-0000-0000-0000-000000000002'), 2, 'cancelling bumps the revision');
select is((select count(*)::int from public.events where series_id = '5e000000-0000-0000-0000-0000000000a5' and status = 'scheduled'), 5, 'the others are unaffected');
select throws_ok($$ select public.cancel_event('e1000000-0000-0000-0000-000000000002', 'this', 'Again') $$, '23514', 'already_cancelled', 'cancelling twice is rejected');
select is(public.cancel_event('e1000000-0000-0000-0000-000000000004', 'this_and_following', 'Field closed'), 3, 'this_and_following cancels the event and later ones');
select is((select string_agg(status, ',' order by starts_at) from public.events where series_id = '5e000000-0000-0000-0000-0000000000a5'), 'scheduled,cancelled,scheduled,cancelled,cancelled,cancelled', 'exactly the right rows are cancelled');
select is(public.cancel_event('e1000000-0000-0000-0000-000000000001', 'all', 'Season over'), 2, 'all cancels the remaining scheduled occurrences only');
select is((select count(*)::int from public.events where series_id = '5e000000-0000-0000-0000-0000000000a5' and status = 'cancelled'), 6, 'now all six are cancelled');
select is((select cancelled_reason from public.events where id = 'e1000000-0000-0000-0000-000000000002'), 'Rain', 'earlier cancellation reasons are preserved');
select throws_ok($$ select public.cancel_event('e7000000-0000-0000-0000-000000000007', 'this', 'Oops') $$, '23514', 'event_has_result', 'a game with a result cannot be cancelled');
reset role;
select is((select count(*)::int from public.audit_log where action = 'event.cancel' and team_id = 'a1000000-0000-0000-0000-00000000000a'), 3, 'each cancellation is audited');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.events where series_id = '5e000000-0000-0000-0000-0000000000a5'), 6, 'cancelled events stay in the schedule');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.events where status = 'cancelled' and series_id = '5e000000-0000-0000-0000-0000000000a5'), 6, 'parents still see cancelled events');
select * from finish();
rollback;
