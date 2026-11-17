-- public.record_game_result (sport-shaped validation)
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
-- Team V: volleyball (sets), Team H: hockey (periods), both coached by coach.
insert into public.teams (id, name, sport, season_label, join_code) values
  ('b1000000-0000-0000-0000-00000000000a', 'Spikers', 'volleyball', 'Fall', 'TEAMV00003'),
  ('b2000000-0000-0000-0000-00000000000b', 'Icers', 'hockey', 'Fall', 'TEAMH00004');
insert into public.team_memberships (team_id, profile_id, role) values
  ('b1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'coach'), ('b2000000-0000-0000-0000-00000000000b', 'a1111111-1111-1111-1111-111111111111', 'coach');
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone, game_format) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'game', 'Soccer', now() - interval '3 hours', now() - interval '1 hour', 'UTC', null),
  ('e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'Practice', now() - interval '3 hours', now() - interval '1 hour', 'UTC', null),
  ('e1000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-00000000000b', 'game', 'Basketball (coachb)', now() - interval '3 hours', now() - interval '1 hour', 'UTC', null),
  ('e1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-00000000000a', 'game', 'Volleyball', now() - interval '3 hours', now() - interval '1 hour', 'UTC', null),
  ('e1000000-0000-0000-0000-000000000005', 'b2000000-0000-0000-0000-00000000000b', 'game', 'Hockey', now() - interval '3 hours', now() - interval '1 hour', 'UTC', null),
  ('e1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-00000000000a', 'game', 'Future game', now() + interval '2 days', now() + interval '2 days 2 hours', 'UTC', null),
  ('e8000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-00000000000a', 'game', 'Short soccer', now() - interval '3 hours', now() - interval '1 hour', 'UTC', '{"period_count": 4, "period_minutes": 15}'),
  ('e9000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-00000000000a', 'game', 'Cancelled game', now() - interval '3 hours', now() - interval '1 hour', 'UTC', null);
update public.events set status = 'cancelled', cancelled_reason = 'Rain' where id = 'e9000000-0000-0000-0000-000000000009';
reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 1, 0) $$, '42501', null, 'anonymous users cannot record results');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 1, 0) $$, '42501', 'forbidden', 'a parent cannot record a result');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 1, 0) $$, '42501', 'forbidden', 'a club admin cannot record a result');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 1, 0) $$, '42501', 'forbidden', 'staff of another team cannot record a result');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 3, 2, '[{"us":1,"them":0},{"us":2,"them":2}]', 'Great game') $$, 'staff record a soccer result with half scores');
select is((select outcome || ':' || our_score || '-' || their_score from public.game_results where event_id = 'e1000000-0000-0000-0000-000000000001'), 'win:3-2', 'the outcome is derived');
select lives_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 2, 2) $$, 'recording again replaces the result (and a final-score-only result is fine)');
select is((select outcome from public.game_results where event_id = 'e1000000-0000-0000-0000-000000000001'), 'tie', 'soccer allows ties');
select is((select count(*)::int from public.game_results where event_id = 'e1000000-0000-0000-0000-000000000001'), 1, 'still one result per game');
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 3, 2, '[{"us":1,"them":0}]') $$, '23514', 'period_scores_mismatch', 'period scores must add up to the final score');
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 3, 2, '{"us": 3}') $$, '23514', 'invalid_period_scores', 'period scores must be an array');
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 3, 2, '[{"us":3,"them":2,"x":1}]') $$, '23514', 'invalid_period_scores', 'period entries accept only us/them');
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 3, 2, '[{"us":"3","them":2}]') $$, '23514', 'invalid_period_scores', 'period scores must be numbers');
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 0, 0, '[]') $$, '23514', 'invalid_period_scores', 'an empty period list is rejected');
select lives_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 3, 3, '[{"us":1,"them":1},{"us":1,"them":1},{"us":1,"them":1}]') $$, 'extra periods (overtime) are allowed for timed sports');
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 1, 0, '[{"us":1,"them":0},{"us":0,"them":0},{"us":0,"them":0},{"us":0,"them":0},{"us":0,"them":0},{"us":0,"them":0},{"us":0,"them":0},{"us":0,"them":0},{"us":0,"them":0},{"us":0,"them":0},{"us":0,"them":0},{"us":0,"them":0},{"us":0,"them":0}]') $$, '23514', 'invalid_period_scores', 'but not an unbounded number of periods');
select lives_ok($$ select public.record_game_result('e8000000-0000-0000-0000-000000000008', 4, 1, '[{"us":1,"them":0},{"us":1,"them":1},{"us":1,"them":0},{"us":1,"them":0}]') $$, 'a per-game format override (4 periods) is honoured');
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000002', 1, 0) $$, '23514', 'results_only_for_games', 'results are only for games');
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000006', 1, 0) $$, '23514', 'event_not_started', 'a game that has not started has no result yet');
select throws_ok($$ select public.record_game_result('e9000000-0000-0000-0000-000000000009', 1, 0) $$, '23514', 'event_cancelled', 'a cancelled game has no result');
-- basketball: no ties
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000003', 50, 50) $$, '23514', 'ties_not_allowed', 'basketball rejects ties');
select lives_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000003', 51, 50, '[{"us":10,"them":12},{"us":14,"them":10},{"us":12,"them":12},{"us":15,"them":16}]') $$, 'basketball quarters that add up are accepted');
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000003', 51, 50, '[{"us":10,"them":12},{"us":14,"them":10}]') $$, '23514', 'period_scores_mismatch', 'basketball quarters that do not add up are rejected');
-- volleyball: sets won, every set has a winner, best of N
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000004', 2, 1, '[{"us":25,"them":20},{"us":20,"them":25},{"us":15,"them":12}]') $$, 'volleyball: sets won must match the set scores');
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000004', 3, 0, '[{"us":25,"them":20},{"us":20,"them":25},{"us":15,"them":12}]') $$, '23514', 'period_scores_mismatch', 'volleyball: a wrong sets-won total is rejected');
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000004', 1, 1) $$, '23514', 'ties_not_allowed', 'volleyball: a 1-1 match is not a result');
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000004', 1, 0, '[{"us":25,"them":25}]') $$, '23514', 'invalid_period_scores', 'volleyball: a set cannot be tied');
select throws_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000004', 2, 2, '[{"us":25,"them":20},{"us":20,"them":25},{"us":25,"them":20},{"us":20,"them":25}]') $$, '23514', null, 'volleyball: more sets than the format allows is rejected');
-- hockey
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000005', 4, 4, '[{"us":1,"them":2},{"us":2,"them":1},{"us":1,"them":1}]') $$, 'hockey: ties are allowed and periods add up');
reset role;
select is((select count(*)::int from public.audit_log where action = 'game_result.record' and team_id = 'a1000000-0000-0000-0000-00000000000a'), 4, 'successful result entries are audited');
select * from finish();
rollback;
