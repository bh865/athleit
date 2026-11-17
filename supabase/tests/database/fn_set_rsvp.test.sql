-- public.set_rsvp
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
  ('e1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-00000000000a', 'practice', 'Over', now() - interval '3 hours', now() - interval '1 hour', 'UTC'),
  ('e2000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', 'game', 'B game', now() + interval '1 day', now() + interval '1 day 2 hours', 'UTC');
update public.events set status = 'cancelled', cancelled_reason = 'Rain' where id = 'e1000000-0000-0000-0000-000000000002';
-- Cleo is 11 and cannot have a login; force one in to prove the age rule is checked anyway.
alter table public.players disable trigger players_enforce_rules;
update public.players set profile_id = 'a9999999-9999-9999-9999-999999999999' where id = '93000000-0000-0000-0000-000000000003';
alter table public.players enable trigger players_enforce_rules;
reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'going') $$, '42501', null, 'anonymous users cannot RSVP');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'going', '  Running late  ') $$, 'a guardian RSVPs for her child');
select is((select status || '/' || note || '/' || set_by_staff::text from public.rsvps where player_id = '91000000-0000-0000-0000-000000000001'), 'going/Running late/false', 'status, trimmed note and set_by_staff=false are stored');
select is((select responded_by from public.rsvps where player_id = '91000000-0000-0000-0000-000000000001'), 'a2222222-2222-2222-2222-222222222222'::uuid, 'responded_by is the guardian');
select lives_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'not_going') $$, 'she can change her mind');
select is((select count(*)::int from public.rsvps where event_id = 'e1000000-0000-0000-0000-000000000001' and player_id = '91000000-0000-0000-0000-000000000001'), 1, 'still one RSVP per child per event (upsert)');
select is((select status from public.rsvps where player_id = '91000000-0000-0000-0000-000000000001'), 'not_going', 'the status was updated');
select is((select note from public.rsvps where player_id = '91000000-0000-0000-0000-000000000001'), null, 'an omitted note clears the note');
select lives_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000004', 'maybe') $$, 'a guardian RSVPs for each of her children separately');
select throws_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', 'going') $$, '42501', 'forbidden', 'a parent cannot RSVP for a child outside her household');
select throws_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000005', 'going') $$, '23514', 'player_not_on_roster', 'a child who is not on the event''s team cannot be RSVPed');
select lives_ok($$ select public.set_rsvp('e2000000-0000-0000-0000-00000000000b', '95000000-0000-0000-0000-000000000005', 'going') $$, 'but the same parent can RSVP Ivy on Ivy''s own team');
select throws_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'attending') $$, '23514', 'invalid_status', 'status must be going / not_going / maybe');
select throws_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000001', 'going') $$, '23514', 'event_cancelled', 'cancelled events take no RSVPs');
select throws_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000001', 'going') $$, '23514', 'event_over', 'finished events take no RSVPs');
select throws_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'going', repeat('x', 501)) $$, '23514', null, 'notes are length-limited');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', 'going') $$, 'the other family RSVPs for their own child');
select throws_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'going') $$, '42501', 'forbidden', 'and cannot touch another family''s RSVP');
select throws_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000006', 'going') $$, '23514', 'player_not_on_roster', 'an inactive roster player cannot be RSVPed');
reset role; select set_config('request.jwt.claims', '{"sub":"a7777777-7777-7777-7777-777777777777","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000004', 'going', 'I will be there') $$, 'a 13+ player with a login RSVPs for themselves');
select is((select responded_by from public.rsvps where player_id = '94000000-0000-0000-0000-000000000004'), 'a7777777-7777-7777-7777-777777777777'::uuid, 'and responded_by is the player');
select throws_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'going') $$, '42501', 'forbidden', 'a player cannot RSVP for a sibling');
reset role; select set_config('request.jwt.claims', '{"sub":"a9999999-9999-9999-9999-999999999999","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.set_rsvp('e2000000-0000-0000-0000-00000000000b', '93000000-0000-0000-0000-000000000003', 'going') $$, '42501', 'forbidden', 'an under-13 player cannot RSVP as themselves, even with a (forced) login');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'going') $$, '42501', 'forbidden', 'staff cannot use the parent path (they use staff_set_rsvp)');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'going') $$, '42501', 'forbidden', 'a club admin cannot RSVP for anyone');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.set_rsvp('e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'going') $$, '42501', 'forbidden', 'a parent on another team cannot RSVP into team A');
select lives_ok($$ select public.set_rsvp('e2000000-0000-0000-0000-00000000000b', '93000000-0000-0000-0000-000000000003', 'maybe') $$, 'a parent RSVPs for her own child on her own team');
select * from finish();
rollback;
