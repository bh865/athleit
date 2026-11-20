-- Admin portal (2/n): read functions, daily billing snapshots, support notes table.
-- Every function is SECURITY DEFINER with search_path = '' and starts with private.assert_platform_admin(min role).
-- Lists are keyset paginated (limit capped at 100). Metrics return as_of. Nothing here returns a message body,
-- a card number, a password or a token.

-- Helpers ---------------------------------------------------------------------------
create function private.admin_range(p_range text)
returns interval language sql immutable set search_path = ''
as $$
  select case p_range
    when '24h' then interval '24 hours' when '7d' then interval '7 days' when '30d' then interval '30 days'
    when '90d' then interval '90 days' when '12m' then interval '12 months'
    else null end;
$$;

create function private.admin_range_checked(p_range text)
returns interval language plpgsql immutable set search_path = ''
as $$
declare v interval := private.admin_range(coalesce(p_range, '30d'));
begin
  if v is null then raise exception 'invalid_range' using errcode = '22023'; end if;
  return v;
end;
$$;

create function private.admin_bucket_checked(p_bucket text)
returns text language plpgsql immutable set search_path = ''
as $$
begin
  if coalesce(p_bucket, 'week') not in ('hour', 'day', 'week', 'month') then
    raise exception 'invalid_bucket' using errcode = '22023';
  end if;
  return coalesce(p_bucket, 'week');
end;
$$;

create function private.admin_limit(p_limit integer, p_default integer default 25)
returns integer language sql immutable set search_path = ''
as $$ select least(greatest(coalesce(p_limit, p_default), 1), 100); $$;

