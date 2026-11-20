-- Team subscriptions: state function, gates, trial, settings, admin functions, reads, snapshots, sweep, deletion blockers
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create function pg_temp.login(u uuid, a text default 'aal1') returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', a)::text, true);
  perform set_config('role', 'authenticated', true); end $f$;
create function pg_temp.anon() returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true); end $f$;

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'coach@example.test'),
  ('a2222222-2222-2222-2222-222222222222', 'parent@example.test'),
  ('a8888888-8888-8888-8888-888888888888', 'admin@example.test'),
  ('a9999999-9999-9999-9999-999999999999', 'stranger@example.test'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'manager@example.test'),
  ('abababab-abab-abab-abab-abababababab', 'admin.b@example.test'),
  ('acacacac-acac-acac-acac-acacacacacac', 'admin2@example.test'),
  ('b1111111-1111-1111-1111-111111111111', 'platform.owner@example.test'),
  ('b2222222-2222-2222-2222-222222222222', 'platform.admin@example.test'),
  ('b3333333-3333-3333-3333-333333333333', 'platform.support@example.test');
insert into public.platform_admins (profile_id, role) values
  ('b1111111-1111-1111-1111-111111111111', 'owner'), ('b2222222-2222-2222-2222-222222222222', 'admin'),
  ('b3333333-3333-3333-3333-333333333333', 'support');
