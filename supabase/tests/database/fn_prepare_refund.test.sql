-- public.prepare_refund / svc_attach_refund / svc_fail_refund
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create function pg_temp.n(q text) returns int language plpgsql as $f$ declare c int; begin execute q; get diagnostics c = row_count; return c; end $f$;
create function pg_temp.login(u uuid) returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true); end $f$;
create function pg_temp.anon() returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true); end $f$;

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'coach@example.test'), ('a2222222-2222-2222-2222-222222222222', 'parent.ava@example.test'), ('a3333333-3333-3333-3333-333333333333', 'parent.ben@example.test'),
  ('a4444444-4444-4444-4444-444444444444', 'parent.other@example.test'), ('a5555555-5555-5555-5555-555555555555', 'clubadmin@example.test'), ('a6666666-6666-6666-6666-666666666666', 'coach.b@example.test'),
  ('a7777777-7777-7777-7777-777777777777', 'teen@example.test'), ('a8888888-8888-8888-8888-888888888888', 'admin@example.test'), ('a9999999-9999-9999-9999-999999999999', 'loner@example.test'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'manager@example.test'), ('abababab-abab-abab-abab-abababababab', 'admin.b@example.test');
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
insert into public.club_memberships (club_id, profile_id, role) values ('c1000000-0000-0000-0000-000000000001', 'a5555555-5555-5555-5555-555555555555', 'admin');
insert into public.teams (id, name, sport, season_label, club_id, join_code) values
  ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall 2026', 'c1000000-0000-0000-0000-000000000001', 'TEAMA00001'),
  ('a2000000-0000-0000-0000-00000000000b', 'Team B', 'basketball', 'Fall 2026', null, 'TEAMB00002');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a8888888-8888-8888-8888-888888888888', 'admin'), ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'coach'),
  ('a1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'manager'), ('a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', 'parent'),
  ('a1000000-0000-0000-0000-00000000000a', 'a3333333-3333-3333-3333-333333333333', 'parent'),
  ('a2000000-0000-0000-0000-00000000000b', 'abababab-abab-abab-abab-abababababab', 'admin'), ('a2000000-0000-0000-0000-00000000000b', 'a6666666-6666-6666-6666-666666666666', 'coach'),
  ('a2000000-0000-0000-0000-00000000000b', 'a4444444-4444-4444-4444-444444444444', 'parent');
insert into public.households (id, name) values
  ('11000000-0000-0000-0000-000000000001', 'Adams family'), ('22000000-0000-0000-0000-000000000002', 'Brown family'),
  ('33000000-0000-0000-0000-000000000003', 'Clark family');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222'), ('22000000-0000-0000-0000-000000000002', 'a3333333-3333-3333-3333-333333333333'),
  ('33000000-0000-0000-0000-000000000003', 'a4444444-4444-4444-4444-444444444444');
insert into public.players (id, household_id, first_name, last_name, date_of_birth, profile_id) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '10 years', null),
  ('92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'Ben', 'Brown', current_date - interval '9 years', null),
  ('93000000-0000-0000-0000-000000000003', '33000000-0000-0000-0000-000000000003', 'Cleo', 'Clark', current_date - interval '11 years', null),
  ('94000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000001', 'Teen', 'Adams', current_date - interval '15 years', 'a7777777-7777-7777-7777-777777777777'),
  ('96000000-0000-0000-0000-000000000006', '22000000-0000-0000-0000-000000000002', 'Dan', 'Brown', current_date - interval '9 years', null);
insert into public.team_memberships (team_id, profile_id, role) values ('a1000000-0000-0000-0000-00000000000a', 'a7777777-7777-7777-7777-777777777777', 'player');
insert into public.team_players (team_id, player_id, jersey_number, status) values
  ('a1000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001', 7, 'active'),
  ('a1000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-000000000002', 10, 'active'),
  ('a1000000-0000-0000-0000-00000000000a', '94000000-0000-0000-0000-000000000004', 4, 'active'),
  ('a1000000-0000-0000-0000-00000000000a', '96000000-0000-0000-0000-000000000006', 9, 'inactive'),
  ('a2000000-0000-0000-0000-00000000000b', '93000000-0000-0000-0000-000000000003', 7, 'active');
insert into public.connected_accounts (id, team_id, club_id, stripe_account_id, details_submitted, charges_enabled, payouts_enabled, onboarding_status) values
  ('ca000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', null, 'acct_TestTeamA', true, true, true, 'ready'),
  ('ca000000-0000-0000-0000-00000000000c', null, 'c1000000-0000-0000-0000-000000000001', 'acct_TestClub', true, true, true, 'ready'),
  ('ca000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', null, 'acct_TestTeamB', false, false, false, 'in_review');
-- Events: e1 Team A absorb $45 (Ava, Ben, Teen); e2 Team A pass_on $25 (Ava); e3 club-issued $30 (Ava, Ben);
-- e4 Team A DRAFT; e5 Team B $20 (Cleo) on an account that cannot take charges yet.
insert into public.payment_events (id, team_id, club_id, connected_account_id, title, amount_cents, due_at, fee_policy, fee_config, status, published_at, created_by) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', null, 'ca000000-0000-0000-0000-00000000000a', 'Jersey fee', 4500, now() + interval '10 days', 'absorb', '{"platform_fee_flat_cents":0,"platform_fee_bps":0,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30}', 'published', now(), 'a8888888-8888-8888-8888-888888888888'),
  ('e2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', null, 'ca000000-0000-0000-0000-00000000000a', 'Tournament fee', 2500, now() + interval '10 days', 'pass_on', '{"platform_fee_flat_cents":50,"platform_fee_bps":100,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30}', 'published', now(), 'a8888888-8888-8888-8888-888888888888'),
  ('e3000000-0000-0000-0000-000000000003', null, 'c1000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000c', 'Club dues', 3000, now() + interval '10 days', 'absorb', '{"platform_fee_flat_cents":0,"platform_fee_bps":0,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30}', 'published', now(), 'a5555555-5555-5555-5555-555555555555'),
  ('e5000000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-00000000000b', null, 'ca000000-0000-0000-0000-00000000000b', 'Camp fee', 2000, now() + interval '10 days', 'absorb', '{"platform_fee_flat_cents":0,"platform_fee_bps":0,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30}', 'published', now(), 'abababab-abab-abab-abab-abababababab');
insert into public.payment_events (id, team_id, title, amount_cents, due_at, fee_policy, status, created_by) values
  ('e4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-00000000000a', 'Spring dues', 4500, now() + interval '30 days', 'absorb', 'draft', 'a8888888-8888-8888-8888-888888888888');
insert into public.payment_requests (id, payment_event_id, player_id, household_id, amount_cents, due_at, display_id) values
  ('b1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 4500, now() + interval '10 days', 'PR-9001'),
  ('b2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 4500, now() + interval '10 days', 'PR-9002'),
  ('b3000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000001', 4500, now() + interval '10 days', 'PR-9003'),
  ('b4000000-0000-0000-0000-000000000004', 'e2000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 2500, now() + interval '10 days', 'PR-9004'),
  ('b5000000-0000-0000-0000-000000000005', 'e3000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 3000, now() + interval '10 days', 'PR-9005'),
  ('b6000000-0000-0000-0000-000000000006', 'e3000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 3000, now() + interval '10 days', 'PR-9006'),
  ('b7000000-0000-0000-0000-000000000007', 'e5000000-0000-0000-0000-000000000005', '93000000-0000-0000-0000-000000000003', '33000000-0000-0000-0000-000000000003', 2000, now() + interval '10 days', 'PR-9007');

reset role;
alter table public.payment_events disable trigger payment_events_guard;
update public.payment_events set fee_config = '{"platform_fee_flat_cents":50,"platform_fee_bps":100,"stripe_fee_bps":290,"stripe_fee_fixed_cents":30,"refund_athleit_charge_on_full":true,"refund_athleit_charge_on_partial":false,"refund_service_fee_on_full":true,"refund_service_fee_on_partial":false}'::jsonb, fee_policy = 'pass_on' where id = 'e1000000-0000-0000-0000-000000000001';
alter table public.payment_events enable trigger payment_events_guard;
update public.payment_requests set status = 'paid', paid_at = now() where id = 'b2000000-0000-0000-0000-000000000002';
insert into public.payments (id, stripe_payment_intent_id, connected_account_id, household_id, fee_policy, base_cents, platform_fee_cents, processing_fee_passthrough_cents,
  total_charged_cents, application_fee_cents, estimated_stripe_fee_cents, status, request_set_key, receipt_display_id, succeeded_at) values
  ('d1000000-0000-0000-0000-000000000001', 'pi_Ref', 'ca000000-0000-0000-0000-00000000000a', '22000000-0000-0000-0000-000000000002', 'pass_on', 4500, 95, 169, 4764, 264, 168, 'succeeded', 'setkeyref', 'RCP-90001', now());
insert into public.payment_items (id, payment_id, payment_request_id, amount_cents, platform_fee_cents, processing_fee_passthrough_cents) values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 4500, 95, 169);

reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select throws_ok($$ select public.prepare_refund('d1000000-0000-0000-0000-000000000001') $$, '42501', 'not_authorized', 'a coach cannot refund (admins only)');
reset role; select pg_temp.login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select throws_ok($$ select public.prepare_refund('d1000000-0000-0000-0000-000000000001') $$, '42501', 'not_authorized', 'a manager cannot');
reset role; select pg_temp.login('a3333333-3333-3333-3333-333333333333');
select throws_ok($$ select public.prepare_refund('d1000000-0000-0000-0000-000000000001') $$, '42501', 'not_authorized', 'the payer cannot refund themselves');
reset role; select pg_temp.login('abababab-abab-abab-abab-abababababab');
select throws_ok($$ select public.prepare_refund('d1000000-0000-0000-0000-000000000001') $$, '42501', 'not_authorized', 'another team''s admin cannot');
reset role; select pg_temp.login('a5555555-5555-5555-5555-555555555555');
select throws_ok($$ select public.prepare_refund('d1000000-0000-0000-0000-000000000001') $$, '42501', 'not_authorized', 'a club admin cannot refund a team-issued payment');
reset role; select pg_temp.anon();
select throws_ok($$ select public.prepare_refund('d1000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous cannot');
reset role; select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select throws_ok($$ select public.prepare_refund('d1000000-0000-0000-0000-000000000001', null, 100) $$, '22023', 'amount_needs_item', 'a partial amount needs an item');
select throws_ok($$ select public.prepare_refund('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 5000) $$, '23514', 'refund_exceeds_payment', 'cannot refund more than was collected');
select is((public.prepare_refund('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 1000, 'Wrong size') -> 'refunds' -> 0 ->> 'amount_cents')::int, 1000, 'a partial refund returns base only (fees are kept on partial)');
select is((select (public.prepare_refund('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 1000) -> 'refunds' -> 0 ->> 'refund_application_fee')::boolean), false, 'and does not refund the application fee');
select throws_ok($$ select public.prepare_refund('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 3000) $$, '23514', 'refund_exceeds_payment', 'pending refunds count against what remains ($45 - $10 - $10 = $25)');
select is((public.prepare_refund('d1000000-0000-0000-0000-000000000001') -> 'refunds' -> 0 ->> 'amount_cents')::int, 2500 + 95 + 169 - 0, 'refunding the rest completes the item: remaining base $25.00 + the Athleit charge $0.95 + service fee $1.69');
select throws_ok($$ select public.prepare_refund('d1000000-0000-0000-0000-000000000001') $$, '23514', 'nothing_to_refund', 'nothing is left to refund');
reset role;
select is((select count(*)::int from public.refunds where status = 'pending'), 3, 'three pending refund rows exist');
select is((select count(*)::int from public.audit_log where action = 'payment.refund'), 3, 'each refund is audited');
select is((select requested_by::text from public.refunds order by created_at limit 1), 'a8888888-8888-8888-8888-888888888888', 'with who asked');
select lives_ok($$ select public.svc_attach_refund((select id from public.refunds order by amount_cents limit 1), 're_X1', 'pending') $$, 'Stripe''s refund id is attached');
select lives_ok($$ select public.svc_fail_refund((select id from public.refunds where stripe_refund_id is null order by amount_cents limit 1)) $$, 'a refund Stripe rejected is marked failed');
select is((select count(*)::int from public.refunds where status = 'failed'), 1, 'one failed');
select is((select count(*)::int from public.refunds where status = 'pending'), 2, 'two still pending');
reset role; select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select is((public.prepare_refund('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 1000) -> 'refunds' -> 0 ->> 'amount_cents')::int, 1000, 'a failed refund no longer counts against the remaining amount');
reset role;
-- not refundable states
update public.payments set status = 'refunded' where id = 'd1000000-0000-0000-0000-000000000001';
reset role; select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select throws_ok($$ select public.prepare_refund('d1000000-0000-0000-0000-000000000001') $$, '23514', 'not_refundable', 'an already refunded payment cannot be refunded again');

select * from finish();
rollback;
