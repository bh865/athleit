-- Team subscriptions (3/3): admin read and write functions, service functions for the Edge Functions,
-- the hourly sweep, cron, and account-deletion blockers.

-- Admin reads (platform admin session, any role; paginated with a keyset cursor) ------------------------------
create function public.admin_list_team_billing(
  p_state text default null, p_search text default null, p_limit integer default 25, p_cursor jsonb default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100); v_rows jsonb; v_n integer; v_last record;
begin
  perform private.assert_platform_admin('support');
  return (
    with page as (
      select b.team_id, t.name, b.created_at, b.trial_ends_at, b.current_period_end, b.cancel_at_period_end,
             b.grace_ends_at, b.comped, b.comp_until, b.price_mismatch, b.price_version_id,
             private.team_billing_state(b.team_id) as state
      from public.team_billing b join public.teams t on t.id = b.team_id
      where (p_search is null or t.name ilike '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%')
        and (p_cursor is null or (b.created_at, b.team_id) < ((p_cursor ->> 'at')::timestamptz, (p_cursor ->> 'id')::uuid))
        and (p_state is null or private.team_billing_state(b.team_id) = p_state)
      order by b.created_at desc, b.team_id desc
      limit v_limit + 1)
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc, p.team_id desc) from (select * from page order by created_at desc, team_id desc limit v_limit) p), '[]'::jsonb),
      'next_cursor', case when (select count(*) from page) > v_limit then
        (select jsonb_build_object('at', q.created_at, 'id', q.team_id) from (select * from page order by created_at desc, team_id desc offset v_limit - 1 limit 1) q) end));
end;
$$;

create function public.admin_get_team_billing(p_team_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare b public.team_billing;
begin
  perform private.assert_platform_admin('support');
  select * into b from public.team_billing where team_id = p_team_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'team', (select jsonb_build_object('id', t.id, 'name', t.name) from public.teams t where t.id = p_team_id),
    'state', private.team_billing_state(p_team_id),
    'billing', to_jsonb(b),
    'price_version', (select to_jsonb(v) from public.billing_price_versions v where v.id = b.price_version_id),
    'invoices', coalesce((select jsonb_agg(to_jsonb(i) order by i.stripe_created_at desc nulls last)
                          from (select * from public.team_billing_invoices x where x.team_id = p_team_id order by x.stripe_created_at desc nulls last limit 24) i), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'at', a.created_at, 'before', a.before, 'after', a.after) order by a.created_at desc)
                        from (select * from public.audit_log x where x.team_id = p_team_id and x.action like 'billing.%' order by x.created_at desc limit 50) a), '[]'::jsonb));
end;
$$;

create function public.admin_billing_metrics()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_platform_admin('support');
  return (
    with s as (
      select b.team_id, b.trial_ends_at, b.price_version_id, private.team_billing_state(b.team_id) as state
      from public.team_billing b)
    select jsonb_build_object(
      'teams_by_state', coalesce((select jsonb_object_agg(state, n) from (select state, count(*) n from s group by state) g), '{}'::jsonb),
      'mrr_cents', coalesce((select sum(v.amount_cents) from s join public.billing_price_versions v on v.id = s.price_version_id
                             where s.state in ('active', 'cancel_scheduled')), 0),
      'trials_ending_7d', (select count(*) from s where s.state = 'trialing' and s.trial_ends_at <= now() + interval '7 days'),
      'past_due', (select count(*) from s where s.state = 'past_due')));
end;
$$;