insert into public.teams (id, name, sport, season_label, join_code) values
  ('a1000000-0000-0000-0000-00000000000a', 'Billing Test Alpha', 'soccer', 'Fall 2026', 'TEAMA00001'),
  ('a2000000-0000-0000-0000-00000000000b', 'Team B', 'basketball', 'Fall 2026', 'TEAMB00002');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a8888888-8888-8888-8888-888888888888', 'admin'),
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'coach'),
  ('a1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'manager'),
  ('a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', 'parent'),
  ('a2000000-0000-0000-0000-00000000000b', 'abababab-abab-abab-abab-abababababab', 'admin');

-- Billing ships OFF: nothing is created, everyone is fully active ----------------------------------------------
select is((select count(*)::int from public.team_billing), 0, 'billing off: no billing rows exist');
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a'), 'off', 'billing off: state is off');
select is(private.billing_access('off'), 'full', 'billing off: full access');
insert into public.teams (id, name, sport, season_label, join_code)
  values ('a3000000-0000-0000-0000-00000000000c', 'Team C', 'soccer', 'Fall 2026', 'TEAMC00003');
select is((select count(*)::int from public.team_billing), 0, 'billing off: creating a team creates no billing row');
delete from public.teams where id = 'a3000000-0000-0000-0000-00000000000c';

-- Seeded settings and the first price version ---------------------------------------------------------------------
select is(private.setting_int('team_subscription.price_cents'), 1000, 'seed price');
select is(private.setting_int('team_subscription.trial_days'), 14, 'seed trial days');
select is(private.setting_int('team_subscription.grace_days'), 21, 'seed grace days');
select is(private.setting_int_array('team_subscription.trial_reminder_days'), array[3, 1], 'seed reminder days');
select is((select count(*)::int from public.billing_price_versions where amount_cents = 1000), 1, 'the seeded price has a version');

-- Launch: enable + backfill; disabling restores everything and deletes nothing ------------------------------------
select is(private.enable_team_billing('b1111111-1111-1111-1111-111111111111', 'launch test'), (select count(*)::int from public.teams), 'enable backfills a billing row for every existing team');
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a'), 'trialing', 'existing team starts a fresh trial');
select is((select (trial_ends_at - trial_started_at) from public.team_billing where team_id = 'a1000000-0000-0000-0000-00000000000a'),
          make_interval(days => private.setting_int('team_subscription.trial_days')), 'trial length comes from the setting');
select is((select count(*)::int from public.platform_setting_history where key = 'team_subscription.enabled'), 1, 'enabling is in the history');
select is((select count(*)::int from public.platform_audit_log where action = 'billing.enabled'), 1, 'enabling is in the platform audit');
insert into public.teams (id, name, sport, season_label, join_code)
  values ('a3000000-0000-0000-0000-00000000000c', 'Team C', 'soccer', 'Fall 2026', 'TEAMC00003');
select is((select count(*)::int from public.team_billing where team_id = 'a3000000-0000-0000-0000-00000000000c'), 1, 'a new team starts its trial on creation');
select private.set_platform_setting('team_subscription.trial_days', '30'::jsonb, 'b1111111-1111-1111-1111-111111111111', 'longer trials');
select is((select (trial_ends_at - trial_started_at) from public.team_billing where team_id = 'a1000000-0000-0000-0000-00000000000a'),
          make_interval(days => 14), 'changing trial_days never alters a running trial');
select private.set_platform_setting('team_subscription.trial_days', '14'::jsonb, 'b1111111-1111-1111-1111-111111111111', 'back to normal');

-- State vectors (injected clock) ------------------------------------------------------------------------------------
update public.team_billing set trial_started_at = '2026-01-01T00:00:00Z', trial_ends_at = '2026-01-15T00:00:00Z'
  where team_id = 'a1000000-0000-0000-0000-00000000000a';
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a', '2026-01-14T23:59:59Z'), 'trialing', 'trial: one second before the end');
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a', '2026-01-15T00:00:00Z'), 'trial_expired', 'trial: at the end');
update public.team_billing set stripe_subscription_id = 'sub_test1', stripe_customer_id = 'cus_test1', stripe_status = 'active',
  current_period_end = '2026-02-15T00:00:00Z' where team_id = 'a1000000-0000-0000-0000-00000000000a';
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a', '2026-03-01T00:00:00Z'), 'active', 'subscription active');
update public.team_billing set stripe_status = 'trialing' where team_id = 'a1000000-0000-0000-0000-00000000000a';
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a', '2026-01-10T00:00:00Z'), 'active', 'stripe-trialing counts as active');
update public.team_billing set stripe_status = 'active', cancel_at_period_end = true where team_id = 'a1000000-0000-0000-0000-00000000000a';
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a', '2026-02-14T23:59:59Z'), 'cancel_scheduled', 'cancel scheduled before the period ends');
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a', '2026-02-15T00:00:00Z'), 'lapsed', 'cancel scheduled: lapsed at the period end');
update public.team_billing set cancel_at_period_end = false, stripe_status = 'past_due', past_due_since = '2026-02-01T00:00:00Z', grace_ends_at = '2026-02-08T00:00:00Z'
  where team_id = 'a1000000-0000-0000-0000-00000000000a';
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a', '2026-02-07T23:59:59Z'), 'past_due', 'past due inside grace');
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a', '2026-02-08T00:00:00Z'), 'lapsed', 'past due beyond grace is lapsed');
select is(private.billing_access('past_due'), 'grace', 'grace access');
update public.team_billing set stripe_status = 'active', past_due_since = null, grace_ends_at = null where team_id = 'a1000000-0000-0000-0000-00000000000a';
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a', '2026-02-09T00:00:00Z'), 'active', 'a payment at any time returns the team to active');
update public.team_billing set stripe_status = 'canceled' where team_id = 'a1000000-0000-0000-0000-00000000000a';
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a', '2026-02-09T00:00:00Z'), 'lapsed', 'canceled subscription is lapsed');
update public.team_billing set stripe_status = 'incomplete' where team_id = 'a1000000-0000-0000-0000-00000000000a';
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a', '2026-01-10T00:00:00Z'), 'trialing', 'an incomplete first payment falls back to the trial');
update public.team_billing set comped = true, comp_until = '2026-06-01T00:00:00Z' where team_id = 'a1000000-0000-0000-0000-00000000000a';
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a', '2026-05-31T00:00:00Z'), 'comped', 'comped until a date');
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a', '2026-06-01T00:00:00Z'), 'trial_expired', 'an expired comp reverts to the underlying state');
update public.team_billing set comp_until = null where team_id = 'a1000000-0000-0000-0000-00000000000a';
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a', '2099-01-01T00:00:00Z'), 'comped', 'comped with no end date');

-- Gates: restricted team ---------------------------------------------------------------------------------------------
update public.team_billing set comped = false, comp_until = null, stripe_subscription_id = null, stripe_customer_id = null, stripe_status = null,
  trial_started_at = now() - interval '20 days', trial_ends_at = now() - interval '6 days' where team_id = 'a1000000-0000-0000-0000-00000000000a';
insert into public.payment_events (id, team_id, title, amount_cents, due_at, fee_policy, status, created_by) values
  ('e4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-00000000000a', 'Spring dues', 4500, now() + interval '30 days', 'absorb', 'draft', 'a8888888-8888-8888-8888-888888888888');
insert into public.registration_events (id, team_id, title, slug, status, opens_at, closes_at)
  values ('e2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 'Draft', 'draft-event-aa', 'draft', now(), now() + interval '10 days');
insert into public.join_requests (id, team_id, requester_id) values
  ('d1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'a9999999-9999-9999-9999-999999999999'),
  ('d2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222');

select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a'), 'trial_expired', 'fixture team is restricted');
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select throws_ok($$ select public.publish_payment_event('e4000000-0000-0000-0000-000000000004') $$, 'P0001', 'billing_restricted', 'restricted: publishing a payment event is refused');
select throws_ok($$ select public.publish_registration_event('e2000000-0000-0000-0000-000000000002') $$, 'P0001', 'billing_restricted', 'restricted: publishing a registration event is refused');
select throws_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'parent') $$, 'P0001', 'billing_restricted', 'restricted: creating an invite is refused');
select throws_ok($$ select public.decide_join_request('d1000000-0000-0000-0000-000000000001', true) $$, 'P0001', 'billing_restricted', 'restricted: approving a join request is refused');
select lives_ok($$ select public.decide_join_request('d1000000-0000-0000-0000-000000000001', false) $$, 'restricted: declining a join request still works');
select lives_ok($$ select public.get_team_billing('a1000000-0000-0000-0000-00000000000a') $$, 'restricted: billing itself is never gated');
select lives_ok($$ select public.account_deletion_blockers() $$, 'restricted: account deletion is never gated');
reset role;
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select throws_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'parent') $$, '42501', 'forbidden', 'a parent still gets the normal forbidden, not a billing hint');
reset role;
select pg_temp.login('a9999999-9999-9999-9999-999999999999');
select throws_ok($$ select public.publish_payment_event('e4000000-0000-0000-0000-000000000004') $$, '42501', 'not_authorized', 'a stranger gets not_authorized, not billing state');
reset role;
-- A club-issued event (no team) is never gated.
select lives_ok($$ select private.assert_team_billing_allows(null) $$, 'a null team is never gated');

