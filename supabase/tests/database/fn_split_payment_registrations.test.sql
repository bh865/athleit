-- Split payments step 3: registration events (plan terms, deadline, hold rule, decline, balance flags).
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create function pg_temp.login(u uuid) returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true); end $f$;

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'admin@example.test'), ('a4444444-4444-4444-4444-444444444444', 'parent@example.test'),
  ('a8888888-8888-8888-8888-888888888888', 'parent2@example.test');
insert into public.teams (id, name, sport, season_label, join_code) values ('a1000000-0000-0000-0000-00000000000a', 'Team A', 'soccer', 'Fall', 'TEAMA00001');
insert into public.team_memberships (team_id, profile_id, role) values ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'admin');
insert into public.households (id, name) values ('11000000-0000-0000-0000-000000000001', 'P fam'), ('22000000-0000-0000-0000-000000000002', 'P2 fam');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a4444444-4444-4444-4444-444444444444'), ('22000000-0000-0000-0000-000000000002', 'a8888888-8888-8888-8888-888888888888');
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '10 years'),
  ('92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'Pia', 'Park', current_date - interval '9 years');
insert into public.connected_accounts (id, team_id, stripe_account_id, details_submitted, charges_enabled, payouts_enabled, onboarding_status) values
  ('ca000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'acct_TestTeamA', true, true, true, 'ready');
insert into public.forms (id, team_id, name) values ('f1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'Season form');
insert into public.form_versions (id, form_id, version, schema, published_by) values
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 1, '{"fields":[{"id":"shirt","type":"dropdown","label":"Shirt size","options":[{"value":"s","label":"S"},{"value":"m","label":"M"}],"required":true}]}', 'a1111111-1111-1111-1111-111111111111');
insert into public.registration_events (id, team_id, title, slug, kind, status, form_version_id, opens_at, closes_at, created_by, starts_on,
    price_cents, payment_timing, payment_hold_minutes)
  values ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'Fall season', 'fall-season-2026', 'season', 'open',
    'f2000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '30 days', 'a1111111-1111-1111-1111-111111111111',
    current_date + 60, 3000, 'at_submission', 60);
create function pg_temp.settle(p_pi text, j jsonb) returns text language sql as $f$
  select public.svc_payment_succeeded(p_pi, (j ->> 'payment_id')::uuid, 'ch_' || p_pi, 10, (j ->> 'total_cents')::int, 'usd', 'acct_TestTeamA', (j ->> 'application_fee_cents')::int) $f$;

-- Plan terms on the registration event ---------------------------------------------------------------------------------
select pg_temp.login('a4444444-4444-4444-4444-444444444444');
select throws_ok($$ select public.set_registration_event_plan('e1000000-0000-0000-0000-000000000001', array[1,2,3], 'weekly', 'event_start') $$, '42501', 'not_authorized', 'a parent cannot set plan terms');
reset role;
select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select throws_ok($$ select public.set_registration_event_plan('e1000000-0000-0000-0000-000000000001', array[9], 'weekly') $$, '22023', 'invalid_plan_options', 'invalid options are refused');
select throws_ok($$ select public.set_registration_event_plan('e1000000-0000-0000-0000-000000000001', array[1,2], 'weekly', 'someday') $$, '22023', 'invalid_balance_rule', 'invalid balance rule is refused');
select lives_ok($$ select public.set_registration_event_plan('e1000000-0000-0000-0000-000000000001', array[3,1,2], 'weekly', 'event_start') $$, 'staff set the plan terms');
reset role;
select is((select plan_options from public.registration_events where id = 'e1000000-0000-0000-0000-000000000001'), array[1,2,3], 'options stored sorted');
select throws_ok($$ update public.registration_events set price_cents = null, payment_timing = 'none' where id = 'e1000000-0000-0000-0000-000000000001' $$, '23514', null, 'a free event cannot offer plans');

-- Registrations: the payment request is created, with the plan terms copied into the payment event ---------------------
insert into public.registrations (id, registration_event_id, display_id, submitted_by, household_id, player_id, guardian_name, guardian_email,
    guardian_relationship, player_first_name, player_last_name, player_date_of_birth, form_version_id, answers, status)
  values
  ('d1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), 'a4444444-4444-4444-4444-444444444444',
    '11000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Pat Parent', 'pat@example.test', 'Mother', 'Ava', 'Adams', current_date - interval '10 years',
    'f2000000-0000-0000-0000-000000000001', '{"shirt":"s"}', 'submitted'),
  ('d2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', private.next_registration_display_id(), 'a8888888-8888-8888-8888-888888888888',
    '22000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000002', 'Paula Parent', 'paula@example.test', 'Mother', 'Pia', 'Park', current_date - interval '9 years',
    'f2000000-0000-0000-0000-000000000001', '{"shirt":"m"}', 'submitted');
select is((select plan_options::text || plan_cadence from public.payment_events where registration_event_id = 'e1000000-0000-0000-0000-000000000001'), '{1,2,3}weekly', 'the payment event carries the plan terms');
select isnt((select payment_request_id from public.registrations where id = 'd1000000-0000-0000-0000-000000000001'), null, 'a request exists for the registration');
select throws_ok($$ update public.registration_events set plan_options = array[1] where id = 'e1000000-0000-0000-0000-000000000001' $$, '23514', 'terms_locked', 'plan terms lock once registrations exist');
select throws_ok($$ update public.registration_events set require_full_balance = 'none' where id = 'e1000000-0000-0000-0000-000000000001' $$, '23514', 'terms_locked', 'so does the balance rule');

-- The plan must finish by the registration deadline (earlier when the full balance is required before the event) ---------
create temp table req1 as select payment_request_id as id from public.registrations where id = 'd1000000-0000-0000-0000-000000000001';
grant select on req1 to public;
select pg_temp.login('a4444444-4444-4444-4444-444444444444');
select is(public.payer_plan_quote((select id from req1)) -> 'sizes', '[1,2,3]'::jsonb, 'with 60 days to the event, all sizes fit');
reset role;
update public.registration_events set starts_on = current_date + 10 where id = 'e1000000-0000-0000-0000-000000000001';
select pg_temp.login('a4444444-4444-4444-4444-444444444444');
select is(public.payer_plan_quote((select id from req1)) -> 'sizes', '[1,2]'::jsonb, 'with 10 days to the event and the balance required before it, weekly x3 no longer fits');
reset role;
update public.registration_events set starts_on = current_date + 60 where id = 'e1000000-0000-0000-0000-000000000001';

-- The deadline does not depend on the session time zone.
update public.registration_events set starts_on = current_date + 14 where id = 'e1000000-0000-0000-0000-000000000001';
set local timezone = 'Pacific/Kiritimati';
select pg_temp.login('a4444444-4444-4444-4444-444444444444');
create temp table tz1 as select public.payer_plan_quote((select id from req1)) -> 'sizes' as sizes;
reset role;
set local timezone = 'Pacific/Pago_Pago';
select pg_temp.login('a4444444-4444-4444-4444-444444444444');
select is(public.payer_plan_quote((select id from req1)) -> 'sizes', (select sizes from tz1), 'the same sizes are offered from the far east and the far west');
reset role;
set local timezone = 'UTC';
update public.registration_events set starts_on = current_date + 60 where id = 'e1000000-0000-0000-0000-000000000001';

-- Installment 1 satisfies the spot hold --------------------------------------------------------------------------------
select isnt((select hold_expires_at from public.registrations where id = 'd1000000-0000-0000-0000-000000000001'), null, 'the spot is held until paid');
create temp table p1 as select public.svc_reserve_plan('a4444444-4444-4444-4444-444444444444', (select id from req1), 3, false, 'v1') as j;
select throws_ok($$ update public.registrations set status = 'accepted' where id = 'd1000000-0000-0000-0000-000000000001' $$, '23514', 'payment_required', 'not accepted while nothing is paid');
select pg_temp.settle('pi_reg1', (select j from p1));
select is((select status from public.payment_requests where id = (select id from req1)), 'partially_paid', 'installment 1 paid -> partially paid');
select is((select hold_expires_at from public.registrations where id = 'd1000000-0000-0000-0000-000000000001'), null, 'the hold is lifted');
select lives_ok($$ update public.registrations set status = 'accepted' where id = 'd1000000-0000-0000-0000-000000000001' $$, 'the registration can be accepted with the remaining installments still to come');
select throws_ok($$ update public.registrations set status = 'accepted' where id = 'd2000000-0000-0000-0000-000000000002' $$, '23514', 'payment_required', 'an unpaid registration still cannot');

-- Balance flags for staff ----------------------------------------------------------------------------------------------
select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select is((select balance_cents from public.registration_balances('e1000000-0000-0000-0000-000000000001') where registration_id = 'd1000000-0000-0000-0000-000000000001'), 2000::bigint, 'registration list: $20.00 still to pay on the plan');
select is((select installments_paid from public.registration_balances('e1000000-0000-0000-0000-000000000001') where registration_id = 'd1000000-0000-0000-0000-000000000001'), 1, 'one installment paid');
select is((select balance_required from public.registration_balances('e1000000-0000-0000-0000-000000000001') where registration_id = 'd1000000-0000-0000-0000-000000000001'), true, 'flagged: full balance required before the event');
select is((select balance_cents from public.registration_balances('e1000000-0000-0000-0000-000000000001') where registration_id = 'd2000000-0000-0000-0000-000000000002'), 3000::bigint, 'an unpaid single payment counts in full');
select is((select balance_cents from public.team_player_balances('a1000000-0000-0000-0000-00000000000a') where player_id = '91000000-0000-0000-0000-000000000001'), 2000::bigint, 'roster: the same balance by player');
reset role;
select pg_temp.login('a4444444-4444-4444-4444-444444444444');
select is((select count(*)::int from public.registration_balances('e1000000-0000-0000-0000-000000000001')), 0, 'a parent sees no balances');
select is((select count(*)::int from public.team_player_balances('a1000000-0000-0000-0000-00000000000a')), 0, 'nor the roster balances');
reset role;

-- Declining stops what is still owed and leaves the paid installment for a refund ------------------------------------------
update public.registrations set status = 'declined', decision_note = 'Full' where id = 'd1000000-0000-0000-0000-000000000001';
select is((select array_agg(status order by sequence) from public.payment_request_installments where request_id = (select id from req1)), array['paid', 'cancelled', 'cancelled'], 'open installments cancelled, the paid one stays');
select is((select status from public.payment_requests where id = (select id from req1)), 'cancelled', 'the request follows');
select pg_temp.login('a1111111-1111-1111-1111-111111111111');
select is((select refundable from public.registration_payment_status('d1000000-0000-0000-0000-000000000001')), true, 'a declined registration with a paid installment is offered a refund');
reset role;
-- An expired hold withdraws an unpaid registration and cancels its request.
update public.registrations set hold_expires_at = now() - interval '1 hour' where id = 'd2000000-0000-0000-0000-000000000002';
select is(private.expire_registration_holds(), 1, 'one expired hold');
select is((select status from public.registrations where id = 'd2000000-0000-0000-0000-000000000002'), 'withdrawn', 'withdrawn');
select * from finish();
rollback;