-- Escape a user search term for ILIKE.
create function private.admin_like(p_term text)
returns text language sql immutable set search_path = ''
as $$ select '%' || replace(replace(replace(coalesce(p_term, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%'; $$;

-- Daily billing snapshots (history for the MRR line and the stacked state bar) ------------
create table public.billing_daily_snapshots (
  day date primary key,
  teams_by_state jsonb not null default '{}',
  mrr_cents integer not null default 0 constraint bds_mrr_nonneg check (mrr_cents >= 0),
  captured_at timestamptz not null default now()
);
alter table public.billing_daily_snapshots enable row level security;
revoke all on public.billing_daily_snapshots from anon, authenticated;

-- Idempotent per UTC day: a second run on the same day changes nothing. Real history only; never backfilled.
create function private.take_billing_snapshot()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.billing_daily_snapshots (day, teams_by_state, mrr_cents)
  select (now() at time zone 'utc')::date,
    coalesce((select jsonb_object_agg(state, n) from (select private.team_billing_state(b.team_id) state, count(*) n from public.team_billing b group by 1) g), '{}'::jsonb),
    coalesce((select sum(v.amount_cents) from public.team_billing b join public.billing_price_versions v on v.id = b.price_version_id
              where private.team_billing_state(b.team_id) in ('active', 'cancel_scheduled')), 0)
  on conflict (day) do nothing;
end;
$$;
revoke execute on function private.take_billing_snapshot() from public, anon, authenticated;
grant execute on function private.take_billing_snapshot() to service_role;
select private.take_billing_snapshot(); -- the one row for today; earlier dates stay empty
select cron.schedule('billing-daily-snapshot', '5 0 * * *', 'select private.take_billing_snapshot()');

-- Support notes (written by admin_add_support_note in the write migration) ------------
create table public.admin_notes (
  id bigint generated always as identity primary key,
  subject_type text not null constraint admin_notes_subject check (subject_type in ('team', 'club', 'person')),
  subject_id uuid not null,
  note text not null constraint admin_notes_length check (char_length(btrim(note)) between 1 and 2000),
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index admin_notes_subject_idx on public.admin_notes (subject_type, subject_id, created_at desc);
create index admin_notes_author_idx on public.admin_notes (author_id) where author_id is not null;
alter table public.admin_notes enable row level security;
revoke all on public.admin_notes from anon, authenticated;

-- Overview metrics [support] ----------------------------------------------------------------
create function public.admin_platform_metrics(p_range text default '30d', p_bucket text default 'week')
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_iv interval; v_b text;
begin
  perform private.assert_platform_admin('support');
  v_iv := private.admin_range_checked(p_range); v_b := private.admin_bucket_checked(p_bucket);
  return jsonb_build_object(
    'as_of', now(), 'range', coalesce(p_range, '30d'), 'bucket', v_b,
    'totals', jsonb_build_object(
      'teams', (select count(*) from public.teams), 'accounts', (select count(*) from public.profiles),
      'clubs', (select count(*) from public.clubs)),
    'teams_created', coalesce((select jsonb_agg(jsonb_build_object('at', b, 'n', n) order by b)
      from (select date_trunc(v_b, created_at) b, count(*) n from public.teams where created_at >= now() - v_iv group by 1) s), '[]'::jsonb),
    'accounts_created', coalesce((select jsonb_agg(jsonb_build_object('at', b, 'n', n) order by b)
      from (select date_trunc(v_b, created_at) b, count(*) n from public.profiles where created_at >= now() - v_iv group by 1) s), '[]'::jsonb));
end;
$$;

-- Money metrics [admin] ------------------------------------------------------------------------
create function public.admin_payment_metrics(p_range text default '30d', p_bucket text default 'week')
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_iv interval; v_b text;
begin
  perform private.assert_platform_admin('admin');
  v_iv := private.admin_range_checked(p_range); v_b := private.admin_bucket_checked(p_bucket);
  return jsonb_build_object(
    'as_of', now(), 'range', coalesce(p_range, '30d'), 'bucket', v_b,
    'fee_revenue', coalesce((select jsonb_agg(jsonb_build_object('at', b, 'cents', c) order by b)
      from (select date_trunc(v_b, succeeded_at) b, sum(platform_fee_cents)::bigint c from public.payments
            where status in ('succeeded', 'partially_refunded') and succeeded_at >= now() - v_iv group by 1) s), '[]'::jsonb),
    'volume', coalesce((select jsonb_agg(jsonb_build_object('at', b, 'cents', c) order by b)
      from (select date_trunc(v_b, succeeded_at) b, sum(total_charged_cents)::bigint c from public.payments
            where status in ('succeeded', 'partially_refunded') and succeeded_at >= now() - v_iv group by 1) s), '[]'::jsonb),
    'by_status', coalesce((select jsonb_object_agg(status, n)
      from (select status, count(*) n from public.payments where created_at >= now() - v_iv group by 1) s), '{}'::jsonb),
    'refunds', (select count(*) from public.refunds where created_at >= now() - v_iv),
    'disputes', (select count(*) from public.stripe_webhook_events where type like 'charge.dispute.%' and received_at >= now() - v_iv));
end;
$$;

create function public.admin_connect_funnel()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_platform_admin('admin');
  return jsonb_build_object('as_of', now(),
    'by_status', coalesce((select jsonb_object_agg(onboarding_status, n) from (select onboarding_status, count(*) n from public.connected_accounts group by 1) s), '{}'::jsonb),
    'charges_enabled', (select count(*) from public.connected_accounts where charges_enabled),
    'payouts_enabled', (select count(*) from public.connected_accounts where payouts_enabled));
end;
$$;

-- Platform health [admin] -----------------------------------------------------------------------
create function public.admin_notification_metrics(p_range text default '7d')
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_iv interval := private.admin_range_checked(p_range);
begin
  perform private.assert_platform_admin('admin');
  return jsonb_build_object('as_of', now(), 'range', coalesce(p_range, '7d'),
    'by_status_channel', coalesce((select jsonb_agg(jsonb_build_object('status', status, 'channel', channel, 'n', n))
      from (select status, channel, count(*) n from public.notification_outbox where created_at >= now() - v_iv group by 1, 2) s), '[]'::jsonb),
    'failures', coalesce((select jsonb_agg(jsonb_build_object('at', b, 'n', n) order by b)
      from (select date_trunc(case when v_iv <= interval '1 day' then 'hour' else 'day' end, created_at) b, count(*) n
            from public.notification_outbox where status = 'failed' and created_at >= now() - v_iv group by 1) s), '[]'::jsonb));
end;
$$;

-- A webhook "outcome" is derived: failed (has an error), processed, or pending.
create function public.admin_webhook_metrics(p_range text default '7d')
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_iv interval := private.admin_range_checked(p_range);
begin
  perform private.assert_platform_admin('admin');
  return jsonb_build_object('as_of', now(), 'range', coalesce(p_range, '7d'),
    'by_day_outcome', coalesce((select jsonb_agg(jsonb_build_object('at', d, 'outcome', o, 'n', n) order by d)
      from (select date_trunc('day', received_at) d,
                   case when error is not null then 'failed' when processed_at is not null then 'processed' else 'pending' end o, count(*) n
            from public.stripe_webhook_events where received_at >= now() - v_iv group by 1, 2) s), '[]'::jsonb));
end;
$$;

-- Ledger: ids, type, outcome, attempts, stored error. The payload column is never returned.
create function public.admin_list_webhook_events(p_outcome text default null, p_limit integer default 25, p_cursor jsonb default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_limit integer := private.admin_limit(p_limit);
begin
  perform private.assert_platform_admin('admin');
  if p_outcome is not null and p_outcome not in ('failed', 'processed', 'pending') then raise exception 'invalid_outcome' using errcode = '22023'; end if;
  return (
    with page as (
      select e.id, e.stripe_event_id, e.type, e.livemode, e.received_at, e.processed_at, e.attempts, e.error,
             case when e.error is not null then 'failed' when e.processed_at is not null then 'processed' else 'pending' end outcome
      from public.stripe_webhook_events e
      where (p_cursor is null or (e.received_at, e.id) < ((p_cursor ->> 'at')::timestamptz, (p_cursor ->> 'id')::uuid))
        and (p_outcome is null or p_outcome = case when e.error is not null then 'failed' when e.processed_at is not null then 'processed' else 'pending' end)
      order by e.received_at desc, e.id desc limit v_limit + 1)
    select jsonb_build_object('as_of', now(),
      'items', coalesce((select jsonb_agg(to_jsonb(p) order by p.received_at desc, p.id desc) from (select * from page order by received_at desc, id desc limit v_limit) p), '[]'::jsonb),
      'next_cursor', case when (select count(*) from page) > v_limit then
        (select jsonb_build_object('at', q.received_at, 'id', q.id) from (select * from page order by received_at desc, id desc offset v_limit - 1 limit 1) q) end));
end;
$$;

create function public.admin_rate_limit_metrics(p_range text default '7d')
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_iv interval := private.admin_range_checked(p_range);
begin
  perform private.assert_platform_admin('admin');
  return jsonb_build_object('as_of', now(), 'range', coalesce(p_range, '7d'),
    'hits', coalesce((select jsonb_agg(jsonb_build_object('at', b, 'n', n) order by b)
      from (select date_trunc(case when v_iv <= interval '1 day' then 'hour' else 'day' end, window_start) b, sum(hits)::bigint n
            from public.api_rate_limits where window_start >= now() - v_iv group by 1) s), '[]'::jsonb));
end;
$$;

-- Jobs [admin]: pg_cron jobs with last run and a derived "late" flag (no run within 2x the interval) -----------
-- The interval is read from simple schedules only ("*/N * * * *", "M * * * *", "M H * * *"); anything else is null and never late.
create function private.cron_interval_minutes(p_schedule text)
returns integer language sql immutable set search_path = ''
as $$
  select case
    when p_schedule ~ '^\*/[0-9]+ \* \* \* \*$' then substring(p_schedule from '^\*/([0-9]+)')::integer
    when p_schedule = '* * * * *' then 1
    when p_schedule ~ '^[0-9]+ \* \* \* \*$' then 60
    when p_schedule ~ '^[0-9]+ [0-9]+ \* \* \*$' then 1440
    else null end;
$$;

create function public.admin_list_jobs()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_platform_admin('admin');
  return jsonb_build_object('as_of', now(), 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'job_id', j.jobid, 'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
      'interval_minutes', private.cron_interval_minutes(j.schedule),
      'last_run_at', r.start_time, 'last_status', r.status, 'last_duration_ms', round(extract(epoch from (r.end_time - r.start_time)) * 1000),
      'late', coalesce(j.active and private.cron_interval_minutes(j.schedule) is not null
                       and coalesce(r.start_time, '-infinity'::timestamptz) < now() - (2 * private.cron_interval_minutes(j.schedule)) * interval '1 minute', false))
      order by j.jobname)
    from cron.job j
    left join lateral (select d.start_time, d.end_time, d.status from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1) r on true), '[]'::jsonb));
end;
$$;

-- Billing history [support]
create function public.admin_billing_snapshots(p_range text default '90d')
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_iv interval := private.admin_range_checked(p_range);
begin
  perform private.assert_platform_admin('support');
  return jsonb_build_object('as_of', now(), 'range', coalesce(p_range, '90d'),
    'first_day', (select min(day) from public.billing_daily_snapshots),
    'items', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'teams_by_state', teams_by_state, 'mrr_cents', mrr_cents) order by day)
      from public.billing_daily_snapshots where day >= (now() - v_iv)::date), '[]'::jsonb));