-- Gates: every allowed state --------------------------------------------------------------------------------------
create function pg_temp.set_facts(sql text) returns void language plpgsql as $f$ begin execute sql; end $f$;
select pg_temp.set_facts($$ update public.team_billing set trial_ends_at = now() + interval '5 days' where team_id = 'a1000000-0000-0000-0000-00000000000a' $$);
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select lives_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'parent') $$, 'trialing: invites allowed');
select throws_ok($$ select public.publish_payment_event('e4000000-0000-0000-0000-000000000004') $$, '23514', 'charges_not_enabled', 'trialing: reaches the original function body');
reset role;
select pg_temp.set_facts($$ update public.team_billing set trial_ends_at = now() - interval '1 day', stripe_subscription_id = 'sub_g1', stripe_customer_id = 'cus_g1', stripe_status = 'past_due', past_due_since = now() - interval '1 day', grace_ends_at = now() + interval '6 days' where team_id = 'a1000000-0000-0000-0000-00000000000a' $$);
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select lives_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'parent') $$, 'grace: invites allowed');
reset role;
select pg_temp.set_facts($$ update public.team_billing set stripe_status = 'active', past_due_since = null, grace_ends_at = null where team_id = 'a1000000-0000-0000-0000-00000000000a' $$);
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select lives_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'parent') $$, 'active: invites allowed');
reset role;
select pg_temp.set_facts($$ update public.team_billing set stripe_subscription_id = null, stripe_status = null, stripe_customer_id = null, comped = true where team_id = 'a1000000-0000-0000-0000-00000000000a' $$);
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select lives_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'parent') $$, 'comped: invites allowed');
reset role;
select pg_temp.set_facts($$ update public.team_billing set comped = false where team_id = 'a1000000-0000-0000-0000-00000000000a' $$);
select private.disable_team_billing('b1111111-1111-1111-1111-111111111111', 'testing the switch');
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select lives_ok($$ select * from public.create_invite('a1000000-0000-0000-0000-00000000000a', null, 'parent') $$, 'billing disabled: a lapsed team is fully active again');
reset role;
select is((select count(*)::int from public.team_billing), (select count(*)::int from public.teams), 'disabling deletes nothing');
select private.set_platform_setting('team_subscription.enabled', 'true'::jsonb, 'b1111111-1111-1111-1111-111111111111', 'back on');

