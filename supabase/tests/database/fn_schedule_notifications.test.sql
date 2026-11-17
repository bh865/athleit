-- private.notify_schedule via create/update/cancel/record: recipients, batching, silence rules
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
-- Devices so push rows exist; Loner is guardian of a child who is INACTIVE on team A.
insert into public.push_devices (profile_id, platform, token) values
  ('a8888888-8888-8888-8888-888888888888', 'ios', 'ExponentPushToken[admin00001]'), ('a2222222-2222-2222-2222-222222222222', 'ios', 'ExponentPushToken[ava0000001]'),
  ('a3333333-3333-3333-3333-333333333333', 'ios', 'ExponentPushToken[ben0000001]'), ('a7777777-7777-7777-7777-777777777777', 'ios', 'ExponentPushToken[teen000001]'),
  ('a1111111-1111-1111-1111-111111111111', 'ios', 'ExponentPushToken[coach00001]'), ('a5555555-5555-5555-5555-555555555555', 'ios', 'ExponentPushToken[club000001]'),
  ('a4444444-4444-4444-4444-444444444444', 'ios', 'ExponentPushToken[other00001]'), ('a9999999-9999-9999-9999-999999999999', 'ios', 'ExponentPushToken[loner00001]');
insert into public.households (id, name) values ('44000000-0000-0000-0000-000000000004', 'Loner fam');
insert into public.household_members (household_id, profile_id) values ('44000000-0000-0000-0000-000000000004', 'a9999999-9999-9999-9999-999999999999');
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('97000000-0000-0000-0000-000000000007', '44000000-0000-0000-0000-000000000004', 'Lou', 'Lone', current_date - interval '9 years');
insert into public.team_players (team_id, player_id, status) values ('a1000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-000000000007', 'inactive');
-- Ben has turned schedule notifications off (push and email).
update public.notification_preferences set enabled = false where profile_id = 'a3333333-3333-3333-3333-333333333333' and category = 'schedule';
delete from public.notification_outbox; -- start from a clean outbox whatever else the project holds
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select occurrences from public.create_event('a1000000-0000-0000-0000-00000000000a', 'practice', 'Skills', '2027-06-01 21:30+00', '2027-06-01 23:00+00', 'America/New_York', null, null, null, null, null, null, null, '{"weekdays": [2], "count": 12}')), 12, 'a 12-practice series is created');
reset role;
select is((select count(*)::int from public.notification_outbox where category = 'schedule' and channel = 'in_app'), 4, 'ONE in-app notification per recipient for the whole series (not 12)');
select is((select string_agg(profile_id::text, ',' order by profile_id::text) from public.notification_outbox where category = 'schedule' and channel = 'in_app'), 'a2222222-2222-2222-2222-222222222222,a3333333-3333-3333-3333-333333333333,a7777777-7777-7777-7777-777777777777,a8888888-8888-8888-8888-888888888888', 'recipients: guardians of active players, the 13+ player, other staff');
select is((select count(*)::int from public.notification_outbox where category = 'schedule' and profile_id = 'a1111111-1111-1111-1111-111111111111'), 0, 'the editor gets nothing');
select is((select count(*)::int from public.notification_outbox where category = 'schedule' and profile_id in ('a5555555-5555-5555-5555-555555555555', 'a4444444-4444-4444-4444-444444444444', 'a9999999-9999-9999-9999-999999999999')), 0, 'club admins, other teams'' parents and guardians of inactive players get nothing');
select is((select count(*)::int from public.notification_outbox where category = 'schedule' and channel = 'push'), 3, 'one push per recipient with a device and push on');
select is((select count(*)::int from public.notification_outbox where category = 'schedule' and profile_id = 'a3333333-3333-3333-3333-333333333333' and channel in ('push', 'email')), 0, 'a user who turned schedule notifications off gets no push or email');
select is((select count(*)::int from public.notification_outbox where category = 'schedule' and profile_id = 'a3333333-3333-3333-3333-333333333333' and channel = 'in_app'), 1, 'but keeps the in-app feed row (as for messages)');
select is((select payload ->> 'body' from public.notification_outbox where category = 'schedule' and channel = 'push' limit 1), '12 practices added', 'the push says "12 practices added"');
select is((select (payload ->> 'count')::int from public.notification_outbox where category = 'schedule' and channel = 'push' limit 1), 12, 'and carries the count');
select is((select count(distinct dedupe_key)::int from public.notification_outbox where category = 'schedule'), (select count(*)::int from public.notification_outbox where category = 'schedule'), 'every row has its own dedupe key');
select is((select payload ->> 'event_id' from public.notification_outbox where category = 'schedule' and channel = 'push' limit 1), (select id::text from public.events where title = 'Skills' order by starts_at limit 1), 'the deep link is the first event of the series');
-- a single event
delete from public.notification_outbox;
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'game', 'Game vs. Hawks', '2027-07-10 14:00+00', '2027-07-10 16:00+00', 'America/New_York') $$, 'a single game is created');
reset role;
select is((select count(*)::int from public.notification_outbox where channel = 'in_app'), 4, 'one notification per recipient');
select is((select payload ->> 'body' from public.notification_outbox where channel = 'push' limit 1), 'New game: Sat, Jul 10 · 10:00 AM', 'the body names the local time');
-- title / notes edits are silent
delete from public.notification_outbox;
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.update_event((select id from public.events where title = 'Game vs. Hawks'), 'this', '{"title": "Game vs. Hawks (home)", "notes": "bring water"}') $$, 'a title and notes edit');
reset role;
select is((select count(*)::int from public.notification_outbox), 0, 'edits that do not bump the revision send nothing');
-- time change on one event
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.update_event((select id from public.events where title like 'Game vs. Hawks%'), 'this', '{"starts_at": "2027-07-10T15:00:00Z", "ends_at": "2027-07-10T17:00:00Z"}') $$, 'move the game an hour');
reset role;
select is((select count(*)::int from public.notification_outbox where channel = 'in_app'), 4, 'one "time changed" per recipient');
select is((select payload ->> 'change' || '/' || (payload ->> 'body') from public.notification_outbox where channel = 'push' limit 1), 'time_changed/Time changed: Sat, Jul 10 · 11:00 AM', 'with the new time');
-- a whole-series time change is ONE notification
delete from public.notification_outbox;
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is(public.update_event((select id from public.events where title = 'Skills' order by starts_at limit 1), 'all', '{"local_start_time": "18:00"}'), 12, 'move all 12 practices to 6 PM');
reset role;
select is((select count(*)::int from public.notification_outbox where channel = 'in_app'), 4, 'one notification per recipient, not 12');
select is((select payload ->> 'body' from public.notification_outbox where channel = 'push' limit 1), '12 practices rescheduled', 'summarised as "12 practices rescheduled"');
-- location only, and both
delete from public.notification_outbox;
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.update_event((select id from public.events where title like 'Game vs. Hawks%'), 'this', '{"location_text": "Field 9"}') $$, 'change the place');
reset role;
select is((select payload ->> 'change' from public.notification_outbox where channel = 'push' limit 1), 'location_changed', 'a place change is "location_changed"');
delete from public.notification_outbox;
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.update_event((select id from public.events where title like 'Game vs. Hawks%'), 'this', '{"location_text": "Field 2", "starts_at": "2027-07-10T16:00:00Z", "ends_at": "2027-07-10T18:00:00Z"}') $$, 'change time and place together');
reset role;
select is((select count(*)::int from public.notification_outbox where channel = 'in_app'), 4, 'together they still make one notification');
select matches((select payload ->> 'body' from public.notification_outbox where channel = 'push' limit 1), '^Time and place changed', 'saying both changed');
-- cancel
delete from public.notification_outbox;
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is(public.cancel_event((select id from public.events where title = 'Skills' order by starts_at offset 2 limit 1), 'this_and_following', 'Field closed'), 10, 'cancel this and following (10)');
reset role;
select is((select count(*)::int from public.notification_outbox where channel = 'in_app'), 4, 'one cancellation notification per recipient');
select is((select payload ->> 'body' from public.notification_outbox where channel = 'push' limit 1), '10 practices cancelled', 'summarised');
delete from public.notification_outbox;
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is(public.cancel_event((select id from public.events where title like 'Game vs. Hawks%'), 'this', 'Rain'), 1, 'cancel one game');
reset role;
select is((select payload ->> 'body' from public.notification_outbox where channel = 'push' limit 1), 'Cancelled: Rain', 'a single cancellation carries the reason');
-- result
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'game', 'Played game', now() - interval '3 hours', now() - interval '1 hour', 'UTC');
delete from public.notification_outbox;
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 3, 2) $$, 'enter a result');
reset role;
select is((select payload ->> 'body' from public.notification_outbox where channel = 'push' limit 1), 'Final score 3–2', 'the result is posted');
select is((select count(*)::int from public.notification_outbox where channel = 'in_app'), 4, 'to every recipient but the editor');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 3, 2, null, 'same score again') $$, 're-saving the same score');
reset role;
select is((select count(*)::int from public.notification_outbox where channel = 'in_app'), 4, 'does not notify twice');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.record_game_result('e1000000-0000-0000-0000-000000000001', 3, 3) $$, 'correcting the score');
reset role;
select is((select count(*)::int from public.notification_outbox where channel = 'in_app'), 8, 'does notify again');
-- the other staff member editing: the coach is a recipient, the admin is not
delete from public.notification_outbox;
reset role; select set_config('request.jwt.claims', '{"sub":"a8888888-8888-8888-8888-888888888888","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select * from public.create_event('a1000000-0000-0000-0000-00000000000a', 'event', 'Picnic', '2027-08-01 14:00+00', '2027-08-01 16:00+00', 'UTC') $$, 'another staff member creates an event');
reset role;
select is((select count(*)::int from public.notification_outbox where category = 'schedule' and profile_id = 'a8888888-8888-8888-8888-888888888888'), 0, 'the editor is excluded whoever they are');
select is((select count(*)::int from public.notification_outbox where category = 'schedule' and channel = 'in_app' and profile_id = 'a1111111-1111-1111-1111-111111111111'), 1, 'and the coach is told');
select * from finish();
rollback;