end;
$$;

-- Teams and clubs [support] ---------------------------------------------------------------------------------
create function public.admin_list_teams(p_search text default null, p_limit integer default 25, p_cursor jsonb default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_limit integer := private.admin_limit(p_limit);
begin
  perform private.assert_platform_admin('support');
  return (
    with page as (
      select t.id, t.name, t.sport, t.season_label, t.created_at, c.name club_name,
             (select count(*) from public.team_memberships m where m.team_id = t.id and m.status = 'active') members,
             private.team_billing_state(t.id) billing_state
      from public.teams t left join public.clubs c on c.id = t.club_id
      where (p_search is null or t.name ilike private.admin_like(p_search))
        and (p_cursor is null or (t.created_at, t.id) < ((p_cursor ->> 'at')::timestamptz, (p_cursor ->> 'id')::uuid))
      order by t.created_at desc, t.id desc limit v_limit + 1)
    select jsonb_build_object('as_of', now(),
      'items', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc, p.id desc) from (select * from page order by created_at desc, id desc limit v_limit) p), '[]'::jsonb),
      'next_cursor', case when (select count(*) from page) > v_limit then
        (select jsonb_build_object('at', q.created_at, 'id', q.id) from (select * from page order by created_at desc, id desc offset v_limit - 1 limit 1) q) end));