-- Settings: validation, roles, MFA, history, price versions -------------------------------------------------------------
select pg_temp.login('b2222222-2222-2222-2222-222222222222', 'aal1');
select throws_ok($$ select public.admin_set_setting('team_subscription.grace_days', '10'::jsonb, 'longer grace') $$, '42501', 'mfa_required', 'a platform admin on aal1 cannot write');
select lives_ok($$ select public.admin_list_settings() $$, 'a platform admin on aal1 can read settings');
reset role;
select pg_temp.login('b2222222-2222-2222-2222-222222222222', 'aal2');
select lives_ok($$ select public.admin_set_setting('team_subscription.grace_days', '10'::jsonb, 'longer grace') $$, 'admin on aal2 writes a setting');
reset role;
select is(private.setting_int('team_subscription.grace_days'), 10, 'the setting changed');
select is((select count(*)::int from public.platform_setting_history where key = 'team_subscription.grace_days'), 1, 'history row written');
select is((select count(*)::int from public.platform_audit_log where action = 'setting.change' and target_id = 'team_subscription.grace_days'), 1, 'platform audit row written');
select pg_temp.login('b2222222-2222-2222-2222-222222222222', 'aal2');
select throws_ok($$ select public.admin_set_setting('team_subscription.grace_days', '11'::jsonb, '') $$, '22023', 'reason_required', 'a reason is required');
select throws_ok($$ select public.admin_set_setting('team_subscription.grace_days', '99'::jsonb, 'too long') $$, '22023', 'setting_out_of_range', 'bounds are enforced');
select throws_ok($$ select public.admin_set_setting('team_subscription.price_cents', '50'::jsonb, 'too cheap') $$, '22023', 'setting_out_of_range', 'price lower bound');
select throws_ok($$ select public.admin_set_setting('team_subscription.price_cents', '"ten"'::jsonb, 'wrong type') $$, '22023', 'invalid_setting_value', 'type is enforced');
select throws_ok($$ select public.admin_set_setting('no.such.key', '1'::jsonb, 'nope') $$, '22023', 'unknown_setting', 'only defined keys');
select throws_ok($$ select public.admin_set_setting('team_subscription.enabled', 'false'::jsonb, 'owner only') $$, '42501', 'not_authorized', 'an owner-only key needs an owner');
select throws_ok($$ select public.admin_set_setting('team_subscription.trial_reminder_days', '[3, 200]'::jsonb, 'bad array') $$, '22023', 'setting_out_of_range', 'array bounds');
select lives_ok($$ select public.admin_set_setting('team_subscription.trial_reminder_days', '[1, 3, 3, 7]'::jsonb, 'reminders') $$, 'array setting');
reset role;
select is(private.setting_int_array('team_subscription.trial_reminder_days'), array[7, 3, 1], 'array is de-duplicated and ordered');
-- Price change: a new immutable version; the locked version of a paying team is untouched.
reset role;
update public.team_billing set price_version_id = (select id from public.billing_price_versions where amount_cents = 1000),
  stripe_subscription_id = 'sub_p1', stripe_customer_id = 'cus_p1', stripe_status = 'active', current_period_end = now() + interval '20 days'
  where team_id = 'a2000000-0000-0000-0000-00000000000b';
