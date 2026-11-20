-- Admin portal read functions: role matrix (anon, ordinary user, support, admin, owner), limits, no message bodies.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create function pg_temp.login(u uuid, p_aal text default 'aal1') returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true); end $f$;
create function pg_temp.anon() returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true); end $f$;

insert into auth.users (id, email) values
  ('c1000000-0000-0000-0000-000000000001', 'plain@example.test'),
  ('c1000000-0000-0000-0000-000000000002', 'support@example.test'),
  ('c1000000-0000-0000-0000-000000000003', 'admin@example.test'),
  ('c1000000-0000-0000-0000-000000000004', 'owner@example.test');
insert into public.platform_admins (profile_id, role) values
  ('c1000000-0000-0000-0000-000000000002', 'support'),
  ('c1000000-0000-0000-0000-000000000003', 'admin'),
  ('c1000000-0000-0000-0000-000000000004', 'owner');
insert into public.teams (id, name, sport, season_label, join_code) values
  ('c2000000-0000-0000-0000-000000000001', 'Admin Read FC', 'soccer', '2026', 'ADMINREAD1');

-- Anon and ordinary users: every read refuses ---------------------------------------------------------
select pg_temp.anon();
select throws_ok($$ select public.admin_platform_metrics() $$, null, null, 'anon: platform metrics refused');
reset role;
select pg_temp.login('c1000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.admin_platform_metrics() $$, '42501', 'not_authorized', 'ordinary user: platform metrics refused');
select throws_ok($$ select public.admin_list_audit() $$, '42501', 'not_authorized', 'ordinary user: audit refused');
select throws_ok($$ select public.admin_list_admins() $$, '42501', 'not_authorized', 'ordinary user: admins refused');
reset role;

-- Support: Overview, teams, clubs, reports, audit; not money, platform health or admins --------------
select pg_temp.login('c1000000-0000-0000-0000-000000000002');
select lives_ok($$ select public.admin_platform_metrics('30d', 'week') $$, 'support reads platform metrics');
select lives_ok($$ select public.admin_list_teams(null, 25, null) $$, 'support lists teams');
select is((select jsonb_array_length(public.admin_list_teams('Admin Read', 25, null) -> 'items')), 1, 'team search finds the fixture');
select lives_ok($$ select public.admin_get_team('c2000000-0000-0000-0000-000000000001') $$, 'support reads a team');
select lives_ok($$ select public.admin_list_message_reports('open', 25, null) $$, 'support reads reports');
select lives_ok($$ select public.admin_list_escalations() $$, 'support reads escalations');
select lives_ok($$ select public.admin_list_audit('{}', 25, null) $$, 'support reads audit');
select lives_ok($$ select public.admin_billing_snapshots('90d') $$, 'support reads snapshots');
select throws_ok($$ select public.admin_payment_metrics() $$, '42501', 'not_authorized', 'support cannot read payment metrics');
select throws_ok($$ select public.admin_connect_funnel() $$, '42501', 'not_authorized', 'support cannot read the Connect funnel');
select throws_ok($$ select public.admin_list_team_payments('c2000000-0000-0000-0000-000000000001') $$, '42501', 'not_authorized', 'support cannot read team payments');
select throws_ok($$ select public.admin_list_jobs() $$, '42501', 'not_authorized', 'support cannot read jobs');
select throws_ok($$ select public.admin_list_webhook_events() $$, '42501', 'not_authorized', 'support cannot read the webhook ledger');
select throws_ok($$ select public.admin_list_admins() $$, '42501', 'not_authorized', 'support cannot list admins');
select throws_ok($$ select public.admin_platform_metrics('5y', 'week') $$, '22023', 'invalid_range', 'an unknown range is refused');
select throws_ok($$ select public.admin_platform_metrics('30d', 'year') $$, '22023', 'invalid_bucket', 'an unknown bucket is refused');
reset role;

-- Admin: money and platform health; still not admins --------------------------------------------------
select pg_temp.login('c1000000-0000-0000-0000-000000000003');
select lives_ok($$ select public.admin_payment_metrics('30d', 'week') $$, 'admin reads payment metrics');
select lives_ok($$ select public.admin_connect_funnel() $$, 'admin reads the Connect funnel');
select lives_ok($$ select public.admin_notification_metrics('7d') $$, 'admin reads notification metrics');
select lives_ok($$ select public.admin_webhook_metrics('7d') $$, 'admin reads webhook metrics');
select lives_ok($$ select public.admin_rate_limit_metrics('7d') $$, 'admin reads rate limit metrics');
select lives_ok($$ select public.admin_list_jobs() $$, 'admin reads jobs');
select lives_ok($$ select public.admin_list_team_payments('c2000000-0000-0000-0000-000000000001') $$, 'admin reads team payments');
select is((select jsonb_array_length(public.admin_list_jobs() -> 'items') > 0), true, 'jobs list includes the seeded cron jobs');
select throws_ok($$ select public.admin_list_webhook_events('bogus') $$, '22023', 'invalid_outcome', 'an unknown outcome is refused');
select ok(not (public.admin_list_webhook_events() -> 'items' -> 0 ? 'payload'), 'the webhook ledger never returns the payload');
select throws_ok($$ select public.admin_list_admins() $$, '42501', 'not_authorized', 'admin cannot list admins');
reset role;

-- Owner: everything ---------------------------------------------------------------------------------------
select pg_temp.login('c1000000-0000-0000-0000-000000000004');
select is((select jsonb_array_length(public.admin_list_admins() -> 'items')), 3, 'owner lists the three admins');
select is((select (public.admin_list_admins() -> 'items' -> 0 ->> 'mfa_enrolled')::boolean), false, 'mfa status is reported (none enrolled in the fixture)');
select is((select jsonb_array_length(public.admin_list_teams(null, 1000, null) -> 'items') <= 100), true, 'list limits are capped at 100');
reset role;

-- No message body leaves through any read function ------------------------------------------------------------
select pg_temp.login('c1000000-0000-0000-0000-000000000002');
select ok(position('"body"' in (public.admin_list_message_reports(null, 100, null))::text) = 0, 'the reports queue contains no message body');
reset role;

-- Snapshots are written once per day ------------------------------------------------------------------------------
select private.take_billing_snapshot();
select private.take_billing_snapshot();
select is((select count(*)::int from public.billing_daily_snapshots where day = (now() at time zone 'utc')::date), 1, 'one snapshot per day, however many times the job runs');

select * from finish();
rollback;