end;
$$;

-- Overview and Activity tabs. Subscription uses admin_get_team_billing; Payments is admin_list_team_payments.
create function public.admin_get_team(p_team_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_team jsonb;
begin
  perform private.assert_platform_admin('support');
  select jsonb_build_object('id', t.id, 'name', t.name, 'sport', t.sport, 'season_label', t.season_label, 'created_at', t.created_at,
           'club', (select jsonb_build_object('id', c.id, 'name', c.name) from public.clubs c where c.id = t.club_id),
           'billing_state', private.team_billing_state(t.id))
    into v_team from public.teams t where t.id = p_team_id;
  if v_team is null then return null; end if;
  return jsonb_build_object('as_of', now(), 'team', v_team,
    'staff', coalesce((select jsonb_agg(jsonb_build_object('profile_id', m.profile_id, 'name', p.display_name, 'email', u.email, 'role', m.role) order by m.role, p.display_name)
      from public.team_memberships m join public.profiles p on p.id = m.profile_id join auth.users u on u.id = m.profile_id
      where m.team_id = p_team_id and m.status = 'active' and m.role in ('admin', 'coach', 'manager')), '[]'::jsonb),
    'member_counts', coalesce((select jsonb_object_agg(role, n) from (select role, count(*) n from public.team_memberships where team_id = p_team_id and status = 'active' group by 1) s), '{}'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'note', n.note, 'author', pa.display_name, 'at', n.created_at) order by n.created_at desc)
      from (select * from public.admin_notes where subject_type = 'team' and subject_id = p_team_id order by created_at desc limit 50) n left join public.profiles pa on pa.id = n.author_id), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'at', a.created_at, 'actor_id', a.actor_id, 'before', a.before, 'after', a.after) order by a.created_at desc)
      from (select * from public.audit_log where team_id = p_team_id order by created_at desc, id desc limit 50) a), '[]'::jsonb));