select pg_temp.login('b2222222-2222-2222-2222-222222222222', 'aal2');
select lives_ok($$ select public.admin_set_setting('team_subscription.price_cents', '1500'::jsonb, 'new price') $$, 'price change');
reset role;
select is((select count(*)::int from public.billing_price_versions where amount_cents = 1500), 1, 'the price change created a version');
select is((select v.amount_cents from public.team_billing b join public.billing_price_versions v on v.id = b.price_version_id where b.team_id = 'a2000000-0000-0000-0000-00000000000b'), 1000, 'a paying team keeps its locked price');
select is(private.team_price_cents('a1000000-0000-0000-0000-00000000000a'), 1500, 'a team with no subscription sees the current list price');
select throws_ok($$ update public.billing_price_versions set amount_cents = 2 where amount_cents = 1000 $$, '23514', 'price_version_immutable', 'a version amount can never change');
select throws_ok($$ delete from public.billing_price_versions where amount_cents = 1000 $$, '23514', 'price_version_immutable', 'a version can never be deleted');
select private.set_platform_setting('team_subscription.price_cents', '1000'::jsonb, null, 'back');
select is((select count(*)::int from public.billing_price_versions where amount_cents = 1000), 1, 'an old price reuses its version');
select pg_temp.login('b3333333-3333-3333-3333-333333333333', 'aal2');
select throws_ok($$ select public.admin_set_setting('team_subscription.grace_days', '5'::jsonb, 'support cannot') $$, '42501', 'not_authorized', 'support cannot write settings');
select is(public.platform_admin_role(), 'support', 'support sees its own role');
reset role;
select pg_temp.login('a8888888-8888-8888-8888-888888888888', 'aal2');
select is(public.platform_admin_role(), null::text, 'a team admin is not a platform admin');
select throws_ok($$ select public.admin_set_setting('team_subscription.grace_days', '5'::jsonb, 'no way') $$, '42501', 'not_authorized', 'a team admin cannot write settings');
select throws_ok($$ select public.admin_list_settings() $$, '42501', 'not_authorized', 'a team admin cannot list settings');
select throws_ok($$ select public.admin_billing_metrics() $$, '42501', 'not_authorized', 'a team admin cannot read metrics');
reset role;
select pg_temp.anon();
select throws_ok($$ select public.admin_list_settings() $$, '42501', null, 'anon cannot call admin functions');
reset role;

-- Admin functions ---------------------------------------------------------------------------------------------------------
select pg_temp.login('b2222222-2222-2222-2222-222222222222', 'aal1');
select throws_ok($$ select public.admin_extend_trial('a1000000-0000-0000-0000-00000000000a', now() + interval '10 days', 'goodwill') $$, '42501', 'mfa_required', 'extend trial needs MFA');
select throws_ok($$ select public.admin_comp_team('a1000000-0000-0000-0000-00000000000a', null, 'goodwill') $$, '42501', 'mfa_required', 'comp needs MFA');
reset role;
select pg_temp.login('b3333333-3333-3333-3333-333333333333', 'aal2');
select throws_ok($$ select public.admin_extend_trial('a1000000-0000-0000-0000-00000000000a', now() + interval '10 days', 'goodwill') $$, '42501', 'not_authorized', 'support cannot extend a trial');
select lives_ok($$ select public.admin_billing_metrics() $$, 'support can read metrics');
reset role;
select pg_temp.login('b2222222-2222-2222-2222-222222222222', 'aal2');
select lives_ok($$ select public.admin_extend_trial('a1000000-0000-0000-0000-00000000000a', now() + interval '10 days', 'goodwill') $$, 'admin extends a trial');
select throws_ok($$ select public.admin_extend_trial('a1000000-0000-0000-0000-00000000000a', now() + interval '10 days', null) $$, '22023', 'reason_required', 'a reason is required to extend');
reset role;
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a'), 'trialing', 'extended trial is trialing');
select pg_temp.login('b2222222-2222-2222-2222-222222222222', 'aal2');
select lives_ok($$ select public.admin_comp_team('a1000000-0000-0000-0000-00000000000a', now() + interval '60 days', 'partner') $$, 'comp');
reset role;
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a'), 'comped', 'comped state');
select pg_temp.login('b2222222-2222-2222-2222-222222222222', 'aal2');
select lives_ok($$ select public.admin_clear_comp('a1000000-0000-0000-0000-00000000000a', 'ended') $$, 'clear comp');
reset role;
select is((select count(*)::int from public.platform_audit_log where action in ('billing.extend_trial', 'billing.comp', 'billing.clear_comp')), 3, 'each admin write is in the platform audit');
select is((select count(*)::int from public.audit_log where action like 'billing.%' and team_id = 'a1000000-0000-0000-0000-00000000000a' and actor_id = 'b2222222-2222-2222-2222-222222222222'), 0, 'admin actions never reach the team-readable audit log');
select pg_temp.login('b2222222-2222-2222-2222-222222222222', 'aal2');
select is((public.admin_list_team_billing(null, null, 1, null) -> 'items' -> 0 ->> 'team_id') is not null, true, 'list page 1');
select isnt(public.admin_list_team_billing(null, null, 1, null) -> 'next_cursor', 'null'::jsonb, 'list has a next cursor');
select is(jsonb_array_length(public.admin_list_team_billing(null, null, 1, public.admin_list_team_billing(null, null, 1, null) -> 'next_cursor') -> 'items'), 1, 'list page 2 via keyset cursor');
select is(jsonb_array_length(public.admin_list_team_billing(null, 'billing test alpha', 10, null) -> 'items'), 1, 'search by team name');
select is(public.admin_get_team_billing('a1000000-0000-0000-0000-00000000000a') ->> 'state', 'trialing', 'admin_get_team_billing state');
select is((public.admin_billing_metrics() ->> 'mrr_cents')::int, 1000, 'MRR is the sum of locked prices of paying teams');
reset role;

