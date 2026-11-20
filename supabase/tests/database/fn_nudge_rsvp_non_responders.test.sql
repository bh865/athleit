-- public.nudge_rsvp_non_responders
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
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'game', 'A game', now() + interval '1 day', now() + interval '1 day 2 hours', 'UTC'),
  ('e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'Cancelled', now() + interval '2 days', now() + interval '2 days 1 hour', 'UTC'),
  ('e1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'Over', now() - interval '3 hours', now() - interval '2 hours', 'UTC'),
  ('e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'Everyone replied', now() + interval '3 days', now() + interval '3 days 1 hour', 'UTC'),
  ('e2000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', 'game', 'B game', now() + interval '1 day', now() + interval '1 day 2 hours', 'UTC');
update public.events set status = 'cancelled', cancelled_reason = 'Rain' where id = 'e1000000-0000-0000-0000-000000000002';
-- Event 1: Ava replied; Ben and Teen did not. Event 4: all three active players replied.
insert into public.rsvps (event_id, player_id, team_id, status) values
  ('e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'going'),
  ('e1000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'going'),
  ('e1000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 'going'),
  ('e1000000-0000-0000-0000-000000000004', '94000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-00000000000a', 'maybe');
delete from public.notification_outbox;
reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.nudge_rsvp_non_responders('e1000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous users cannot nudge');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.nudge_rsvp_non_responders('e1000000-0000-0000-0000-000000000001') $$, '42501', 'forbidden', 'a parent cannot nudge');
reset role; select set_config('request.jwt.claims', '{"sub":"a7777777-7777-7777-7777-777777777777","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.nudge_rsvp_non_responders('e1000000-0000-0000-0000-000000000001') $$, '42501', 'forbidden', 'a 13+ player cannot nudge');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.nudge_rsvp_non_responders('e1000000-0000-0000-0000-000000000001') $$, '42501', 'forbidden', 'a club admin cannot nudge');
reset role; select set_config('request.jwt.claims', '{"sub":"a9999999-9999-9999-9999-999999999999","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.nudge_rsvp_non_responders('e1000000-0000-0000-0000-000000000001') $$, '42501', 'forbidden', 'a stranger cannot nudge');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.nudge_rsvp_non_responders('e1000000-0000-0000-0000-000000000001') $$, '42501', 'forbidden', 'staff of another team cannot nudge');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.nudge_rsvp_non_responders('e1000000-0000-0000-0000-000000000002') $$, '23514', 'event_cancelled', 'a cancelled event cannot be nudged');
select throws_ok($$ select public.nudge_rsvp_non_responders('e1000000-0000-0000-0000-000000000003') $$, '23514', 'event_over', 'a finished event cannot be nudged');
select is(public.nudge_rsvp_non_responders('e1000000-0000-0000-0000-000000000004'), 0, 'nobody to remind when everyone replied');
select is(public.nudge_rsvp_non_responders('e1000000-0000-0000-0000-000000000001'), 3, 'staff nudge: Ben''s guardian, Teen''s guardian (Ava''s household) and Teen themself');
reset role;
select is((select string_agg(profile_id::text, ',' order by profile_id::text) from public.notification_outbox where category = 'schedule' and channel = 'in_app' and payload ->> 'event_id' = 'e1000000-0000-0000-0000-000000000001'), 'a2222222-2222-2222-2222-222222222222,a3333333-3333-3333-3333-333333333333,a7777777-7777-7777-7777-777777777777', 'recipients are the guardians and the 13+ player of non-responders only');
select is((select count(*)::int from public.notification_outbox where profile_id in ('a1111111-1111-1111-1111-111111111111', 'a5555555-5555-5555-5555-555555555555', 'a4444444-4444-4444-4444-444444444444', 'a9999999-9999-9999-9999-999999999999')), 0, 'staff, club admins and other teams'' families get nothing');
select is((select payload ->> 'change' from public.notification_outbox where profile_id = 'a3333333-3333-3333-3333-333333333333' and channel = 'in_app' and payload ->> 'event_id' = 'e1000000-0000-0000-0000-000000000001'), 'reminder', 'it is the existing reminder notification');
select is((select count(*)::int from public.notification_outbox where payload::text ilike '%Ava%' or payload::text ilike '%Ben%' or payload::text ilike '%Teen%'), 0, 'the notification never names a child');
select matches((select payload ->> 'body' from public.notification_outbox where profile_id = 'a3333333-3333-3333-3333-333333333333' and channel = 'in_app' and payload ->> 'event_id' = 'e1000000-0000-0000-0000-000000000001'), '^RSVP needed: ', 'with the same copy as the automatic reminder');
select is((select recipients from public.event_nudges where event_id = 'e1000000-0000-0000-0000-000000000001'), 3, 'the log records how many were reminded');
select is((select count(*)::int from public.audit_log where action = 'event.nudge' and team_id = 'a1000000-0000-0000-0000-00000000000a'), 1, 'and the nudge is audited');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.nudge_rsvp_non_responders('e1000000-0000-0000-0000-000000000001') $$, '23514', 'nudged_recently', 'a second nudge inside 6 hours is refused');
reset role;
update public.event_nudges set nudged_at = now() - interval '7 hours' where event_id = 'e1000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is(public.nudge_rsvp_non_responders('e1000000-0000-0000-0000-000000000001'), 3, 'after the window it can be sent again');
reset role;
select is((select count(*)::int from public.notification_outbox where profile_id = 'a3333333-3333-3333-3333-333333333333' and channel = 'in_app' and payload ->> 'event_id' = 'e1000000-0000-0000-0000-000000000001'), 2, 'the second nudge is its own notification (not deduped away)');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select * from public.event_nudges $$, '42501', null, 'the nudge log is not readable by clients');
select * from finish();
rollback;