end;
$$;

-- Payments tab [admin]: amounts and status only; no card data exists in these tables.
create function public.admin_list_team_payments(p_team_id uuid, p_limit integer default 25, p_cursor jsonb default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_limit integer := private.admin_limit(p_limit);
begin
  perform private.assert_platform_admin('admin');
  return (
    with page as (
      select p.id, p.receipt_display_id, p.status, p.base_cents, p.platform_fee_cents, p.total_charged_cents, p.fee_policy, p.created_at, p.succeeded_at
      from public.payments p join public.connected_accounts a on a.id = p.connected_account_id
      where a.team_id = p_team_id
        and (p_cursor is null or (p.created_at, p.id) < ((p_cursor ->> 'at')::timestamptz, (p_cursor ->> 'id')::uuid))
      order by p.created_at desc, p.id desc limit v_limit + 1)
    select jsonb_build_object('as_of', now(),
      'items', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc) from (select * from page order by created_at desc, id desc limit v_limit) x), '[]'::jsonb),
      'next_cursor', case when (select count(*) from page) > v_limit then
        (select jsonb_build_object('at', q.created_at, 'id', q.id) from (select * from page order by created_at desc, id desc offset v_limit - 1 limit 1) q) end));
end;
$$;

create function public.admin_list_clubs(p_search text default null, p_limit integer default 25, p_cursor jsonb default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_limit integer := private.admin_limit(p_limit);
begin
  perform private.assert_platform_admin('support');
  return (
    with page as (
      select c.id, c.name, c.slug, c.created_at, (select count(*) from public.teams t where t.club_id = c.id) teams
      from public.clubs c
      where (p_search is null or c.name ilike private.admin_like(p_search))
        and (p_cursor is null or (c.created_at, c.id) < ((p_cursor ->> 'at')::timestamptz, (p_cursor ->> 'id')::uuid))
      order by c.created_at desc, c.id desc limit v_limit + 1)
    select jsonb_build_object('as_of', now(),
      'items', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc, p.id desc) from (select * from page order by created_at desc, id desc limit v_limit) p), '[]'::jsonb),
      'next_cursor', case when (select count(*) from page) > v_limit then
        (select jsonb_build_object('at', q.created_at, 'id', q.id) from (select * from page order by created_at desc, id desc offset v_limit - 1 limit 1) q) end));
end;
$$;

create function public.admin_get_club(p_club_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_club jsonb;
begin
  perform private.assert_platform_admin('support');
  select jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'created_at', c.created_at) into v_club from public.clubs c where c.id = p_club_id;
  if v_club is null then return null; end if;
  return jsonb_build_object('as_of', now(), 'club', v_club,
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'sport', t.sport, 'billing_state', private.team_billing_state(t.id)) order by t.name)
      from public.teams t where t.club_id = p_club_id), '[]'::jsonb),
    'admins', coalesce((select jsonb_agg(jsonb_build_object('profile_id', m.profile_id, 'name', p.display_name, 'email', u.email, 'role', m.role) order by p.display_name)
      from public.club_memberships m join public.profiles p on p.id = m.profile_id join auth.users u on u.id = m.profile_id
      where m.club_id = p_club_id and m.status = 'active'), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'note', n.note, 'author', pa.display_name, 'at', n.created_at) order by n.created_at desc)
      from (select * from public.admin_notes where subject_type = 'club' and subject_id = p_club_id order by created_at desc limit 50) n left join public.profiles pa on pa.id = n.author_id), '[]'::jsonb));