-- Client reads: who sees what ---------------------------------------------------------------------------------------------
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select is(public.get_team_billing('a1000000-0000-0000-0000-00000000000a') ->> 'can_manage', 'true', 'admin can manage');
select ok(public.get_team_billing('a1000000-0000-0000-0000-00000000000a') ? 'price_cents', 'admin sees the price');
select is((public.get_team_billing('a1000000-0000-0000-0000-00000000000a') ->> 'subscription_live')::boolean, false, 'a team in its trial has no live subscription');
reset role;
select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select is(public.get_team_billing('a1000000-0000-0000-0000-00000000000a') ->> 'state', 'trialing', 'coach sees the status');
select ok(not (public.get_team_billing('a1000000-0000-0000-0000-00000000000a') ? 'price_cents'), 'coach sees no price');
select ok(not (public.get_team_billing('a1000000-0000-0000-0000-00000000000a') ? 'has_subscription'), 'coach sees no subscription details');
select ok(not (public.get_team_billing('a1000000-0000-0000-0000-00000000000a') ? 'subscription_live'), 'coach sees no subscription_live');
reset role;
select pg_temp.login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(public.get_team_billing('a1000000-0000-0000-0000-00000000000a') ->> 'can_manage', 'false', 'manager cannot manage');
reset role;
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is(public.get_team_billing('a1000000-0000-0000-0000-00000000000a'), null::jsonb, 'a parent sees nothing');
reset role;
select pg_temp.login('a9999999-9999-9999-9999-999999999999');
select is(public.get_team_billing('a1000000-0000-0000-0000-00000000000a'), null::jsonb, 'a stranger sees nothing');
reset role;
select pg_temp.login('abababab-abab-abab-abab-abababababab');
select is(public.get_team_billing('a1000000-0000-0000-0000-00000000000a'), null::jsonb, 'another team''s admin sees nothing');
reset role;
select pg_temp.anon();
select throws_ok($$ select public.get_team_billing('a1000000-0000-0000-0000-00000000000a') $$, '42501', null, 'anon cannot call get_team_billing');
reset role;
select is(public.svc_upsert_billing_invoice('a1000000-0000-0000-0000-00000000000a', '{"id":"in_a1","number":"A-1","status":"paid","amount_due":1000,"amount_paid":1000,"currency":"usd","created":"2026-02-01T00:00:00Z"}'::jsonb), 'applied', 'invoice upsert');
select is(public.svc_upsert_billing_invoice('a2000000-0000-0000-0000-00000000000b', '{"id":"in_b1","number":"B-1","status":"open","amount_due":1000,"amount_paid":0,"currency":"usd","created":"2026-02-02T00:00:00Z"}'::jsonb), 'applied', 'invoice upsert for team B');
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select is((select count(*)::int from public.get_team_billing_invoices('a1000000-0000-0000-0000-00000000000a')), 1, 'admin A sees team A''s invoice');
select is((select count(*)::int from public.get_team_billing_invoices('a2000000-0000-0000-0000-00000000000b')), 0, 'admin A sees none of team B''s invoices');
reset role;
select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.get_team_billing_invoices('a1000000-0000-0000-0000-00000000000a')), 0, 'a coach sees no invoices');
reset role;
insert into public.team_memberships (team_id, profile_id, role) values ('a1000000-0000-0000-0000-00000000000a', 'acacacac-acac-acac-acac-acacacacacac', 'admin');
update public.team_memberships set status = 'inactive' where profile_id = 'a8888888-8888-8888-8888-888888888888' and team_id = 'a1000000-0000-0000-0000-00000000000a';
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select is(public.get_team_billing('a1000000-0000-0000-0000-00000000000a'), null::jsonb, 'a removed admin sees nothing');
reset role;
update public.team_memberships set status = 'active' where profile_id = 'a8888888-8888-8888-8888-888888888888' and team_id = 'a1000000-0000-0000-0000-00000000000a';
delete from public.team_memberships where profile_id = 'acacacac-acac-acac-acac-acacacacacac' and team_id = 'a1000000-0000-0000-0000-00000000000a';

