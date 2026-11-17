-- private.send_rsvp_reminders (pg_cron job schedule-rsvp-reminders)
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
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'game', 'Soon game', now() + interval '5 hours', now() + interval '7 hours', 'UTC'),
  ('e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'Far practice', now() + interval '30 hours', now() + interval '31 hours', 'UTC'),
  ('e1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'Cancelled soon', now() + interval '5 hours', now() + interval '6 hours', 'UTC'),
  ('e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'Past practice', now() - interval '5 hours', now() - interval '4 hours', 'UTC'),
  ('e2000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', 'game', 'B soon', now() + interval '6 hours', now() + interval '8 hours', 'UTC');
update public.events set status = 'cancelled', cancelled_reason = 'Rain' where id = 'e1000000-0000-0000-0000-000000000003';
-- Ava and Teen answered Soon game; Ben did not. Team B: Cleo and Ivy have not answered.
insert into public.rsvps (event_id, player_id, team_id, status) values ('e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'going'), ('e1000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-00000000000a', 'not_going');
select is((select count(*)::int from cron.job where jobname = 'schedule-rsvp-reminders' and schedule = '*/15 * * * *'), 1, 'the reminder job is scheduled every 15 minutes');
select private.send_rsvp_reminders();
select is((select count(*)::int from public.notification_outbox where channel = 'in_app' and payload ->> 'team_id' in ('a1000000-0000-0000-0000-00000000000a'::text, 'a2000000-0000-0000-0000-00000000000b'::text)), 3, 'reminders: Ben (Soon game), Other (B soon, Cleo) and Ava (B soon, Ivy)');
select is((select count(*)::int from public.notification_outbox where channel = 'in_app' and profile_id = 'a3333333-3333-3333-3333-333333333333'), 1, 'a guardian whose child has not answered is reminded');
select is((select count(*)::int from public.notification_outbox where channel = 'in_app' and profile_id = 'a2222222-2222-2222-2222-222222222222' and payload ->> 'event_id' = 'e1000000-0000-0000-0000-000000000001'::text), 0, 'a guardian whose children all answered is not reminded');
select is((select count(*)::int from public.notification_outbox where channel = 'in_app' and profile_id = 'a2222222-2222-2222-2222-222222222222' and payload ->> 'event_id' = 'e2000000-0000-0000-0000-00000000000b'::text), 1, 'but is reminded about the other team''s event for Ivy');
select is((select count(*)::int from public.notification_outbox where payload ->> 'team_id' in ('a1000000-0000-0000-0000-00000000000a'::text, 'a2000000-0000-0000-0000-00000000000b'::text) and payload ->> 'event_id' in ('e1000000-0000-0000-0000-000000000002'::text, 'e1000000-0000-0000-0000-000000000003'::text, 'e1000000-0000-0000-0000-000000000004'::text)), 0, 'no reminders for events beyond 24 hours, cancelled events or past events');
select is((select count(*)::int from public.notification_outbox where payload ->> 'team_id' in ('a1000000-0000-0000-0000-00000000000a'::text, 'a2000000-0000-0000-0000-00000000000b'::text) and profile_id in ('a7777777-7777-7777-7777-777777777777', 'a1111111-1111-1111-1111-111111111111', 'a5555555-5555-5555-5555-555555555555')), 0, 'only guardians are reminded (not the 13+ player, staff or club admins)');
select is((select count(*)::int from public.notification_outbox where payload ->> 'team_id' in ('a1000000-0000-0000-0000-00000000000a'::text, 'a2000000-0000-0000-0000-00000000000b'::text) and payload::text ~* '(Ben|Ava|Ivy|Cleo|Brown|Adams)'), 0, 'reminders never carry a child''s name');
select matches((select payload ->> 'body' from public.notification_outbox where profile_id = 'a3333333-3333-3333-3333-333333333333' and channel = 'in_app'), '^RSVP needed: ', 'the body asks for an RSVP');
select private.send_rsvp_reminders();
select is((select count(*)::int from public.notification_outbox where channel = 'in_app' and payload ->> 'team_id' in ('a1000000-0000-0000-0000-00000000000a'::text, 'a2000000-0000-0000-0000-00000000000b'::text)), 3, 'once per event: running again sends nothing');
-- a late answer does not matter; a new unanswered event does
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone) values
  ('e9000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'New soon', now() + interval '2 hours', now() + interval '3 hours', 'UTC');
select private.send_rsvp_reminders();
select is((select count(*)::int from public.notification_outbox where channel = 'in_app' and payload ->> 'team_id' in ('a1000000-0000-0000-0000-00000000000a'::text, 'a2000000-0000-0000-0000-00000000000b'::text)), 5, 'a newly scheduled event inside 24 hours is picked up (Ben and Ava)');
update public.notification_preferences set enabled = false where profile_id = 'a3333333-3333-3333-3333-333333333333' and category = 'schedule';
insert into public.events (id, team_id, type, title, starts_at, ends_at, timezone) values
  ('e9000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'Muted soon', now() + interval '3 hours', now() + interval '4 hours', 'UTC');
select private.send_rsvp_reminders();
select is((select count(*)::int from public.notification_outbox where profile_id = 'a3333333-3333-3333-3333-333333333333' and channel in ('push', 'email') and payload ->> 'title' = 'Muted soon'), 0, 'a guardian with schedule notifications off gets no push or email');
select * from finish();
rollback;
