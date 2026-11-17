-- RLS and trigger tests for public.rsvps
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
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'game', 'A game', now() + interval '1 day', now() + interval '1 day 2 hours', 'America/New_York'),
  ('e2000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', 'game', 'B game', now() + interval '1 day', now() + interval '1 day 2 hours', 'America/New_York');
insert into public.rsvps (event_id, player_id, team_id, status, note, responded_by) values
  ('e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'going', 'ava note', 'a2222222-2222-2222-2222-222222222222'),
  ('e1000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 'not_going', 'ben note', 'a3333333-3333-3333-3333-333333333333'),
  ('e1000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-00000000000a', 'maybe', null, 'a7777777-7777-7777-7777-777777777777'),
  ('e2000000-0000-0000-0000-00000000000b', '93000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-00000000000b', 'going', null, 'a4444444-4444-4444-4444-444444444444');
reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.rsvps $$, '42501', null, 'anonymous users cannot read RSVPs');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.rsvps), 3, 'staff read every RSVP on their own team (and none on other teams)');
select is((select count(*)::int from public.rsvps where note is not null), 2, 'staff read the notes');
reset role; select set_config('request.jwt.claims', '{"sub":"a8888888-8888-8888-8888-888888888888","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.rsvps), 3, 'team admins read RSVPs too');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.rsvps), 2, 'a guardian reads her own household''s children RSVPs only (Ava and Teen, not Ben)');
select is((select count(*)::int from public.rsvps where player_id = '92000000-0000-0000-0000-000000000002'), 0, 'a parent cannot read another child''s RSVP');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is((select player_id from public.rsvps), '92000000-0000-0000-0000-000000000002', 'the other family sees only their own child''s RSVP');
reset role; select set_config('request.jwt.claims', '{"sub":"a7777777-7777-7777-7777-777777777777","role":"authenticated"}', true); set local role authenticated;
select is((select player_id from public.rsvps), '94000000-0000-0000-0000-000000000004', 'a 13+ player with a login reads only their own RSVP');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.rsvps), 0, 'a club admin cannot read RSVP names or statuses');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.rsvps where team_id = 'a1000000-0000-0000-0000-00000000000a'), 0, 'a parent on another team cannot read team A RSVPs');
select is((select count(*)::int from public.rsvps), 1, 'but reads their own child''s');
reset role; select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.rsvps where team_id = 'a1000000-0000-0000-0000-00000000000a'), 0, 'staff of another team cannot read team A RSVPs');
reset role; select set_config('request.jwt.claims', '{"sub":"a9999999-9999-9999-9999-999999999999","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.rsvps), 0, 'a stranger reads nothing');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ insert into public.rsvps (event_id, player_id, team_id, status) values ('e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'going') $$, '42501', null, 'staff cannot insert RSVPs directly');
select throws_ok($$ update public.rsvps set status = 'going' $$, '42501', null, 'staff cannot update RSVPs directly');
select throws_ok($$ delete from public.rsvps $$, '42501', null, 'staff cannot delete RSVPs directly');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ update public.rsvps set status = 'not_going' $$, '42501', null, 'parents cannot update RSVPs directly (set_rsvp only)');
reset role;
select throws_ok($$ insert into public.rsvps (event_id, player_id, team_id, status) values ('e1000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-00000000000a', 'going') $$, '23514', 'player_not_on_roster', 'an inactive roster player cannot have an RSVP');
select throws_ok($$ insert into public.rsvps (event_id, player_id, team_id, status) values ('e1000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-00000000000a', 'going') $$, '23514', 'player_not_on_roster', 'a player from another team cannot have an RSVP');
select throws_ok($$ insert into public.rsvps (event_id, player_id, team_id, status) values ('e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'going') $$, '23505', null, 'one RSVP per player per event');
select throws_ok($$ insert into public.rsvps (event_id, player_id, team_id, status) values ('e1000000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-00000000000a', 'attending') $$, '23514', null, 'status must be going / not_going / maybe');
select is((select team_id from (select team_id from public.rsvps where event_id = 'e2000000-0000-0000-0000-00000000000b') x), 'a2000000-0000-0000-0000-00000000000b', 'team_id follows the event');
select throws_ok($$ delete from public.events where id = 'e1000000-0000-0000-0000-000000000001' $$, '23503', null, 'an event with RSVPs cannot be deleted');
select * from finish();
rollback;
