-- RLS and trigger tests for public.game_results
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
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone, game_format) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'game', 'A game', now() - interval '2 days', now() - interval '2 days' + interval '2 hours', 'America/New_York', null),
  ('e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'A practice', now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 'America/New_York', null),
  ('e2000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', 'game', 'B game', now() - interval '2 days', now() - interval '2 days' + interval '2 hours', 'America/New_York', null);
insert into public.game_results (event_id, our_score, their_score, period_scores) values
  ('e1000000-0000-0000-0000-000000000001', 3, 2, '[{"us":1,"them":0},{"us":2,"them":2}]'),
  ('e2000000-0000-0000-0000-00000000000b', 60, 55, null);
reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.game_results $$, '42501', null, 'anonymous users cannot read results');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.game_results), 1, 'staff read their team''s results only');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select our_score::int from public.game_results where event_id = 'e1000000-0000-0000-0000-000000000001'), 3, 'a rostered parent reads the result');
select is((select count(*)::int from public.game_results), 2, 'a parent reads results for every team her children are on');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.game_results), 1, 'a parent reads only their child''s team''s results');
reset role; select set_config('request.jwt.claims', '{"sub":"a7777777-7777-7777-7777-777777777777","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.game_results), 1, 'a player with a login reads their team''s results');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.game_results), 1, 'a linked club admin reads results');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.game_results where event_id = 'e1000000-0000-0000-0000-000000000001'), 0, 'a parent on team B cannot read team A results');
reset role; select set_config('request.jwt.claims', '{"sub":"a9999999-9999-9999-9999-999999999999","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.game_results), 0, 'a stranger reads nothing');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ insert into public.game_results (event_id, our_score, their_score) values ('e1000000-0000-0000-0000-000000000002', 1, 0) $$, '42501', null, 'staff cannot insert results directly');
select throws_ok($$ update public.game_results set our_score = 9 $$, '42501', null, 'staff cannot update results directly');
select throws_ok($$ delete from public.game_results $$, '42501', null, 'staff cannot delete results directly');
reset role;
select is((select outcome from public.game_results where event_id = 'e1000000-0000-0000-0000-000000000001'), 'win', 'outcome is derived: win');
update public.game_results set our_score = 1, their_score = 4, period_scores = null where event_id = 'e1000000-0000-0000-0000-000000000001';
select is((select outcome from public.game_results where event_id = 'e1000000-0000-0000-0000-000000000001'), 'loss', 'outcome is derived: loss');
update public.game_results set our_score = 2, their_score = 2, period_scores = null where event_id = 'e1000000-0000-0000-0000-000000000001';
select is((select outcome from public.game_results where event_id = 'e1000000-0000-0000-0000-000000000001'), 'tie', 'outcome is derived: tie (soccer allows ties)');
select throws_ok($$ insert into public.game_results (event_id, our_score, their_score) values ('e1000000-0000-0000-0000-000000000002', 1, 0) $$, '23514', 'results_only_for_games', 'results are only for games');
select throws_ok($$ update public.game_results set our_score = 50, their_score = 50 where event_id = 'e2000000-0000-0000-0000-00000000000b' $$, '23514', 'ties_not_allowed', 'basketball does not allow ties');
select throws_ok($$ update public.game_results set our_score = 1000 where event_id = 'e2000000-0000-0000-0000-00000000000b' $$, '23514', null, 'scores are bounded');
select throws_ok($$ update public.game_results set our_score = -1 where event_id = 'e2000000-0000-0000-0000-00000000000b' $$, '23514', null, 'scores cannot be negative');
select throws_ok($$ insert into public.game_results (event_id, our_score, their_score) values ('e1000000-0000-0000-0000-000000000001', 1, 0) $$, '23505', null, 'one result per game');
select * from finish();
rollback;
