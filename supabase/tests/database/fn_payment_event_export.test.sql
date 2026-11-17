-- public.payment_event_export / svc_reconcile_candidates
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

-- Ben's household paid his Jersey fee by card (pay1), then got a partial refund.
update public.payment_requests set status = 'paid', paid_at = now() where id = 'b2000000-0000-0000-0000-000000000002';
insert into public.payments (id, stripe_payment_intent_id, stripe_charge_id, connected_account_id, household_id, payer_profile_id, fee_policy, base_cents, total_charged_cents,
  estimated_stripe_fee_cents, stripe_fee_cents, net_to_account_cents, status, request_set_key, receipt_display_id, succeeded_at) values
  ('d1000000-0000-0000-0000-000000000001', 'pi_TestBen1', 'ch_TestBen1', 'ca000000-0000-0000-0000-00000000000a', '22000000-0000-0000-0000-000000000002', 'a3333333-3333-3333-3333-333333333333', 'absorb', 4500, 4500, 161, 161, 4339, 'succeeded', 'setkeyben1', 'RCP-90001', now());
insert into public.payment_items (id, payment_id, payment_request_id, amount_cents) values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 4500);
insert into public.refunds (id, payment_id, payment_item_id, stripe_refund_id, amount_cents, reason, requested_by, status) values
  ('d3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 're_TestBen1', 1000, 'Partial', 'a8888888-8888-8888-8888-888888888888', 'succeeded');
insert into public.offline_payments (payment_request_id, method, recorded_by) values ('b6000000-0000-0000-0000-000000000006', 'cash', 'a8888888-8888-8888-8888-888888888888');
update public.payment_requests set status = 'paid_offline', paid_at = now() where id = 'b6000000-0000-0000-0000-000000000006';

reset role; select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.payment_event_export('e1000000-0000-0000-0000-000000000001')), 3, 'staff export every request of their event');
select is((select string_agg(player_name || ':' || status, ',' order by player_name) from public.payment_event_export('e1000000-0000-0000-0000-000000000001')), 'Ava Adams:unpaid,Ben Brown:paid,Teen Adams:unpaid', 'names and statuses');
select is((select receipt_display_id from public.payment_event_export('e1000000-0000-0000-0000-000000000001') where player_name = 'Ben Brown'), 'RCP-90001', 'receipt ids are included');
select is((select total_charged_cents from public.payment_event_export('e1000000-0000-0000-0000-000000000001') where player_name = 'Ben Brown'), 4500, 'with what was charged');
select is((select count(*)::int from public.payment_event_export('e3000000-0000-0000-0000-000000000003')), 0, 'a coach cannot export a club-issued event');
reset role; select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.payment_event_export('e1000000-0000-0000-0000-000000000001')), 0, 'a parent cannot export');
reset role; select pg_temp.login('a5555555-5555-5555-5555-555555555555');
select is((select count(*)::int from public.payment_event_export('e1000000-0000-0000-0000-000000000001')), 0, 'a club admin cannot export a team event');
select is((select count(*)::int from public.payment_event_export('e3000000-0000-0000-0000-000000000003')), 2, 'but can export their own club''s event');
reset role; select pg_temp.anon();
select throws_ok($$ select * from public.payment_event_export('e1000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous cannot');
reset role;
-- reconcile candidates
insert into public.payments (id, stripe_payment_intent_id, connected_account_id, household_id, fee_policy, base_cents, total_charged_cents, estimated_stripe_fee_cents, status, request_set_key, updated_at, receipt_display_id) values
  ('d1000000-0000-0000-0000-00000000000b', 'pi_NoFee', 'ca000000-0000-0000-0000-00000000000a', '11000000-0000-0000-0000-000000000001', 'absorb', 4500, 4500, 161, 'succeeded', 'setkeynofee', now() - interval '2 hours', 'RCP-90002');
insert into public.payments (id, stripe_payment_intent_id, connected_account_id, household_id, fee_policy, base_cents, total_charged_cents, estimated_stripe_fee_cents, status, request_set_key, updated_at) values
  ('d1000000-0000-0000-0000-000000000009', 'pi_Stuck', 'ca000000-0000-0000-0000-00000000000a', '11000000-0000-0000-0000-000000000001', 'absorb', 4500, 4500, 161, 'processing', 'setkeystuck', now() - interval '1 hour'),
  ('d1000000-0000-0000-0000-00000000000a', 'pi_Fresh', 'ca000000-0000-0000-0000-00000000000a', '11000000-0000-0000-0000-000000000001', 'absorb', 4500, 4500, 161, 'processing', 'setkeyfresh', now());
select is(jsonb_array_length(public.svc_reconcile_candidates() -> 'open_payments'), 1, 'only the payment stuck in processing is a candidate (the fresh one is left alone)');
select is(public.svc_reconcile_candidates() -> 'open_payments' -> 0 ->> 'pi', 'pi_Stuck', 'the right one');
select is(jsonb_array_length(public.svc_reconcile_candidates() -> 'missing_fee'), 1, 'a succeeded payment without its actual Stripe fee is a candidate');
select cmp_ok(jsonb_array_length(public.svc_reconcile_candidates() -> 'accounts'), '>=', 1, 'accounts that are not ready are re-checked');
reset role; select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.svc_reconcile_candidates() $$, '42501', null, 'clients cannot call it');

select * from finish();
rollback;