-- Admin writes (platform admin + MFA, reason required, platform audit) -------------------------------------------
create function public.admin_extend_trial(p_team_id uuid, p_new_trial_ends_at timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_old timestamptz;
begin
  perform private.assert_platform_admin_write('admin');
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_new_trial_ends_at is null then raise exception 'invalid_trial_end' using errcode = '22023'; end if;
  select trial_ends_at into v_old from public.team_billing where team_id = p_team_id for update;
  if not found then raise exception 'no_billing_row' using errcode = 'P0002'; end if;
  update public.team_billing set trial_ends_at = p_new_trial_ends_at where team_id = p_team_id;
  perform private.platform_audit('billing.extend_trial', 'team_billing', p_team_id::text, p_team_id,
    jsonb_build_object('trial_ends_at', v_old), jsonb_build_object('trial_ends_at', p_new_trial_ends_at), btrim(p_reason), (select auth.uid()));
end;
$$;

create function public.admin_comp_team(p_team_id uuid, p_until timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare b public.team_billing;
begin
  perform private.assert_platform_admin_write('admin');
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_until is not null and p_until <= now() then raise exception 'invalid_comp_end' using errcode = '22023'; end if;
  select * into b from public.team_billing where team_id = p_team_id for update;
  if not found then raise exception 'no_billing_row' using errcode = 'P0002'; end if;
  update public.team_billing set comped = true, comp_until = p_until where team_id = p_team_id;
  perform private.platform_audit('billing.comp', 'team_billing', p_team_id::text, p_team_id,
    jsonb_build_object('comped', b.comped, 'comp_until', b.comp_until), jsonb_build_object('comped', true, 'comp_until', p_until), btrim(p_reason), (select auth.uid()));
end;
$$;

create function public.admin_clear_comp(p_team_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare b public.team_billing;
begin
  perform private.assert_platform_admin_write('admin');
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into b from public.team_billing where team_id = p_team_id for update;
  if not found then raise exception 'no_billing_row' using errcode = 'P0002'; end if;
  update public.team_billing set comped = false, comp_until = null where team_id = p_team_id;
  perform private.platform_audit('billing.clear_comp', 'team_billing', p_team_id::text, p_team_id,
    jsonb_build_object('comped', b.comped, 'comp_until', b.comp_until), jsonb_build_object('comped', false), btrim(p_reason), (select auth.uid()));
end;
$$;

-- Service functions for the Edge Functions (service role only) -----------------------------------------------------
-- What checkout needs: state, trial, the price version to use (locked, else the current list price), Stripe ids.
create function public.svc_billing_checkout_context(p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare b public.team_billing; v public.billing_price_versions; v_id uuid;
begin
  select * into b from public.team_billing where team_id = p_team_id;
  if not found then
    return jsonb_build_object('state', private.team_billing_state(p_team_id), 'enabled', private.setting_bool('team_subscription.enabled'));
  end if;
  v_id := coalesce(b.price_version_id, private.ensure_price_version(private.setting_int('team_subscription.price_cents'), null));
  select * into v from public.billing_price_versions where id = v_id;
  return jsonb_build_object(
    'enabled', private.setting_bool('team_subscription.enabled'),
    'state', private.team_billing_state(p_team_id),
    'team_name', (select t.name from public.teams t where t.id = p_team_id),
    'trial_ends_at', b.trial_ends_at,
    'stripe_customer_id', b.stripe_customer_id,
    'stripe_subscription_id', b.stripe_subscription_id,
    'stripe_status', b.stripe_status,
    'automatic_tax', private.setting_bool('team_subscription.automatic_tax'),
    'price_version', jsonb_build_object('id', v.id, 'amount_cents', v.amount_cents, 'currency', v.currency, 'stripe_price_id', v.stripe_price_id),
    'stripe_product_id', (select stripe_product_id from public.billing_stripe_product));
end;
$$;

create function public.svc_set_billing_product(p_product_id text)
returns text language plpgsql security definer set search_path = ''
as $$
declare v text;
begin
  insert into public.billing_stripe_product (stripe_product_id) values (p_product_id) on conflict (singleton) do nothing;
  select stripe_product_id into v from public.billing_stripe_product;
  return v;
end;
$$;

create function public.svc_attach_stripe_price(p_version_id uuid, p_price_id text)
returns text language plpgsql security definer set search_path = ''
as $$
declare v text;
begin
  update public.billing_price_versions set stripe_price_id = p_price_id where id = p_version_id and stripe_price_id is null;
  select stripe_price_id into v from public.billing_price_versions where id = p_version_id;
  return v;
end;
$$;

create function public.svc_set_billing_customer(p_team_id uuid, p_customer_id text)
returns text language plpgsql security definer set search_path = ''
as $$
declare v text;
begin
  update public.team_billing set stripe_customer_id = p_customer_id where team_id = p_team_id and stripe_customer_id is null;
  select stripe_customer_id into v from public.team_billing where team_id = p_team_id;
  return v;
end;
$$;

-- Resolve the team an event belongs to. The caller passes the team id it read from client_reference_id or metadata;
-- we only accept it when the team exists and, if a customer is already stored for it, the customer matches.
create function public.svc_billing_resolve_team(p_team_id uuid, p_customer_id text)
returns uuid language sql stable security definer set search_path = ''
as $$
  select t.id from public.teams t
  left join public.team_billing b on b.team_id = t.id
  where t.id = p_team_id and (b.stripe_customer_id is null or p_customer_id is null or b.stripe_customer_id = p_customer_id);
$$;

create function public.svc_billing_team_by_customer(p_customer_id text)
returns uuid language sql stable security definer set search_path = ''
as $$ select team_id from public.team_billing where stripe_customer_id = p_customer_id; $$;

-- Apply a fetched Stripe subscription snapshot. Idempotent; an older snapshot never overwrites a newer one.
-- p_snap: subscription_id, customer_id, status, current_period_end (iso), cancel_at_period_end, canceled_at, ended_at,
--         price_version_id (from metadata), unit_amount, currency, subscribed_by
create function public.svc_apply_subscription_snapshot(p_team_id uuid, p_snap jsonb, p_snapshot_at timestamptz)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  b public.team_billing;
  v_before text; v_after text;
  v_status text := p_snap ->> 'status';
  v_sub text := p_snap ->> 'subscription_id';
  v_ver public.billing_price_versions;
  v_ver_id uuid;
  v_new_sub boolean;
  v_since timestamptz; v_grace timestamptz;
  v_period_end timestamptz := nullif(p_snap ->> 'current_period_end', '')::timestamptz;
  v_by uuid;
  v_price integer;
begin
  if not exists (select 1 from public.teams where id = p_team_id) then return 'unknown_team'; end if;
  select * into b from public.team_billing where team_id = p_team_id for update;
  if not found then
    insert into public.team_billing (team_id, trial_started_at, trial_ends_at) values (p_team_id, now(), now())
      on conflict (team_id) do nothing;
    select * into b from public.team_billing where team_id = p_team_id for update;
  end if;
  if b.last_snapshot_at is not null and b.last_snapshot_at > p_snapshot_at then return 'stale'; end if;
  if b.stripe_customer_id is not null and p_snap ->> 'customer_id' is not null and b.stripe_customer_id <> p_snap ->> 'customer_id' then
    return 'customer_mismatch';
  end if;
  v_new_sub := b.stripe_subscription_id is distinct from v_sub;
  if v_new_sub and b.stripe_subscription_id is not null and coalesce(b.stripe_status, '') not in ('canceled', 'incomplete_expired') then
    return 'subscription_conflict';
  end if;

  v_before := private.team_billing_state(p_team_id);
  v_ver_id := case when v_new_sub or b.price_version_id is null then nullif(p_snap ->> 'price_version_id', '')::uuid else b.price_version_id end;
  select * into v_ver from public.billing_price_versions where id = v_ver_id;
  if not found then v_ver_id := b.price_version_id; end if;

  if v_status in ('past_due', 'unpaid') then
    v_since := coalesce(b.past_due_since, p_snapshot_at);
    v_grace := coalesce(b.grace_ends_at, v_since + make_interval(days => private.setting_int('team_subscription.grace_days')));
  elsif v_status in ('active', 'trialing') then
    v_since := null; v_grace := null;
  else
    v_since := b.past_due_since; v_grace := b.grace_ends_at;
  end if;
  begin v_by := nullif(p_snap ->> 'subscribed_by', '')::uuid; exception when others then v_by := null; end;
  if v_by is not null and not exists (select 1 from public.profiles where id = v_by) then v_by := null; end if;

  update public.team_billing set
    stripe_customer_id = coalesce(b.stripe_customer_id, p_snap ->> 'customer_id'),
    stripe_subscription_id = v_sub,
    stripe_status = v_status,
    current_period_end = v_period_end,
    cancel_at_period_end = coalesce((p_snap ->> 'cancel_at_period_end')::boolean, false),
    canceled_at = nullif(p_snap ->> 'canceled_at', '')::timestamptz,
    ended_at = nullif(p_snap ->> 'ended_at', '')::timestamptz,
    price_version_id = v_ver_id,
    price_mismatch = (v_ver.id is not null and ((p_snap ->> 'unit_amount')::integer is distinct from v_ver.amount_cents
                       or lower(coalesce(p_snap ->> 'currency', '')) <> v_ver.currency)),
    subscribed_by = case when v_new_sub then coalesce(v_by, b.subscribed_by) else b.subscribed_by end,
    subscribed_at = case when v_new_sub then p_snapshot_at else b.subscribed_at end,
    past_due_since = v_since, grace_ends_at = v_grace,
    last_snapshot_at = p_snapshot_at
  where team_id = p_team_id;

  v_after := private.team_billing_state(p_team_id);
  v_price := private.team_price_cents(p_team_id);
  if v_before is distinct from v_after then
    perform private.write_audit('billing.' || v_after, 'team_billing', p_team_id, p_team_id, null,
      jsonb_build_object('state', v_before), jsonb_build_object('state', v_after));
    if v_after in ('active', 'cancel_scheduled') and v_before in ('trialing', 'trial_expired', 'lapsed', 'off', 'comped') then
      perform private.notify_team_billing(p_team_id, 'subscribed', 'You''re subscribed',
        format('Your team is subscribed at %s a month. Next charge %s.', private.money_text(v_price), to_char(v_period_end, 'Mon FMDD, YYYY')),
        'subscribed:' || v_sub || ':' || extract(epoch from p_snapshot_at)::bigint);
    elsif v_after = 'cancel_scheduled' then
      perform private.notify_team_billing(p_team_id, 'cancel_scheduled', 'Subscription will end',
        format('Your subscription ends %s. Everything keeps working until then.', to_char(v_period_end, 'Mon FMDD, YYYY')),
        'cancel:' || v_sub || ':' || extract(epoch from p_snapshot_at)::bigint);
    elsif v_after = 'active' and v_before = 'cancel_scheduled' then
      perform private.notify_team_billing(p_team_id, 'resumed', 'Subscription resumed',
        format('Your subscription continues. Next charge %s.', to_char(v_period_end, 'Mon FMDD, YYYY')),
        'resume:' || v_sub || ':' || extract(epoch from p_snapshot_at)::bigint);
    elsif v_after = 'active' and v_before = 'past_due' then
      perform private.notify_team_billing(p_team_id, 'recovered', 'Payment received',
        'Your payment went through. Nothing else is needed.',
        'recovered:' || v_sub || ':' || extract(epoch from p_snapshot_at)::bigint);
    elsif v_after = 'past_due' then
      perform private.notify_team_billing(p_team_id, 'payment_failed', 'Payment failed',
        format('We could not charge your card. Update your payment method by %s to keep everything on.', to_char(v_grace, 'Mon FMDD')),
        'failed:' || v_sub || ':' || extract(epoch from v_since)::bigint);
    elsif v_after = 'lapsed' and v_before in ('active', 'cancel_scheduled') then
      perform private.notify_team_billing(p_team_id, 'ended', 'Subscription ended',
        'Your subscription has ended. Subscribe again from team settings to turn new sign-ups and payment requests back on.',
        'ended:' || v_sub || ':' || extract(epoch from p_snapshot_at)::bigint);
    end if;
  end if;
  return 'applied';
end;
$$;

create function public.svc_billing_notify(p_team_id uuid, p_notice text, p_key text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if p_notice = 'payment_action_required' then
    return private.notify_team_billing(p_team_id, 'payment_action_required', 'Payment needs confirmation',
      'Your bank needs you to confirm the subscription payment. Open billing to finish it.', p_key);
  end if;
  return false;
end;
$$;

create function public.svc_upsert_billing_invoice(p_team_id uuid, p_inv jsonb)
returns text language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.teams where id = p_team_id) then return 'unknown_team'; end if;
  insert into public.team_billing_invoices (team_id, stripe_invoice_id, invoice_number, status, amount_due_cents,
    amount_paid_cents, currency, period_start, period_end, hosted_invoice_url, invoice_pdf_url, paid_at, stripe_created_at)
  values (p_team_id, p_inv ->> 'id', p_inv ->> 'number', p_inv ->> 'status', coalesce((p_inv ->> 'amount_due')::bigint, 0),
    coalesce((p_inv ->> 'amount_paid')::bigint, 0), coalesce(lower(p_inv ->> 'currency'), 'usd'),
    nullif(p_inv ->> 'period_start', '')::timestamptz, nullif(p_inv ->> 'period_end', '')::timestamptz,
    p_inv ->> 'hosted_invoice_url', p_inv ->> 'invoice_pdf', nullif(p_inv ->> 'paid_at', '')::timestamptz,
    nullif(p_inv ->> 'created', '')::timestamptz)
  on conflict (stripe_invoice_id) do update set
    invoice_number = excluded.invoice_number, status = excluded.status, amount_due_cents = excluded.amount_due_cents,
    amount_paid_cents = excluded.amount_paid_cents, period_start = excluded.period_start, period_end = excluded.period_end,
    hosted_invoice_url = excluded.hosted_invoice_url, invoice_pdf_url = excluded.invoice_pdf_url,
    paid_at = excluded.paid_at, updated_at = now()
  where public.team_billing_invoices.team_id = excluded.team_id;
  return 'applied';
end;
$$;

-- Refund / dispute facts for a SUBSCRIPTION invoice's charge. No automatic restriction on a dispute.
create function public.svc_billing_invoice_charge(p_invoice_id text, p_refunded_cents bigint, p_disputed boolean)
returns text language plpgsql security definer set search_path = ''
as $$
begin
  update public.team_billing_invoices set
    amount_refunded_cents = coalesce(p_refunded_cents, amount_refunded_cents),
    disputed = disputed or coalesce(p_disputed, false), updated_at = now()
  where stripe_invoice_id = p_invoice_id;
  return case when found then 'applied' else 'unknown_invoice' end;
end;
$$;

create function public.svc_billing_reconcile_candidates(p_limit integer default 50)
returns table (team_id uuid, stripe_subscription_id text)
language sql stable security definer set search_path = ''
as $$
  select b.team_id, b.stripe_subscription_id from public.team_billing b
  where b.stripe_subscription_id is not null and private.setting_bool('team_subscription.enabled')
    and (b.last_snapshot_at is null or b.last_snapshot_at < now() - interval '1 hour'
         or private.team_billing_state(b.team_id) = 'past_due'
         or (b.stripe_status in ('active', 'trialing') and b.current_period_end < now() - interval '1 hour')
         or (b.stripe_status in ('past_due', 'unpaid') and b.grace_ends_at < now()))
  order by b.last_snapshot_at nulls first limit least(greatest(p_limit, 1), 200);
$$;

-- Hourly sweep: sends notices once per transition and writes the team audit event once. Correctness never depends on it:
-- state is computed from time. Every notice is keyed, so re-runs and overlaps repeat nothing.
create function private.billing_sweep()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  b record; v_state text; v_days integer[]; d integer; v_min integer; v_due integer[]; v_n integer := 0; v_price integer;
begin
  if not private.setting_bool('team_subscription.enabled') then return 0; end if;
  v_days := private.setting_int_array('team_subscription.trial_reminder_days');
  for b in select * from public.team_billing loop
    v_state := private.team_billing_state(b.team_id);
    v_price := private.team_price_cents(b.team_id);
    if v_state = 'trialing' then
      if private.notify_team_billing(b.team_id, 'trial_started', 'Your free trial has started',
           format('Free until %s. No card needed until you subscribe (%s a month after that).', to_char(b.trial_ends_at, 'Mon FMDD, YYYY'), private.money_text(v_price)),
           'trial_started:' || extract(epoch from b.trial_started_at)::bigint) then v_n := v_n + 1; end if;
      -- Reminders: skip any value as long as the whole trial; send only the closest due one, mark the rest.
      v_due := array(select x from unnest(v_days) x
                     where b.trial_ends_at - make_interval(days => x) <= now() and make_interval(days => x) < b.trial_ends_at - b.trial_started_at
                     order by x);
      if coalesce(array_length(v_due, 1), 0) > 0 then
        v_min := v_due[1];
        foreach d in array v_due loop
          if d = v_min then
            if private.notify_team_billing(b.team_id, 'trial_ending', 'Your free trial is ending',
                 format('Your trial ends %s. Subscribe for %s a month to keep creating payment requests, registrations and invites.', to_char(b.trial_ends_at, 'Mon FMDD'), private.money_text(v_price)),
                 'trial_reminder:' || d || ':' || extract(epoch from b.trial_ends_at)::bigint) then v_n := v_n + 1; end if;
          else
            insert into public.team_billing_notices (team_id, notice_key)
              values (b.team_id, 'trial_reminder:' || d || ':' || extract(epoch from b.trial_ends_at)::bigint) on conflict do nothing;
          end if;
        end loop;
      end if;
    elsif v_state = 'trial_expired' then
      if private.notify_team_billing(b.team_id, 'trial_ended', 'Your free trial has ended',
           format('Subscribe for %s a month to turn new payment requests, registrations, invites and join approvals back on. Everything else keeps working.', private.money_text(v_price)),
           'trial_ended:' || extract(epoch from b.trial_ends_at)::bigint) then
        v_n := v_n + 1;
        perform private.write_audit('billing.trial_expired', 'team_billing', b.team_id, b.team_id, null, null, jsonb_build_object('state', 'trial_expired'));
      end if;
      if private.notify_team_billing(b.team_id, 'restricted', 'Some team actions are paused',
           'New payment requests, registrations, invites and join approvals are paused. Ask a team admin to subscribe.',
           'restricted_staff:trial:' || extract(epoch from b.trial_ends_at)::bigint, 'staff') then v_n := v_n + 1; end if;
    elsif v_state = 'past_due' then
      if b.grace_ends_at - interval '1 day' <= now() then
        if private.notify_team_billing(b.team_id, 'final_warning', 'Last chance to fix your payment',
             format('Update your payment method by %s or new payment requests, registrations, invites and join approvals will pause.', to_char(b.grace_ends_at, 'Mon FMDD')),
             'final_warning:' || extract(epoch from b.grace_ends_at)::bigint) then v_n := v_n + 1; end if;
      end if;
    elsif v_state = 'lapsed' then
      if b.past_due_since is not null and b.grace_ends_at is not null then
        if private.notify_team_billing(b.team_id, 'restricted_nonpayment', 'Some team actions are paused',
             'We could not collect your subscription payment, so new payment requests, registrations, invites and join approvals are paused. Update your payment method and subscribe again to turn them back on.',
             'restricted_nonpayment:' || extract(epoch from b.grace_ends_at)::bigint) then
          v_n := v_n + 1;
          perform private.write_audit('billing.restricted', 'team_billing', b.team_id, b.team_id, null, null, jsonb_build_object('state', 'lapsed'));
        end if;
        if private.notify_team_billing(b.team_id, 'restricted', 'Some team actions are paused',
             'New payment requests, registrations, invites and join approvals are paused. Ask a team admin to fix billing.',
             'restricted_staff:lapsed:' || extract(epoch from b.grace_ends_at)::bigint, 'staff') then v_n := v_n + 1; end if;
      else
        if private.notify_team_billing(b.team_id, 'restricted', 'Some team actions are paused',
             'New payment requests, registrations, invites and join approvals are paused. Ask a team admin to subscribe.',
             'restricted_staff:ended:' || coalesce(extract(epoch from coalesce(b.ended_at, b.current_period_end))::bigint, 0), 'staff') then v_n := v_n + 1; end if;
      end if;
    end if;
  end loop;
  return v_n;
end;
$$;

-- Account deletion: an only-admin of a team with a live subscription must transfer admin or cancel first.
create or replace function public.account_deletion_blockers()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name)
      from public.team_memberships m
      join public.teams t on t.id = m.team_id
      where m.profile_id = v_uid and m.role = 'admin' and m.status = 'active'
        and not exists (
          select 1 from public.team_memberships o
          where o.team_id = m.team_id and o.role = 'admin' and o.status = 'active' and o.id <> m.id)
    ), '[]'::jsonb),
    'clubs', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
      from public.club_memberships m
      join public.clubs c on c.id = m.club_id
      where m.profile_id = v_uid and m.role = 'admin' and m.status = 'active'
        and not exists (
          select 1 from public.club_memberships o
          where o.club_id = m.club_id and o.role = 'admin' and o.status = 'active' and o.id <> m.id)
    ), '[]'::jsonb),
    'households', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name) order by h.name)
      from public.household_members hm
      join public.households h on h.id = hm.household_id
      where hm.profile_id = v_uid
        and exists (select 1 from public.players p where p.household_id = h.id)
        and not exists (
          select 1 from public.household_members o
          where o.household_id = hm.household_id and o.profile_id <> v_uid)
    ), '[]'::jsonb),
    -- An active payment plan (installments still to be paid) must be completed, cancelled or waived first.
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', e.title || ' · ' || r.display_id) order by e.title, r.display_id)
      from public.payment_requests r
      join public.payment_events e on e.id = r.payment_event_id
      where r.plan_count is not null
        and exists (select 1 from public.household_members hm where hm.household_id = r.household_id and hm.profile_id = v_uid)
        and exists (select 1 from public.payment_request_installments i where i.request_id = r.id and i.status in ('scheduled', 'due', 'processing', 'failed'))
    ), '[]'::jsonb),
    -- A team the person alone administers with a live team subscription (active, past due or cancel-scheduled).
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name)
      from public.team_memberships m
      join public.teams t on t.id = m.team_id
      where m.profile_id = v_uid and m.role = 'admin' and m.status = 'active'
        and private.team_billing_state(t.id) in ('active', 'past_due', 'cancel_scheduled')
        and not exists (
          select 1 from public.team_memberships o
          where o.team_id = m.team_id and o.role = 'admin' and o.status = 'active' and o.id <> m.id)
    ), '[]'::jsonb)
  );
