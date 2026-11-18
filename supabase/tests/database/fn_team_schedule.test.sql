-- public.team_schedule
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
insert into public.locations (id, team_id, name, address, lat, lng, place_id) values ('10c00000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'Field 3', '1 Park Rd', 40.1, -73.9, 'ChIJtest1');
insert into public.opponents (id, team_id, name) values ('10a00000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'Hawks');
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone, location_id, opponent_id, home_away) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'game', 'Past game', now() - interval '3 days', now() - interval '3 days' + interval '2 hours', 'UTC', '10c00000-0000-0000-0000-00000000000a', '10a00000-0000-0000-0000-00000000000a', 'home'),
  ('e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'Soon', now() + interval '1 day', now() + interval '1 day 1 hour', 'UTC', null, null, null),
  ('e1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'Later', now() + interval '5 days', now() + interval '5 days 1 hour', 'UTC', null, null, null),
  ('e2000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', 'practice', 'B practice', now() + interval '2 days', now() + interval '2 days 1 hour', 'UTC', null, null, null);
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone, status, cancelled_reason) values
  ('e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-00000000000a', 'event', 'Cancelled', now() + interval '2 days', now() + interval '2 days 1 hour', 'UTC', 'cancelled', 'Rain');
insert into public.game_results (event_id, our_score, their_score) values ('e1000000-0000-0000-0000-000000000001', 2, 1);
insert into public.rsvps (event_id, player_id, team_id, status) values ('e1000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'going');
reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.team_schedule('a1000000-0000-0000-0000-00000000000a') $$, '42501', null, 'anonymous users cannot read schedules');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select string_agg(title, ',' order by starts_at) from public.team_schedule('a1000000-0000-0000-0000-00000000000a', 'upcoming')), 'Soon,Cancelled,Later', 'upcoming: soonest first, cancelled events stay visible');
select is((select string_agg(title, ',') from public.team_schedule('a1000000-0000-0000-0000-00000000000a', 'past')), 'Past game', 'past events are listed separately');
select is((select location_name || '/' || opponent_name || '/' || our_score || '-' || their_score || '/' || outcome from public.team_schedule('a1000000-0000-0000-0000-00000000000a', 'past')), 'Field 3/Hawks/2-1/win', 'joined location, opponent and result');
select is((select location_lat || '/' || location_lng || '/' || location_place_id from public.team_schedule('a1000000-0000-0000-0000-00000000000a', 'past')), '40.1/-73.9/ChIJtest1', 'the place coordinates and id come through');
select is((select going || '/' || no_reply from public.team_schedule('a1000000-0000-0000-0000-00000000000a', 'upcoming') where title = 'Soon'), '1/2', 'RSVP counts are included');
select is((select cancelled_reason from public.team_schedule('a1000000-0000-0000-0000-00000000000a', 'upcoming') where title = 'Cancelled'), 'Rain', 'the cancelled reason is shown');
select is((select count(*)::int from public.team_schedule('a1000000-0000-0000-0000-00000000000a', 'upcoming', 2, 0)), 2, 'paging: limit');
select is((select title from public.team_schedule('a1000000-0000-0000-0000-00000000000a', 'upcoming', 2, 2)), 'Later', 'paging: offset');
select is_empty($$ select * from public.team_schedule('a2000000-0000-0000-0000-00000000000b', 'upcoming') where team_id = 'a1000000-0000-0000-0000-00000000000a' $$, 'only the requested team''s events are returned');
select throws_ok($$ select * from public.team_schedule('a1000000-0000-0000-0000-00000000000a', 'someday') $$, '23514', 'invalid_when', 'an invalid window is rejected');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.team_schedule('a2000000-0000-0000-0000-00000000000b', 'upcoming')), 0, 'a parent cannot read another team''s schedule');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.team_schedule('a1000000-0000-0000-0000-00000000000a', 'upcoming')), 0, 'a parent on team B reads nothing for team A');
select is((select count(*)::int from public.team_schedule('a2000000-0000-0000-0000-00000000000b', 'upcoming')), 1, 'but reads team B');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.team_schedule('a1000000-0000-0000-0000-00000000000a', 'upcoming')), 3, 'a linked club admin reads the club team''s schedule');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.team_schedule('a1000000-0000-0000-0000-00000000000a', 'past')), 1, 'staff read it too');
reset role; select set_config('request.jwt.claims', '{"sub":"a9999999-9999-9999-9999-999999999999","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.team_schedule('a1000000-0000-0000-0000-00000000000a', 'upcoming')), 0, 'a stranger reads nothing');
select * from finish();
rollback;
