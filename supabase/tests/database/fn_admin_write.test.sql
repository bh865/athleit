-- Admin portal writes: aal2 required, role matrix, 10 character reasons, audit rows, last owner, audited reveal.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create function pg_temp.login(u uuid, p_aal text default 'aal2') returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true); end $f$;

insert into auth.users (id, email) values
  ('c5000000-0000-0000-0000-000000000001', 'plain@example.test'),
  ('c5000000-0000-0000-0000-000000000002', 'support3@example.test'),
  ('c5000000-0000-0000-0000-000000000003', 'admin3@example.test'),
  ('c5000000-0000-0000-0000-000000000004', 'owner3@example.test'),
  ('c5000000-0000-0000-0000-000000000005', 'newadmin@example.test');
delete from public.platform_admins;
insert into public.platform_admins (profile_id, role) values
  ('c5000000-0000-0000-0000-000000000002', 'support'),
  ('c5000000-0000-0000-0000-000000000003', 'admin'),
  ('c5000000-0000-0000-0000-000000000004', 'owner');
insert into public.teams (id, name, sport, season_label, join_code) values
  ('c6000000-0000-0000-0000-000000000001', 'Report FC', 'soccer', '2026', 'REPORTFC01');
insert into public.threads (id, team_id, type, title) values ('c7000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'group', 'G');
insert into public.messages (id, thread_id, sender_profile_id, body) values
  ('c8000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'the reported words');
insert into public.message_reports (id, message_id, reporter_profile_id, reason) values
  ('c9000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000005', 'rude'),
  ('c9000000-0000-0000-0000-000000000002', 'c8000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000003', 'spam');

-- aal1 is refused on every write ----------------------------------------------------------------------------
select pg_temp.login('c5000000-0000-0000-0000-000000000004', 'aal1');
select throws_ok($$ select public.admin_set_fee_config(50, 100, 290, 30, true, false, true, false, 'a long enough reason') $$, '42501', 'mfa_required', 'fee config needs aal2');
select throws_ok($$ select public.admin_enable_team_billing('a long enough reason') $$, '42501', 'mfa_required', 'enable billing needs aal2');
select throws_ok($$ select public.admin_add_admin('newadmin@example.test', 'support', 'a long enough reason') $$, '42501', 'mfa_required', 'add admin needs aal2');
select throws_ok($$ select public.admin_reveal_reported_message('c9000000-0000-0000-0000-000000000001', 'a long enough reason') $$, '42501', 'mfa_required', 'reveal needs aal2');
select throws_ok($$ select public.admin_add_support_note('team', 'c6000000-0000-0000-0000-000000000001', 'hello') $$, '42501', 'mfa_required', 'notes need aal2');
reset role;

-- Roles ---------------------------------------------------------------------------------------------------------
select pg_temp.login('c5000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.admin_add_support_note('team', 'c6000000-0000-0000-0000-000000000001', 'hello') $$, '42501', 'not_authorized', 'ordinary user: not authorized');
reset role;
select pg_temp.login('c5000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.admin_reveal_reported_message('c9000000-0000-0000-0000-000000000001', 'a long enough reason') $$, '42501', 'not_authorized', 'support cannot reveal');
select throws_ok($$ select public.admin_set_fee_config(50, 100, 290, 30, true, false, true, false, 'a long enough reason') $$, '42501', 'not_authorized', 'support cannot change fees');
select throws_ok($$ select public.admin_review_message_report('c9000000-0000-0000-0000-000000000001', 'dismiss', 'short') $$, '22023', 'reason_required', 'reason too short is refused');
select lives_ok($$ select public.admin_review_message_report('c9000000-0000-0000-0000-000000000001', 'dismiss', 'Not abusive on review') $$, 'support dismisses a report');
select throws_ok($$ select public.admin_review_message_report('c9000000-0000-0000-0000-000000000001', 'dismiss', 'Not abusive on review') $$, '22023', 'report_not_open', 'a closed report cannot be reviewed again');
select lives_ok($$ select public.admin_add_support_note('team', 'c6000000-0000-0000-0000-000000000001', 'Called the coach about billing') $$, 'support adds a note');
reset role;
select pg_temp.login('c5000000-0000-0000-0000-000000000003');
select throws_ok($$ select public.admin_enable_team_billing('a long enough reason') $$, '42501', 'not_authorized', 'admin cannot turn team billing on');
select throws_ok($$ select public.admin_add_admin('newadmin@example.test', 'support', 'a long enough reason') $$, '42501', 'not_authorized', 'admin cannot add admins');
select is((public.admin_reveal_reported_message('c9000000-0000-0000-0000-000000000002', 'Investigating a spam complaint') ->> 'body'), 'the reported words', 'admin reveals only the reported message');
select lives_ok($$ select public.admin_set_sport_config('soccer', 'half', 2::smallint, 40::smallint, true, array['GK','DEF','MID','FWD'], 'Goals', 'Match league rules for 2026') $$, 'admin edits a sport config');
select throws_ok($$ select public.admin_set_sport_config('soccer', 'half', 99::smallint, 40::smallint, true, array['GK'], 'Goals', 'Match league rules for 2026') $$, '23514', null, 'out of range sport config values are refused');
reset role;

-- Owner ---------------------------------------------------------------------------------------------------------
select pg_temp.login('c5000000-0000-0000-0000-000000000004');
select is((public.admin_fee_config_impact(50, 100) -> 'proposed' ->> 'on_10000')::int, 150, 'impact preview: $0.50 + 100 bps on $100.00 is $1.50');
select lives_ok($$ select public.admin_set_fee_config(50, 100, 290, 30, true, false, true, false, 'Launch pricing agreed') $$, 'owner changes the fee config');
select lives_ok($$ select public.admin_enable_team_billing('Launching team subscriptions') $$, 'owner turns team billing on');
select throws_ok($$ select public.admin_enable_team_billing('Launching team subscriptions') $$, '22023', 'already_enabled', 'cannot turn it on twice');
select lives_ok($$ select public.admin_add_admin('newadmin@example.test', 'support', 'New support hire') $$, 'owner adds an admin');
select throws_ok($$ select public.admin_add_admin('nobody@example.test', 'support', 'New support hire') $$, 'P0002', 'user_not_found', 'unknown email is refused');
select throws_ok($$ select public.admin_set_admin_role('c5000000-0000-0000-0000-000000000004', 'admin', 'Stepping down myself') $$, '23514', 'last_owner', 'the last owner cannot be demoted');
select throws_ok($$ select public.admin_remove_admin('c5000000-0000-0000-0000-000000000004', 'Leaving the company') $$, '23514', 'last_owner', 'the last owner cannot be removed');
select lives_ok($$ select public.admin_set_admin_role('c5000000-0000-0000-0000-000000000003', 'owner', 'Second owner for cover') $$, 'a second owner can be added');
select lives_ok($$ select public.admin_remove_admin('c5000000-0000-0000-0000-000000000004', 'Leaving the company') $$, 'with two owners one can leave');
reset role;

-- Audit: before, after and reason on every write -------------------------------------------------------------------------
select is((select count(*)::int from public.platform_audit_log where action = 'report.reveal' and reason = 'Investigating a spam complaint' and actor_id = 'c5000000-0000-0000-0000-000000000003'), 1, 'reveal is audited with actor, report and reason');
select is((select after ->> 'message_id' from public.platform_audit_log where action = 'report.reveal'), 'c8000000-0000-0000-0000-000000000001', 'the reveal audit row names the message');
select ok((select before is not null and after is not null from public.platform_audit_log where action = 'sport_config.change'), 'sport config audit has before and after');
select ok((select before is not null and after is not null from public.platform_audit_log where action = 'fee_config.change'), 'fee config audit has before and after');
select is((select (after ->> 'teams_backfilled')::int >= 1 from public.platform_audit_log where action = 'billing.enabled'), true, 'enabling billing audits the affected team count');
select is((select count(*)::int from public.platform_audit_log where action in ('admin.add', 'admin.set_role', 'admin.remove')), 3, 'admin management is audited');

-- Maintenance banner is an ordinary setting -----------------------------------------------------------------------------------
select pg_temp.login('c5000000-0000-0000-0000-000000000003');
select is(public.get_platform_banner(), null, 'no banner by default');
select lives_ok($$ select public.admin_set_setting('platform.maintenance_banner', '"Back at 3pm"'::jsonb, 'Planned maintenance window') $$, 'admin sets the banner text');
select lives_ok($$ select public.admin_set_setting('platform.maintenance_banner_enabled', 'true'::jsonb, 'Planned maintenance window') $$, 'admin turns the banner on');
select is(public.get_platform_banner(), 'Back at 3pm', 'the banner is readable');
reset role;

select * from finish();
rollback;