end;
$$;

-- Reports [support]: no message bodies, ever. The only path to a body is admin_reveal_reported_message. ---------------
create function public.admin_list_message_reports(p_status text default 'open', p_limit integer default 25, p_cursor jsonb default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_limit integer := private.admin_limit(p_limit);
begin
  perform private.assert_platform_admin('support');
  if p_status is not null and p_status not in ('open', 'actioned', 'dismissed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  return (
    with page as (
      select r.id, r.status, r.reason, r.created_at, r.reviewed_at, r.message_id,
             (select count(*) from public.message_reports o where o.message_id = r.message_id) reports_on_message,
             rp.display_name reporter_name, sp.display_name sender_name
      from public.message_reports r
      left join public.profiles rp on rp.id = r.reporter_profile_id
      left join public.messages m on m.id = r.message_id left join public.profiles sp on sp.id = m.sender_profile_id
      where (p_status is null or r.status = p_status)
        and (p_cursor is null or (r.created_at, r.id) < ((p_cursor ->> 'at')::timestamptz, (p_cursor ->> 'id')::uuid))
      order by r.created_at desc, r.id desc limit v_limit + 1)
    select jsonb_build_object('as_of', now(),
      'items', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc, p.id desc) from (select * from page order by created_at desc, id desc limit v_limit) p), '[]'::jsonb),
      'next_cursor', case when (select count(*) from page) > v_limit then
        (select jsonb_build_object('at', q.created_at, 'id', q.id) from (select * from page order by created_at desc, id desc offset v_limit - 1 limit 1) q) end));
end;
$$;

-- Escalations: open reports that are old (48 hours) or have a second report on the same message.
create function public.admin_list_escalations()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_platform_admin('support');
  return jsonb_build_object('as_of', now(), 'items', coalesce((
    select jsonb_agg(to_jsonb(e) order by e.created_at) from (
      select r.id, r.message_id, r.reason, r.created_at,
             (select count(*) from public.message_reports o where o.message_id = r.message_id) reports_on_message,
             r.created_at < now() - interval '48 hours' as overdue
      from public.message_reports r
      where r.status = 'open'
        and (r.created_at < now() - interval '48 hours'
             or (select count(*) from public.message_reports o where o.message_id = r.message_id) > 1)
      order by r.created_at limit 100) e), '[]'::jsonb));
end;
$$;

