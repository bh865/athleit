-- Team subscriptions (2/3): team billing facts, the state function, the gate, the trial, notices
--
-- Facts are stored, state is COMPUTED (private.team_billing_state). Nothing derived is persisted, so it cannot drift.
-- Access: full | grace | restricted. Restricted never hides or deletes data and never blocks families.

-- Notification category -------------------------------------------------------------------------
alter table public.notification_preferences drop constraint notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category in ('messages', 'announcements', 'schedule', 'payments', 'registration', 'billing', 'payments_reserved'));
alter table public.notification_outbox drop constraint notification_outbox_category_check;
alter table public.notification_outbox add constraint notification_outbox_category_check
  check (category in ('messages', 'announcements', 'schedule', 'payments', 'registration', 'billing', 'payments_reserved'));
create or replace function private.seed_notification_preferences(p_profile_id uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into public.notification_preferences (profile_id, channel, category)
  select p_profile_id, ch, cat
  from unnest(array['push', 'email']) ch,
       unnest(array['messages', 'announcements', 'schedule', 'payments', 'registration', 'billing']) cat
  on conflict do nothing;
$$;
insert into public.notification_preferences (profile_id, channel, category)
select p.id, ch, 'billing' from public.profiles p, unnest(array['push', 'email']) ch
on conflict do nothing;
drop policy "Create own preferences (implemented channels and categories only)" on public.notification_preferences;
create policy "Create own preferences (implemented channels and categories only)" on public.notification_preferences
  for insert to authenticated
  with check (profile_id = (select auth.uid()) and channel in ('push', 'email')
              and category in ('messages', 'announcements', 'schedule', 'payments', 'registration', 'billing'));

-- Facts ---------------------------------------------------------------------------------------------
create table public.team_billing (
  team_id uuid primary key references public.teams (id) on delete cascade,
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null,
  price_version_id uuid references public.billing_price_versions (id) on delete restrict,
  stripe_customer_id text unique constraint tb_customer check (stripe_customer_id ~ '^cus_[A-Za-z0-9_]+$'),
  stripe_subscription_id text unique constraint tb_subscription check (stripe_subscription_id ~ '^sub_[A-Za-z0-9_]+$'),
  stripe_status text constraint tb_status check (stripe_status in
    ('trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused')),
  subscribed_by uuid references public.profiles (id) on delete set null,
  subscribed_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  ended_at timestamptz,
  past_due_since timestamptz,
  grace_ends_at timestamptz,
  comped boolean not null default false,
  comp_until timestamptz,
  last_snapshot_at timestamptz,
  price_mismatch boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index team_billing_price_version_idx on public.team_billing (price_version_id) where price_version_id is not null;
create index team_billing_subscribed_by_idx on public.team_billing (subscribed_by) where subscribed_by is not null;
create index team_billing_trial_ends_idx on public.team_billing (trial_ends_at);
create trigger team_billing_set_updated_at before update on public.team_billing
  for each row execute function public.set_updated_at();

-- Mirror of subscription invoices (ids, amounts and links only: no card data, no payment method details).
create table public.team_billing_invoices (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  stripe_invoice_id text not null unique constraint tbi_invoice check (stripe_invoice_id ~ '^in_[A-Za-z0-9_]+$'),
  invoice_number text,
  status text not null constraint tbi_status check (status in ('draft', 'open', 'paid', 'uncollectible', 'void')),
  amount_due_cents bigint not null default 0,
  amount_paid_cents bigint not null default 0,
  amount_refunded_cents bigint not null default 0,
  currency text not null default 'usd',
  period_start timestamptz,
  period_end timestamptz,
  hosted_invoice_url text,
  invoice_pdf_url text,
  paid_at timestamptz,
  disputed boolean not null default false,
  stripe_created_at timestamptz,
  updated_at timestamptz not null default now()
);
create index team_billing_invoices_team_idx on public.team_billing_invoices (team_id, stripe_created_at desc);

-- One row per notice already sent, so the hourly sweep and webhook retries never repeat a notice.
create table public.team_billing_notices (
  team_id uuid not null references public.teams (id) on delete cascade,
  notice_key text not null,
  sent_at timestamptz not null default now(),
  primary key (team_id, notice_key)
);

alter table public.team_billing enable row level security;
alter table public.team_billing_invoices enable row level security;
alter table public.team_billing_notices enable row level security;
revoke all on public.team_billing, public.team_billing_invoices, public.team_billing_notices from anon, authenticated;
-- No policies and no grants: clients read billing only through get_team_billing / get_team_billing_invoices.

-- The state function (mirrored in packages/core/src/team-billing.ts with the same test vectors) ------
create function private.team_billing_state(p_team_id uuid, p_now timestamptz default now())
returns text language plpgsql stable security definer set search_path = ''
as $$
declare b public.team_billing;
begin
  if not private.setting_bool('team_subscription.enabled') then return 'off'; end if;
  select * into b from public.team_billing where team_id = p_team_id;
  if not found then return 'off'; end if;
  if b.comped and (b.comp_until is null or b.comp_until > p_now) then return 'comped'; end if;
  if b.stripe_subscription_id is not null and coalesce(b.stripe_status, '') not in ('', 'incomplete') then
    if b.stripe_status in ('active', 'trialing') then
      if b.cancel_at_period_end then
        return case when b.current_period_end is not null and b.current_period_end <= p_now then 'lapsed' else 'cancel_scheduled' end;
      end if;
      return 'active';
    elsif b.stripe_status in ('past_due', 'unpaid') then
      return case when b.grace_ends_at is null or b.grace_ends_at > p_now then 'past_due' else 'lapsed' end;
    else
      return 'lapsed'; -- canceled, incomplete_expired, paused
    end if;
  end if;
  return case when b.trial_ends_at > p_now then 'trialing' else 'trial_expired' end;
end;
$$;

create function private.billing_access(p_state text)
returns text language sql immutable set search_path = ''
as $$
  select case p_state
    when 'past_due' then 'grace'
    when 'trial_expired' then 'restricted'
    when 'lapsed' then 'restricted'
    else 'full' end;
$$;

-- THE gate. Called from each gated function; raises billing_restricted only for staff of a restricted team
-- (a non-staff caller is left to the function's own authorization error). A null team (club issuer) is never gated.
create function private.assert_team_billing_allows(p_team_id uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_team_id is null then return; end if;
  if private.billing_access(private.team_billing_state(p_team_id)) = 'restricted' then
    raise exception 'billing_restricted' using errcode = 'P0001',
      detail = 'This team''s free trial or subscription has ended. A team admin can subscribe to turn this back on.';
  end if;
end;
$$;

-- Trial ---------------------------------------------------------------------------------------------------
-- The ONE place that decides when a team's trial starts (today: when the team is created).
create function private.start_team_trial(p_team_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_days integer;
begin
  if not private.setting_bool('team_subscription.enabled') then return; end if;
  v_days := private.setting_int('team_subscription.trial_days');
  insert into public.team_billing (team_id, trial_started_at, trial_ends_at)
    values (p_team_id, now(), now() + make_interval(days => v_days))
    on conflict (team_id) do nothing;
end;
$$;
create function private.team_created_start_trial()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.start_team_trial(new.id);
  return new;
end;
$$;
create trigger teams_start_trial after insert on public.teams
  for each row execute function private.team_created_start_trial();

-- Launch switch: flips the setting (audited, with history) and backfills a fresh trial for every existing team.
create function private.enable_team_billing(p_actor uuid, p_reason text)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_days integer; v_n integer;
begin
  perform private.set_platform_setting('team_subscription.enabled', 'true'::jsonb, p_actor, p_reason);
  v_days := private.setting_int('team_subscription.trial_days');
  insert into public.team_billing (team_id, trial_started_at, trial_ends_at)
    select t.id, now(), now() + make_interval(days => v_days) from public.teams t
    on conflict (team_id) do nothing;
  get diagnostics v_n = row_count;
  perform private.platform_audit('billing.enabled', 'platform_settings', 'team_subscription.enabled', null,
    null, jsonb_build_object('teams_backfilled', v_n), p_reason, p_actor);
  return v_n;
end;
$$;
-- Disabling restores everything instantly and deletes nothing.
create function private.disable_team_billing(p_actor uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.set_platform_setting('team_subscription.enabled', 'false'::jsonb, p_actor, p_reason);
end;
$$;

-- Notices ---------------------------------------------------------------------------------------------------
create function private.team_admin_ids(p_team_id uuid)
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select distinct m.profile_id from public.team_memberships m
  where m.team_id = p_team_id and m.role = 'admin' and m.status = 'active';
$$;
create function private.team_staff_ids(p_team_id uuid)
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select distinct m.profile_id from public.team_memberships m
  where m.team_id = p_team_id and m.role in ('coach', 'manager') and m.status = 'active';
$$;

-- Sends one billing notice, once per (team, key), to the chosen audience:
--   admins (every current team admin, the default) | staff (coaches and managers only) | both.
-- Nothing is recorded when nobody can receive it yet, so a later run still delivers it.
create function private.notify_team_billing(
  p_team_id uuid, p_notice text, p_title text, p_body text, p_key text, p_audience text default 'admins')
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_profile uuid; v_new integer; v_targets uuid[];
begin
  v_targets := case p_audience
    when 'staff' then array(select * from private.team_staff_ids(p_team_id))
    when 'both' then array(select * from private.team_admin_ids(p_team_id) union select * from private.team_staff_ids(p_team_id))
    else array(select * from private.team_admin_ids(p_team_id)) end;
  if coalesce(array_length(v_targets, 1), 0) = 0 then return false; end if;
  insert into public.team_billing_notices (team_id, notice_key) values (p_team_id, p_key) on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new = 0 then return false; end if;
  foreach v_profile in array v_targets loop
    perform private.enqueue_notification(v_profile, 'billing',
      jsonb_build_object('kind', 'billing', 'change', p_notice, 'title', left(p_title, 100), 'body', p_body,
                         'team_id', p_team_id,
                         'audience', case when v_profile in (select * from private.team_admin_ids(p_team_id)) then 'admin' else 'staff' end),
      'billing:' || p_team_id || ':' || p_key || ':' || v_profile);
  end loop;
  return true;
end;
$$;

-- Money text in notices comes from the stored price version, never a literal.
create function private.team_price_cents(p_team_id uuid)
returns integer language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select v.amount_cents from public.team_billing b join public.billing_price_versions v on v.id = b.price_version_id where b.team_id = p_team_id),
    private.setting_int('team_subscription.price_cents'));
$$;

-- Client reads ---------------------------------------------------------------------------------------------
-- Public pricing terms for copy such as "14-day free trial, then $10/month".
create function public.get_billing_terms()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when (select auth.uid()) is null then null
         else jsonb_build_object(
           'enabled', private.setting_bool('team_subscription.enabled'),
           'price_cents', private.setting_int('team_subscription.price_cents'),
           'currency', 'usd', 'interval', 'month',
           'trial_days', private.setting_int('team_subscription.trial_days'),
           'grace_days', private.setting_int('team_subscription.grace_days'),
           'trial_reminder_days', to_jsonb(private.setting_int_array('team_subscription.trial_reminder_days'))) end;
$$;

-- Admin: the full picture. Coach/manager: status only. Everyone else: null. Billing off: state 'off'.
create function public.get_team_billing(p_team_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  b public.team_billing;
  v_admin boolean := private.has_team_role(p_team_id, array['admin']::public.team_role[]);
  v_staff boolean := private.is_team_staff(p_team_id);
  v_state text;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not v_staff then return null; end if;
  v_state := private.team_billing_state(p_team_id);
  select * into b from public.team_billing where team_id = p_team_id;
  if v_state = 'off' or not found then
    return jsonb_build_object('state', 'off', 'access', 'full', 'can_manage', v_admin);
  end if;
  if not v_admin then
    return jsonb_build_object('state', v_state, 'access', private.billing_access(v_state), 'can_manage', false,
      'trial_ends_at', case when v_state in ('trialing', 'trial_expired') then b.trial_ends_at end,
      'grace_ends_at', case when v_state = 'past_due' then b.grace_ends_at end);
  end if;
  return jsonb_build_object(
    'state', v_state, 'access', private.billing_access(v_state), 'can_manage', true,
    'trial_ends_at', b.trial_ends_at, 'current_period_end', b.current_period_end,
    'cancel_at_period_end', b.cancel_at_period_end, 'grace_ends_at', b.grace_ends_at,
    'comp_until', case when b.comped then b.comp_until end,
    'has_subscription', b.stripe_subscription_id is not null,
    -- A subscription Stripe is still billing (so the answer to a failed card is to fix the card, never to start a second Checkout).
    'subscription_live', b.stripe_subscription_id is not null and b.stripe_status in ('active', 'trialing', 'past_due', 'unpaid'),
    'price_cents', private.team_price_cents(p_team_id), 'currency', 'usd', 'interval', 'month',
    'price_mismatch', b.price_mismatch);
end;
$$;

create function public.get_team_billing_invoices(p_team_id uuid)
returns table (invoice_number text, status text, amount_due_cents bigint, amount_paid_cents bigint,
               amount_refunded_cents bigint, currency text, period_start timestamptz, period_end timestamptz,
               hosted_invoice_url text, invoice_pdf_url text, paid_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select i.invoice_number, i.status, i.amount_due_cents, i.amount_paid_cents, i.amount_refunded_cents, i.currency,
         i.period_start, i.period_end, i.hosted_invoice_url, i.invoice_pdf_url, i.paid_at
  from public.team_billing_invoices i
  where i.team_id = p_team_id and private.has_team_role(p_team_id, array['admin']::public.team_role[])
    and private.setting_bool('team_subscription.enabled')
  order by i.stripe_created_at desc nulls last limit 24;
$$;

-- Gated staff actions: each public function becomes a thin wrapper that runs the gate and then the ORIGINAL body,
-- which moves to the private schema unchanged. Signatures, grants and error behaviour of the public functions stay the same.
alter function public.publish_payment_event(uuid) set schema private;
alter function private.publish_payment_event(uuid) rename to publish_payment_event_inner;
alter function public.publish_registration_event(uuid) set schema private;
alter function private.publish_registration_event(uuid) rename to publish_registration_event_inner;
alter function public.create_invite(uuid, uuid, text, interval, integer) set schema private;
alter function private.create_invite(uuid, uuid, text, interval, integer) rename to create_invite_inner;
alter function public.decide_join_request(uuid, boolean) set schema private;
alter function private.decide_join_request(uuid, boolean) rename to decide_join_request_inner;

create function public.publish_payment_event(p_event_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_team uuid;
begin
  select team_id into v_team from public.payment_events where id = p_event_id;
  if v_team is not null and private.is_team_staff(v_team) then perform private.assert_team_billing_allows(v_team); end if;
  return private.publish_payment_event_inner(p_event_id);
end;
$$;

create function public.publish_registration_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_team uuid;
begin
  select coalesce(team_id, target_team_id) into v_team from public.registration_events where id = p_event_id;
  if v_team is not null and private.is_team_staff(v_team) then perform private.assert_team_billing_allows(v_team); end if;
  perform private.publish_registration_event_inner(p_event_id);
end;
$$;

create function public.create_invite(
  p_team_id uuid, p_club_id uuid, p_role text,
  p_expires_in interval default interval '7 days', p_max_uses integer default 1)
returns table (invite_id uuid, token text)
language plpgsql security definer set search_path = ''
as $$
begin
  if p_team_id is not null and private.is_team_staff(p_team_id) then perform private.assert_team_billing_allows(p_team_id); end if;
  return query select * from private.create_invite_inner(p_team_id, p_club_id, p_role, p_expires_in, p_max_uses);
end;
$$;

-- Only APPROVING is gated; declining stays open so a restricted team can still clear its list.
create function public.decide_join_request(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_team uuid;
begin
  if p_approve then
    select team_id into v_team from public.join_requests where id = p_request_id;
    if v_team is not null and private.is_team_staff(v_team) then perform private.assert_team_billing_allows(v_team); end if;
  end if;
  perform private.decide_join_request_inner(p_request_id, p_approve);
end;
$$;

revoke execute on function private.publish_payment_event_inner(uuid), private.publish_registration_event_inner(uuid),
  private.create_invite_inner(uuid, uuid, text, interval, integer), private.decide_join_request_inner(uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.publish_payment_event(uuid), public.publish_registration_event(uuid),
  public.create_invite(uuid, uuid, text, interval, integer), public.decide_join_request(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.publish_payment_event(uuid), public.publish_registration_event(uuid),
  public.create_invite(uuid, uuid, text, interval, integer), public.decide_join_request(uuid, boolean) to authenticated;

revoke execute on function private.team_billing_state(uuid, timestamptz), private.billing_access(text),
  private.assert_team_billing_allows(uuid), private.start_team_trial(uuid), private.team_created_start_trial(),
  private.enable_team_billing(uuid, text), private.disable_team_billing(uuid, text),
  private.team_admin_ids(uuid), private.team_staff_ids(uuid),
  private.notify_team_billing(uuid, text, text, text, text, text), private.team_price_cents(uuid)
  from public, anon, authenticated;
grant execute on function private.team_billing_state(uuid, timestamptz), private.billing_access(text),
  private.assert_team_billing_allows(uuid), private.start_team_trial(uuid),
  private.enable_team_billing(uuid, text), private.disable_team_billing(uuid, text),
  private.notify_team_billing(uuid, text, text, text, text, text), private.team_price_cents(uuid)
  to service_role;
revoke execute on function public.get_billing_terms(), public.get_team_billing(uuid), public.get_team_billing_invoices(uuid)
  from public, anon, authenticated;
grant execute on function public.get_billing_terms(), public.get_team_billing(uuid), public.get_team_billing_invoices(uuid)
  to authenticated;
