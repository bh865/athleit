-- public.preview_invite_public, public.preview_claim_public
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'admin@example.test'),
  ('a2222222-2222-2222-2222-222222222222', 'parent@example.test');
update public.profiles set display_name = 'Terry Admin' where id = 'a1111111-1111-1111-1111-111111111111';
insert into public.teams (id, name, sport, season_label) values ('a1000000-0000-0000-0000-00000000000a', 'Hawks', 'soccer', 'Fall');
insert into public.team_memberships (team_id, profile_id, role) values ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'admin');
insert into public.households (id, name) values ('11000000-0000-0000-0000-000000000001', 'Pat fam');
insert into public.household_members (household_id, profile_id) values ('11000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222');
insert into public.players (id, household_id, first_name, last_name, date_of_birth, profile_id) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '15 years', null),
  ('92000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 'Kid', 'Adams', current_date - interval '9 years', null),
  ('93000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 'Linked', 'Adams', current_date - interval '16 years', 'a2222222-2222-2222-2222-222222222222');

reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
create temp table t as
  select 'ok'::text k, token from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'coach')
  union all select 'used', token from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'coach')
  union all select 'revoked', token from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'coach');
grant select on t to anon, authenticated;
reset role;
update public.invites set use_count = max_uses where token_hash = encode(sha256(convert_to((select token from t where k = 'used'), 'utf8')), 'hex');
update public.invites set revoked_at = now() where token_hash = encode(sha256(convert_to((select token from t where k = 'revoked'), 'utf8')), 'hex');

set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select outcome || '/' || kind || '/' || target_name || '/' || role || '/' || inviter_first_name from public.preview_invite_public((select token from t where k = 'ok'))), 'ok/team/Hawks/coach/Terry', 'anon gets kind, name, role and the inviter first name');
select results_eq($$ select outcome, kind, target_name, role, inviter_first_name from public.preview_invite_public('nope') $$, $$ values ('invalid'::text, null::text, null::text, null::text, null::text) $$, 'an unknown token returns the generic shape with no detail');
select results_eq($$ select outcome, kind, target_name, role, inviter_first_name from public.preview_invite_public((select token from t where k = 'used')) $$, $$ values ('expired'::text, null::text, null::text, null::text, null::text) $$, 'a used token returns the generic outcome and no detail');
select results_eq($$ select outcome, kind, target_name, role, inviter_first_name from public.preview_invite_public((select token from t where k = 'revoked')) $$, $$ values ('expired'::text, null::text, null::text, null::text, null::text) $$, 'a revoked token looks the same as a used one');
select throws_ok($$ select count(*) from public.invites $$, '42501', null, 'anon cannot read the invites table');

select is((select outcome || '/' || player_first_name from public.preview_claim_public('91000000-0000-0000-0000-000000000001')), 'ok/Ava', 'anon gets only the first name for a claimable player');
select results_eq($$ select outcome, player_first_name from public.preview_claim_public('92000000-0000-0000-0000-000000000002') $$, $$ values ('invalid'::text, null::text) $$, 'a child under 13 is reported as invalid with no name');
select results_eq($$ select outcome, player_first_name from public.preview_claim_public('93000000-0000-0000-0000-000000000003') $$, $$ values ('invalid'::text, null::text) $$, 'an already linked player is reported as invalid with no name');
select results_eq($$ select outcome, player_first_name from public.preview_claim_public('00000000-0000-0000-0000-000000000000') $$, $$ values ('invalid'::text, null::text) $$, 'an unknown player is reported as invalid with no name');

reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select outcome from public.preview_invite_public((select token from t where k = 'ok'))), 'ok', 'a signed-in caller gets the same preview');

-- Rate limit: 30 calls per caller per 15 minutes, then refused (no raise, so the hit is kept).
reset role; select set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;
select is((select count(*)::int from generate_series(1, 30) g, lateral public.preview_invite_public('x' || g) r where r.outcome <> 'rate_limited'), 26, 'calls up to the limit of 30 are served (4 were used above)');
select is((select outcome from public.preview_invite_public((select token from t where k = 'ok'))), 'rate_limited', 'a caller over the limit is refused, even for a valid token');

select * from finish();
rollback;
