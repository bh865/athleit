-- public.calendar_feed_events (service role only)
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
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone, location_id) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'A soon', now() + interval '2 days', now() + interval '2 days 1 hour', 'America/New_York', '10c00000-0000-0000-0000-00000000000a'),
  ('e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 'game', 'A last week', now() - interval '7 days', now() - interval '7 days' + interval '2 hours', 'UTC', null),
  ('e1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'A too old', now() - interval '60 days', now() - interval '60 days' + interval '1 hour', 'UTC', null),
  ('e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'A far future', now() + interval '400 days', now() + interval '400 days' + interval '1 hour', 'UTC', null),
  ('e1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-00000000000a', 'event', 'A cancelled', now() + interval '3 days', now() + interval '3 days 1 hour', 'UTC', null),
  ('e2000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', 'practice', 'B practice', now() + interval '2 days', now() + interval '2 days 1 hour', 'UTC', null);
update public.events set status = 'cancelled', cancelled_reason = 'Rain' where id = 'e1000000-0000-0000-0000-000000000005';
-- Not callable by clients.
reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.calendar_feed_events('a2222222-2222-2222-2222-222222222222') $$, '42501', null, 'anonymous users cannot call it');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select * from public.calendar_feed_events('a2222222-2222-2222-2222-222222222222') $$, '42501', null, 'a signed-in user cannot call it, not even for themselves');
reset role;
set local role service_role;
select is((select string_agg(title, ',' order by starts_at, title) from public.calendar_feed_events('a1111111-1111-1111-1111-111111111111')), 'A last week,A soon,A cancelled', 'staff: their team''s events in the window (30 days back to 365 ahead), cancelled included');
select is((select string_agg(title, ',' order by starts_at, title) from public.calendar_feed_events('a2222222-2222-2222-2222-222222222222')), 'A last week,A soon,B practice,A cancelled', 'a guardian: every team a child is on (Ava on A, Ivy on B)');
select is((select string_agg(title, ',' order by starts_at, title) from public.calendar_feed_events('a3333333-3333-3333-3333-333333333333')), 'A last week,A soon,A cancelled', 'another family: only their child''s team');
select is((select string_agg(title, ',' order by starts_at, title) from public.calendar_feed_events('a7777777-7777-7777-7777-777777777777')), 'A last week,A soon,A cancelled', 'a 13+ player with a login: their team');
select is((select count(*)::int from public.calendar_feed_events('a4444444-4444-4444-4444-444444444444') where title like 'A %'), 0, 'a parent on another team gets none of team A');
select is((select count(*)::int from public.calendar_feed_events('a5555555-5555-5555-5555-555555555555')), 0, 'a club admin with no team role gets nothing');
select is((select count(*)::int from public.calendar_feed_events('a9999999-9999-9999-9999-999999999999')), 0, 'a stranger gets nothing');
select is((select location_name || '/' || location_address || '/' || team_name from public.calendar_feed_events('a1111111-1111-1111-1111-111111111111') where title = 'A soon'), 'Field 3/1 Park Rd/Team A', 'location and team name are joined in');
select is((select status || '/' || cancelled_reason from public.calendar_feed_events('a1111111-1111-1111-1111-111111111111') where title = 'A cancelled'), 'cancelled/Rain', 'cancelled events carry the reason');
select is((select count(*)::int from information_schema.columns where table_name = 'calendar_feed_events'), 0, 'the output has no table columns');
select is((select string_agg(a, ',') from (select unnest(proargnames) a from pg_proc where proname = 'calendar_feed_events') x), 'p_profile_id,id,team_name,type,title,starts_at,ends_at,timezone,location_name,location_address,location_lat,location_lng,location_place_id,location_text,opponent_name,home_away,notes,arrive_early_minutes,status,cancelled_reason,revision,updated_at', 'it returns no RSVP data and no player names');
reset role;
update public.team_players set status = 'inactive' where id = 'd2000000-0000-0000-0000-000000000002';
set local role service_role;
select is((select count(*)::int from public.calendar_feed_events('a3333333-3333-3333-3333-333333333333')), 0, 'a family whose child is inactive on the roster gets nothing');
select is((select location_lat || '/' || location_lng || '/' || location_place_id from public.calendar_feed_events('a1111111-1111-1111-1111-111111111111') where title = 'A soon'), '40.1/-73.9/ChIJtest1', 'the feed carries coordinates and place id for GEO');
select * from finish();
rollback;
