-- RLS and trigger tests for public.events
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
  ('10c00000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'Field 3'),
  ('10c00000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', 'Gym');
insert into public.opponents (id, team_id, name) values
  ('10a00000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'Hawks'),
  ('10a00000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', 'Owls');
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone, location_id) values
  ('e1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'A practice', now() + interval '1 day', now() + interval '1 day 1 hour', 'America/New_York', '10c00000-0000-0000-0000-00000000000a'),
  ('e2000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', 'practice', 'B practice', now() + interval '2 day', now() + interval '2 day 1 hour', 'America/New_York', null);
reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.events $$, '42501', null, 'anonymous users cannot read events');
reset role; select set_config('request.jwt.claims', '{"sub":"a9999999-9999-9999-9999-999999999999","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.events), 0, 'a user with no team reads no events');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select title from public.events), 'A practice', 'staff read only their own team''s events');
select throws_ok($$ insert into public.events (team_id, type, title, starts_at, ends_at, timezone) values ('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', now(), now() + interval '1 hour', 'UTC') $$, '42501', null, 'staff cannot insert events directly (functions only)');
select throws_ok($$ update public.events set title = 'x' where id = 'e1000000-0000-0000-0000-00000000000a' $$, '42501', null, 'staff cannot update events directly');
select throws_ok($$ delete from public.events where id = 'e1000000-0000-0000-0000-00000000000a' $$, '42501', null, 'staff cannot delete events directly');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.events), 2, 'a parent reads events of every team her children are rostered on');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is((select title from public.events), 'A practice', 'a parent reads only the team her child is rostered on');
select is_empty($$ select * from public.events where team_id = 'a2000000-0000-0000-0000-00000000000b' $$, 'a parent cannot read another team''s events');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select is((select title from public.events), 'B practice', 'a parent on team B reads team B events only');
reset role; select set_config('request.jwt.claims', '{"sub":"a7777777-7777-7777-7777-777777777777","role":"authenticated"}', true); set local role authenticated;
select is((select title from public.events), 'A practice', 'a rostered player with a login reads their team''s events');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is((select title from public.events), 'A practice', 'a linked club admin reads the club team''s events');
select throws_ok($$ update public.events set title = 'x' where id = 'e1000000-0000-0000-0000-00000000000a' $$, '42501', null, 'a club admin cannot edit events');
reset role;
-- an inactive roster entry no longer sees the schedule
update public.team_players set status = 'inactive' where id = 'd2000000-0000-0000-0000-000000000002';
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select * from public.events $$, 'a parent whose only child is inactive on the roster reads nothing');
reset role;
-- triggers
select throws_ok($$ insert into public.events (team_id, type, title, starts_at, ends_at, timezone) values ('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', now(), now() + interval '1 hour', 'Mars/Olympus') $$, '23514', 'invalid_timezone', 'an invalid IANA timezone is rejected');
select throws_ok($$ insert into public.events (team_id, type, title, starts_at, ends_at, timezone) values ('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', now(), now(), 'UTC') $$, '23514', null, 'ends_at must be after starts_at');
select throws_ok($$ insert into public.events (team_id, type, title, starts_at, ends_at, timezone, location_id) values ('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', now(), now() + interval '1 hour', 'UTC', '10c00000-0000-0000-0000-00000000000b') $$, '23514', 'location_wrong_team', 'a location from another team is rejected');
select throws_ok($$ insert into public.events (team_id, type, title, starts_at, ends_at, timezone, opponent_id) values ('a1000000-0000-0000-0000-00000000000a', 'game', 'x', now(), now() + interval '1 hour', 'UTC', '10a00000-0000-0000-0000-00000000000b') $$, '23514', 'opponent_wrong_team', 'an opponent from another team is rejected');
select throws_ok($$ insert into public.events (team_id, type, title, starts_at, ends_at, timezone, opponent_id) values ('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', now(), now() + interval '1 hour', 'UTC', '10a00000-0000-0000-0000-00000000000a') $$, '23514', null, 'an opponent is only allowed on games');
select throws_ok($$ insert into public.events (team_id, type, title, starts_at, ends_at, timezone, home_away) values ('a1000000-0000-0000-0000-00000000000a', 'event', 'x', now(), now() + interval '1 hour', 'UTC', 'home') $$, '23514', null, 'home/away is only allowed on games');
select throws_ok($$ insert into public.events (team_id, type, title, starts_at, ends_at, timezone, location_id, location_text) values ('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', now(), now() + interval '1 hour', 'UTC', '10c00000-0000-0000-0000-00000000000a', 'also text') $$, '23514', null, 'a saved location and free text are mutually exclusive');
select throws_ok($$ insert into public.events (team_id, type, title, starts_at, ends_at, timezone, game_format) values ('a1000000-0000-0000-0000-00000000000a', 'game', 'x', now(), now() + interval '1 hour', 'UTC', '{"period_count": 99}') $$, '23514', 'invalid_game_format', 'game_format period_count is bounded');
select throws_ok($$ insert into public.events (team_id, type, title, starts_at, ends_at, timezone, game_format) values ('a1000000-0000-0000-0000-00000000000a', 'game', 'x', now(), now() + interval '1 hour', 'UTC', '{"bogus": 1}') $$, '23514', 'invalid_game_format', 'game_format rejects unknown keys');
select lives_ok($$ insert into public.events (team_id, type, title, starts_at, ends_at, timezone, game_format, opponent_id, home_away) values ('a1000000-0000-0000-0000-00000000000a', 'game', 'ok game', now(), now() + interval '1 hour', 'UTC', '{"period_count": 4, "period_minutes": 10}', '10a00000-0000-0000-0000-00000000000a', 'home') $$, 'a valid game with a format override is accepted');
select throws_ok($$ insert into public.events (team_id, type, title, starts_at, ends_at, timezone, status) values ('a1000000-0000-0000-0000-00000000000a', 'practice', 'x', now(), now() + interval '1 hour', 'UTC', 'cancelled') $$, '23514', null, 'a cancelled event needs a reason');
select throws_ok($$ update public.events set type = 'game' where id = 'e1000000-0000-0000-0000-00000000000a' $$, '23514', 'event_identity_immutable', 'an event''s type cannot change');
select throws_ok($$ update public.events set team_id = 'a2000000-0000-0000-0000-00000000000b', location_id = null where id = 'e1000000-0000-0000-0000-00000000000a' $$, '23514', 'event_identity_immutable', 'an event cannot move teams');
-- revision
select is((select revision from public.events where id = 'e1000000-0000-0000-0000-00000000000a'), 1, 'a new event starts at revision 1');
update public.events set title = 'Renamed', notes = 'bring water' where id = 'e1000000-0000-0000-0000-00000000000a';
select is((select revision from public.events where id = 'e1000000-0000-0000-0000-00000000000a'), 1, 'title and notes edits do not bump the revision');
update public.events set starts_at = starts_at + interval '30 minutes', ends_at = ends_at + interval '30 minutes' where id = 'e1000000-0000-0000-0000-00000000000a';
select is((select revision from public.events where id = 'e1000000-0000-0000-0000-00000000000a'), 2, 'a time change bumps the revision');
update public.events set location_id = null, location_text = 'Behind the school' where id = 'e1000000-0000-0000-0000-00000000000a';
select is((select revision from public.events where id = 'e1000000-0000-0000-0000-00000000000a'), 3, 'a location change bumps the revision');
update public.events set status = 'cancelled', cancelled_reason = 'Rain' where id = 'e1000000-0000-0000-0000-00000000000a';
select is((select revision from public.events where id = 'e1000000-0000-0000-0000-00000000000a'), 4, 'cancelling bumps the revision');
select is((select count(*)::int from public.events where updated_at is null), 0, 'updated_at is maintained');
select * from finish();
rollback;
