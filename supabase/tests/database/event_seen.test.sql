-- public.mark_event_seen, event_seen RLS, and seen_revision on the schedule reads
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
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'game', 'A game', now() + interval '1 day', now() + interval '1 day 2 hours', 'UTC');
reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.mark_event_seen('e1000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous users cannot mark events seen');
reset role; select set_config('request.jwt.claims', '{"sub":"a9999999-9999-9999-9999-999999999999","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.mark_event_seen('e1000000-0000-0000-0000-000000000001') $$, '42501', 'forbidden', 'a stranger cannot mark an event they cannot see');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.mark_event_seen('e1000000-0000-0000-0000-000000000001') $$, '42501', 'forbidden', 'staff of another team cannot either');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select seen_revision from public.household_schedule_range(now(), now() + interval '3 days') where event_id = 'e1000000-0000-0000-0000-000000000001' limit 1), null, 'never opened: seen_revision is null on the household read');
select is(public.mark_event_seen('e1000000-0000-0000-0000-000000000001'), 1, 'a guardian marks the event seen at its current revision');
select is((select seen_revision from public.household_schedule_range(now(), now() + interval '3 days') where event_id = 'e1000000-0000-0000-0000-000000000001' limit 1), 1, 'the household read returns it');
select is((select seen_revision from public.household_schedule('upcoming') where event_id = 'e1000000-0000-0000-0000-000000000001' limit 1), 1, 'and so does the paged household read');
select is((select seen_revision from public.get_event('e1000000-0000-0000-0000-000000000001')), 1, 'and get_event');
select throws_ok($$ insert into public.event_seen (event_id, user_id, revision) values ('e1000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222', 5) $$, '42501', null, 'there is no direct insert grant');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.event_seen), 0, 'another guardian cannot read Ava''s seen rows');
select is((select seen_revision from public.get_event('e1000000-0000-0000-0000-000000000001')), null, 'and has their own (empty) seen state');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is(public.mark_event_seen('e1000000-0000-0000-0000-000000000001'), 1, 'a club admin who can read the schedule can mark an event seen');
reset role; select set_config('request.jwt.claims', '{"sub":"a7777777-7777-7777-7777-777777777777","role":"authenticated"}', true); set local role authenticated;
select is(public.mark_event_seen('e1000000-0000-0000-0000-000000000001'), 1, 'a 13+ player can mark an event seen');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select seen_revision from public.team_schedule_range('a1000000-0000-0000-0000-00000000000a', now(), now() + interval '3 days') where id = 'e1000000-0000-0000-0000-000000000001'), null, 'staff team range read: null until the coach opens it');
select is(public.mark_event_seen('e1000000-0000-0000-0000-000000000001'), 1, 'staff mark it seen');
select is((select seen_revision from public.team_schedule('a1000000-0000-0000-0000-00000000000a', 'upcoming') where id = 'e1000000-0000-0000-0000-000000000001'), 1, 'the paged team read returns it');
select is((select count(*)::int from public.event_seen), 1, 'the coach sees only their own row');
reset role;
update public.events set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where id = 'e1000000-0000-0000-0000-000000000001';
select is((select revision from public.events where id = 'e1000000-0000-0000-0000-000000000001'), 2, 'a time change bumps the revision');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select revision || '/' || seen_revision from public.get_event('e1000000-0000-0000-0000-000000000001')), '2/1', 'after the change revision is ahead of the seen revision');
select is(public.mark_event_seen('e1000000-0000-0000-0000-000000000001'), 2, 'opening it again catches up');
select is((select seen_revision from public.get_event('e1000000-0000-0000-0000-000000000001')), 2, 'the seen revision follows');
reset role;
select is((select count(*)::int from public.event_seen where event_id = 'e1000000-0000-0000-0000-000000000001'), 4, 'one row per person per event');
delete from public.events where id = 'e1000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.event_seen), 0, 'deleting the event removes its seen rows');
select * from finish();
rollback;