-- Audit [support]: platform_audit_log and the team audit_log in one stream, newest first.
-- p_filters keys (all optional): source ('platform'|'team'), action (prefix), actor (uuid), team (uuid), from, to.
create function public.admin_list_audit(p_filters jsonb default '{}', p_limit integer default 25, p_cursor jsonb default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_limit integer := private.admin_limit(p_limit); v_f jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  perform private.assert_platform_admin('support');
  return (
    with u as (
      select 'platform'::text src, a.id::text id_text, a.id id_num, a.at, a.actor_id, a.action, a.target_type, a.target_id, a.team_id, a.before, a.after, a.reason
      from public.platform_audit_log a
      union all
      select 'team', l.id::text, l.id, l.created_at, l.actor_id, l.action, l.target_type, l.target_id::text, l.team_id, l.before, l.after, null::text
      from public.audit_log l),
    page as (
      select u.*, p.display_name actor_name from u left join public.profiles p on p.id = u.actor_id
      where (v_f ->> 'source' is null or u.src = v_f ->> 'source')
        and (v_f ->> 'action' is null or u.action like replace(replace(v_f ->> 'action', '%', ''), '_', '\_') || '%')
        and (v_f ->> 'actor' is null or u.actor_id = (v_f ->> 'actor')::uuid)
        and (v_f ->> 'team' is null or u.team_id = (v_f ->> 'team')::uuid)
        and (v_f ->> 'from' is null or u.at >= (v_f ->> 'from')::timestamptz)
        and (v_f ->> 'to' is null or u.at < (v_f ->> 'to')::timestamptz)
        and (p_cursor is null or (u.at, u.src, u.id_num) < ((p_cursor ->> 'at')::timestamptz, p_cursor ->> 'src', (p_cursor ->> 'id')::bigint))
      order by u.at desc, u.src desc, u.id_num desc limit v_limit + 1)
    select jsonb_build_object('as_of', now(),
      'items', coalesce((select jsonb_agg(to_jsonb(x) - 'id_num' order by x.at desc, x.src desc, x.id_num desc) from (select * from page order by at desc, src desc, id_num desc limit v_limit) x), '[]'::jsonb),
      'next_cursor', case when (select count(*) from page) > v_limit then
        (select jsonb_build_object('at', q.at, 'src', q.src, 'id', q.id_num) from (select * from page order by at desc, src desc, id_num desc offset v_limit - 1 limit 1) q) end));
end;
$$;

-- Admins [owner]: with a "has a verified authenticator" flag from auth.mfa_factors.
create function public.admin_list_admins()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_platform_admin('owner');
  return jsonb_build_object('as_of', now(), 'items', coalesce((
    select jsonb_agg(jsonb_build_object('profile_id', a.profile_id, 'name', p.display_name, 'email', u.email, 'role', a.role, 'since', a.created_at,
      'mfa_enrolled', exists (select 1 from auth.mfa_factors f where f.user_id = a.profile_id and f.status = 'verified' and f.factor_type = 'totp'))
      order by private.platform_role_rank(a.role) desc, p.display_name)
    from public.platform_admins a join public.profiles p on p.id = a.profile_id join auth.users u on u.id = a.profile_id), '[]'::jsonb));
end;
$$;

-- Grants ----------------------------------------------------------------------------------------------------
revoke execute on function private.admin_range(text), private.admin_range_checked(text), private.admin_bucket_checked(text),
  private.admin_limit(integer, integer), private.admin_like(text), private.cron_interval_minutes(text) from public, anon, authenticated;
grant execute on function private.admin_range(text), private.admin_range_checked(text), private.admin_bucket_checked(text),
  private.admin_limit(integer, integer), private.admin_like(text), private.cron_interval_minutes(text) to service_role;

revoke execute on function
  public.admin_platform_metrics(text, text), public.admin_payment_metrics(text, text), public.admin_connect_funnel(),
  public.admin_notification_metrics(text), public.admin_webhook_metrics(text), public.admin_list_webhook_events(text, integer, jsonb),
  public.admin_rate_limit_metrics(text), public.admin_list_jobs(), public.admin_billing_snapshots(text),
  public.admin_list_teams(text, integer, jsonb), public.admin_get_team(uuid), public.admin_list_team_payments(uuid, integer, jsonb),
  public.admin_list_clubs(text, integer, jsonb), public.admin_get_club(uuid),
  public.admin_list_message_reports(text, integer, jsonb), public.admin_list_escalations(),
  public.admin_list_audit(jsonb, integer, jsonb), public.admin_list_admins()
  from public, anon, authenticated;
grant execute on function
  public.admin_platform_metrics(text, text), public.admin_payment_metrics(text, text), public.admin_connect_funnel(),
  public.admin_notification_metrics(text), public.admin_webhook_metrics(text), public.admin_list_webhook_events(text, integer, jsonb),
  public.admin_rate_limit_metrics(text), public.admin_list_jobs(), public.admin_billing_snapshots(text),
  public.admin_list_teams(text, integer, jsonb), public.admin_get_team(uuid), public.admin_list_team_payments(uuid, integer, jsonb),
  public.admin_list_clubs(text, integer, jsonb), public.admin_get_club(uuid),
  public.admin_list_message_reports(text, integer, jsonb), public.admin_list_escalations(),
  public.admin_list_audit(jsonb, integer, jsonb), public.admin_list_admins()
  to authenticated;
