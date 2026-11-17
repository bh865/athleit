-- create / rotate / revoke / resolve_calendar_feed_token
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

reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.create_calendar_feed_token() $$, '42501', null, 'anonymous users cannot create feed tokens');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select matches((select public.create_calendar_feed_token()), '^[0-9a-f]{64}$', 'a token is 64 hex characters');
select throws_ok($$ select public.create_calendar_feed_token() $$, '23505', 'token_exists', 'only one live token per person; rotate instead');
reset role;
select is((select count(*)::int from public.calendar_feed_tokens where profile_id = 'a2222222-2222-2222-2222-222222222222' and revoked_at is null), 1, 'one live token row');
select is((select length(token_hash) from public.calendar_feed_tokens where profile_id = 'a2222222-2222-2222-2222-222222222222'), 64, 'a SHA-256 hash is stored');
create temp table pg_temp.tok as select null::text as t;
grant all on pg_temp.tok to public;
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
update pg_temp.tok set t = public.rotate_calendar_feed_token();
select matches((select t from pg_temp.tok), '^[0-9a-f]{64}$', 'rotate returns a fresh token');
reset role;
select is((select count(*)::int from public.calendar_feed_tokens where profile_id = 'a2222222-2222-2222-2222-222222222222' and revoked_at is null), 1, 'after a rotate there is still exactly one live token');
select is((select count(*)::int from public.calendar_feed_tokens where profile_id = 'a2222222-2222-2222-2222-222222222222' and revoked_at is not null), 1, 'and the old one is revoked');
select isnt((select token_hash from public.calendar_feed_tokens where revoked_at is null and profile_id = 'a2222222-2222-2222-2222-222222222222'), (select t from pg_temp.tok), 'the stored value is not the token');
select is((select token_hash from public.calendar_feed_tokens where revoked_at is null and profile_id = 'a2222222-2222-2222-2222-222222222222'), encode(sha256(convert_to((select t from pg_temp.tok), 'UTF8')), 'hex'), 'it is the SHA-256 of the token');
select is((select count(*)::int from public.calendar_feed_tokens where profile_id = 'a2222222-2222-2222-2222-222222222222' and token_hash = (select t from pg_temp.tok)), 0, 'the plaintext token is never stored');
-- resolve: service role only
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.resolve_calendar_feed_token('0000000000000000000000000000000000000000000000000000000000000000') $$, '42501', null, 'clients cannot call resolve_calendar_feed_token');
reset role;
set local role service_role;
select is(public.resolve_calendar_feed_token((select t from pg_temp.tok)), 'a2222222-2222-2222-2222-222222222222'::uuid, 'the service role resolves a live token to its owner');
select is(public.resolve_calendar_feed_token('0000000000000000000000000000000000000000000000000000000000000000'), null, 'an unknown token resolves to nothing');
select is(public.resolve_calendar_feed_token('short'), null, 'a malformed token resolves to nothing');
select is(public.resolve_calendar_feed_token(null), null, 'a null token resolves to nothing');
reset role;
select isnt((select last_used_at from public.calendar_feed_tokens where revoked_at is null and profile_id = 'a2222222-2222-2222-2222-222222222222'), null, 'last_used_at is recorded');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.revoke_calendar_feed_token() $$, 'a user revokes their feed');
reset role;
set local role service_role;
select is(public.resolve_calendar_feed_token((select t from pg_temp.tok)), null, 'a revoked token no longer resolves');
reset role;
select is((select count(*)::int from public.calendar_feed_tokens where profile_id = 'a2222222-2222-2222-2222-222222222222' and revoked_at is null), 0, 'no live token remains');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select matches((select public.create_calendar_feed_token()), '^[0-9a-f]{64}$', 'a new token can be created after revoking');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from (select id from public.calendar_feed_tokens) x), 0, 'users never see each other''s tokens');
select lives_ok($$ select public.revoke_calendar_feed_token() $$, 'revoking with no live token is harmless');
reset role;
select is((select count(*)::int from public.audit_log where action like 'calendar_feed.%' and created_at = now()), 5, 'create / rotate / revoke are audited (without the token)');
select is((select count(*)::int from public.audit_log where created_at = now() and after::text like '%' || (select t from pg_temp.tok) || '%'), 0, 'the token never appears in the audit log');
select * from finish();
rollback;