-- Billing terms ------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a2222222-2222-2222-2222-222222222222');
select is((public.get_billing_terms() ->> 'price_cents')::int, 1000, 'terms come from settings');
select ok(not (public.get_billing_terms() ? 'stripe_price_id'), 'terms carry no Stripe ids');
reset role;

-- Snapshots ---------------------------------------------------------------------------------------------------------------------
update public.team_billing set stripe_subscription_id = null, stripe_customer_id = null, stripe_status = null, price_version_id = null,
  current_period_end = null, trial_ends_at = now() + interval '5 days' where team_id = 'a1000000-0000-0000-0000-00000000000a';
create function pg_temp.snap(status text, at timestamptz, cancel boolean default false) returns text language sql as $f$
  select public.svc_apply_subscription_snapshot('a1000000-0000-0000-0000-00000000000a', jsonb_build_object(
    'subscription_id', 'sub_snap1', 'customer_id', 'cus_snap1', 'status', status, 'current_period_end', (at + interval '30 days')::text,
    'cancel_at_period_end', cancel, 'price_version_id', (select id from public.billing_price_versions where amount_cents = 1000),
    'unit_amount', 1000, 'currency', 'usd', 'subscribed_by', 'a8888888-8888-8888-8888-888888888888'), at);
$f$;
select is(pg_temp.snap('trialing', now() - interval '3 hours'), 'applied', 'first snapshot applies');
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a'), 'active', 'subscribing during the trial: active');
select is((select v.amount_cents from public.team_billing b join public.billing_price_versions v on v.id = b.price_version_id where b.team_id = 'a1000000-0000-0000-0000-00000000000a'), 1000, 'the signup price is locked');
select is((select subscribed_by from public.team_billing where team_id = 'a1000000-0000-0000-0000-00000000000a'), 'a8888888-8888-8888-8888-888888888888'::uuid, 'who subscribed is recorded');
select is(pg_temp.snap('past_due', now() - interval '2 hours'), 'applied', 'past_due snapshot');
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a'), 'past_due', 'past_due state');
select is((select grace_ends_at - past_due_since from public.team_billing where team_id = 'a1000000-0000-0000-0000-00000000000a'), make_interval(days => private.setting_int('team_subscription.grace_days')), 'grace length comes from the setting');
select is(pg_temp.snap('active', now() - interval '4 hours'), 'stale', 'an older snapshot never overwrites a newer one');
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a'), 'past_due', 'state unchanged by the stale snapshot');
select is(pg_temp.snap('past_due', now() - interval '1 hour'), 'applied', 'a repeated failure snapshot is idempotent');
select is((select count(*)::int from public.team_billing_notices where team_id = 'a1000000-0000-0000-0000-00000000000a' and notice_key like 'failed:%'), 1, 'one payment_failed notice, not two');
select is(pg_temp.snap('active', now()), 'applied', 'recovery snapshot');
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a'), 'active', 'recovered to active');
select is((select past_due_since from public.team_billing where team_id = 'a1000000-0000-0000-0000-00000000000a'), null, 'recovery clears the grace clock');
select is(pg_temp.snap('active', now() + interval '1 minute', true), 'applied', 'cancel snapshot');
select is(private.team_billing_state('a1000000-0000-0000-0000-00000000000a'), 'cancel_scheduled', 'cancel scheduled');
select is(public.svc_apply_subscription_snapshot('a9990000-0000-0000-0000-000000000000', '{"status":"active"}'::jsonb, now()), 'unknown_team', 'unknown team is ignored, never created');
select is(public.svc_apply_subscription_snapshot('a1000000-0000-0000-0000-00000000000a', '{"subscription_id":"sub_snap1","customer_id":"cus_other","status":"active"}'::jsonb, now() + interval '2 minutes'), 'customer_mismatch', 'a different customer is refused');
select is(public.svc_apply_subscription_snapshot('a1000000-0000-0000-0000-00000000000a', jsonb_build_object('subscription_id', 'sub_snap1', 'customer_id', 'cus_snap1', 'status', 'active',
  'price_version_id', (select id from public.billing_price_versions where amount_cents = 1000), 'unit_amount', 999, 'currency', 'usd'), now() + interval '3 minutes'), 'applied', 'mismatching price snapshot still applies');