end;
$$;

-- Cron: hourly sweep, and the billing reconciler kick (same Vault secrets as payments-reconcile).
create function private.kick_billing_reconcile()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'billing_reconcile_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'reconcile_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-reconcile-secret', v_secret),
    body := '{}'::jsonb, timeout_milliseconds := 5000);
exception when others then
  null;
end;
$$;
select cron.schedule('billing-sweep', '23 * * * *', 'select private.billing_sweep()');
select cron.schedule('billing-reconcile', '*/15 * * * *', 'select private.kick_billing_reconcile()');

revoke execute on function private.billing_sweep(), private.kick_billing_reconcile() from public, anon, authenticated;
grant execute on function private.billing_sweep() to service_role;
revoke execute on function
  public.admin_list_team_billing(text, text, integer, jsonb), public.admin_get_team_billing(uuid), public.admin_billing_metrics(),
  public.admin_extend_trial(uuid, timestamptz, text), public.admin_comp_team(uuid, timestamptz, text), public.admin_clear_comp(uuid, text),
  public.svc_billing_checkout_context(uuid), public.svc_set_billing_product(text), public.svc_attach_stripe_price(uuid, text),
  public.svc_set_billing_customer(uuid, text), public.svc_billing_resolve_team(uuid, text), public.svc_billing_team_by_customer(text),
  public.svc_apply_subscription_snapshot(uuid, jsonb, timestamptz), public.svc_billing_notify(uuid, text, text),
  public.svc_upsert_billing_invoice(uuid, jsonb), public.svc_billing_invoice_charge(text, bigint, boolean),
  public.svc_billing_reconcile_candidates(integer), public.account_deletion_blockers()
  from public, anon, authenticated;
grant execute on function
  public.admin_list_team_billing(text, text, integer, jsonb), public.admin_get_team_billing(uuid), public.admin_billing_metrics(),
  public.admin_extend_trial(uuid, timestamptz, text), public.admin_comp_team(uuid, timestamptz, text), public.admin_clear_comp(uuid, text),
  public.account_deletion_blockers()
  to authenticated;
grant execute on function
  public.svc_billing_checkout_context(uuid), public.svc_set_billing_product(text), public.svc_attach_stripe_price(uuid, text),
  public.svc_set_billing_customer(uuid, text), public.svc_billing_resolve_team(uuid, text), public.svc_billing_team_by_customer(text),
  public.svc_apply_subscription_snapshot(uuid, jsonb, timestamptz), public.svc_billing_notify(uuid, text, text),
  public.svc_upsert_billing_invoice(uuid, jsonb), public.svc_billing_invoice_charge(text, bigint, boolean),
  public.svc_billing_reconcile_candidates(integer)
  to service_role;