select is((select price_mismatch from public.team_billing where team_id = 'a1000000-0000-0000-0000-00000000000a'), true, 'a price mismatch is flagged');
select is(public.svc_billing_resolve_team('a1000000-0000-0000-0000-00000000000a', 'cus_other'), null::uuid, 'resolving with another customer is refused');
select is(public.svc_billing_team_by_customer('cus_snap1'), 'a1000000-0000-0000-0000-00000000000a'::uuid, 'team by customer');

-- Sweep: notices once, to the right people -----------------------------------------------------------------------------------------
update public.team_billing set stripe_subscription_id = null, stripe_customer_id = null, stripe_status = null, cancel_at_period_end = false,
  trial_started_at = now() - interval '12 days', trial_ends_at = now() + interval '2 days'
  where team_id = 'a1000000-0000-0000-0000-00000000000a';
select private.set_platform_setting('team_subscription.trial_reminder_days', '[3, 1]'::jsonb, null, 'reset reminders');
select ok(private.billing_sweep() > 0, 'the sweep sends notices');
select is((select count(*)::int from public.notification_outbox where category = 'billing' and profile_id = 'a8888888-8888-8888-8888-888888888888' and channel = 'in_app'
           and payload ->> 'change' = 'trial_ending'), 1, 'the trial reminder reaches the admin once');
select is((select count(*)::int from public.notification_outbox where category = 'billing' and profile_id = 'a1111111-1111-1111-1111-111111111111'), 0, 'coaches get no trial notices');
select is(private.billing_sweep(), 0, 'a second sweep repeats nothing');
update public.team_billing set trial_ends_at = now() - interval '1 hour' where team_id = 'a1000000-0000-0000-0000-00000000000a';
select ok(private.billing_sweep() > 0, 'the sweep sends the trial-ended notices');
select is((select count(*)::int from public.notification_outbox where category = 'billing' and profile_id = 'a1111111-1111-1111-1111-111111111111' and channel = 'in_app'), 1, 'coaches get only the restricted notice');
select ok((select payload ->> 'body' from public.notification_outbox where category = 'billing' and profile_id = 'a1111111-1111-1111-1111-111111111111' and channel = 'in_app') ilike '%ask a team admin%', 'the staff notice says to ask an admin');
select ok(not exists (select 1 from public.notification_outbox where category = 'billing' and profile_id = 'a1111111-1111-1111-1111-111111111111' and payload ->> 'body' ~ '[$][0-9]'), 'the staff notice carries no amounts');
select is((select count(*)::int from public.notification_outbox where category = 'billing' and profile_id = 'a2222222-2222-2222-2222-222222222222'), 0, 'parents never get billing notices');
select is(private.billing_sweep(), 0, 'sweep is idempotent after the restricted notices');

-- Account deletion blockers -----------------------------------------------------------------------------------------------------------
update public.team_billing set stripe_subscription_id = 'sub_del1', stripe_customer_id = 'cus_del1', stripe_status = 'active', current_period_end = now() + interval '10 days'
  where team_id = 'a1000000-0000-0000-0000-00000000000a';
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select is(jsonb_array_length(public.account_deletion_blockers() -> 'subscriptions'), 1, 'the only admin of a paying team is blocked with the subscription reason');
reset role;
insert into public.team_memberships (team_id, profile_id, role) values ('a1000000-0000-0000-0000-00000000000a', 'acacacac-acac-acac-acac-acacacacacac', 'admin');
select pg_temp.login('a8888888-8888-8888-8888-888888888888');
select is(jsonb_array_length(public.account_deletion_blockers() -> 'subscriptions'), 0, 'with another admin the subscription blocker clears');
reset role;

-- Notices go to ALL current admins ------------------------------------------------------------------------------------------------------
select is(public.svc_billing_notify('a1000000-0000-0000-0000-00000000000a', 'payment_action_required', 'sca:test1'), true, 'authentication notice');
select is((select count(*)::int from public.notification_outbox where category = 'billing' and channel = 'in_app' and payload ->> 'change' = 'payment_action_required'), 2, 'the notice reaches both admins');
select is(public.svc_billing_notify('a1000000-0000-0000-0000-00000000000a', 'payment_action_required', 'sca:test1'), false, 'the same key is not sent twice');

select * from finish();
rollback;
