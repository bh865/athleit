-- Team subscriptions (1/3): platform admins, dynamic platform settings, audited admin plumbing
--
-- Athleit staff ("platform admins") are an allowlist of profiles. Nothing here is reachable by a
-- client table grant: every read and write goes through a SECURITY DEFINER function that checks
-- the allowlist, and every WRITE additionally requires an MFA session (JWT aal = aal2).
-- Commercial numbers (price, trial and grace length, reminder days) are rows in platform_settings,
-- described by platform_setting_definitions so a generic admin form can render from the data alone.

-- platform_admins ---------------------------------------------------------------
create table public.platform_admins (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null default 'support'
    constraint platform_admins_role check (role in ('owner', 'admin', 'support')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);
create index platform_admins_created_by_idx on public.platform_admins (created_by) where created_by is not null;
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;
-- No policy: RLS denies everything. Rows are created by the service role or SQL only (docs/billing.md runbook).

create function private.platform_role_rank(p_role text)
returns integer language sql immutable set search_path = ''
as $$ select case p_role when 'owner' then 3 when 'admin' then 2 when 'support' then 1 else 0 end; $$;

-- The caller's platform role, or null.
create function private.platform_role()
returns text language sql stable security definer set search_path = ''
as $$ select pa.role from public.platform_admins pa where pa.profile_id = (select auth.uid()); $$;

create function private.is_platform_admin(p_role_min text default 'support')
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(private.platform_role_rank(private.platform_role()) >= private.platform_role_rank(p_role_min), false);
$$;

-- Admin READ: an admin session of at least p_role_min.
create function private.assert_platform_admin(p_role_min text default 'support')
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.is_platform_admin(p_role_min) then raise exception 'not_authorized' using errcode = '42501'; end if;
end;
$$;

-- Admin WRITE: an admin of at least p_role_min on an MFA (aal2) session.
create function private.assert_platform_admin_write(p_role_min text default 'admin')
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_platform_admin(p_role_min);
  if coalesce((select auth.jwt()) ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'mfa_required' using errcode = '42501', detail = 'Admin changes need a multi-factor session.';
  end if;
end;
$$;

-- A signed-in client can learn only its own platform role (null for everyone else).
create function public.platform_admin_role()
returns text language sql stable security definer set search_path = ''
as $$ select private.platform_role(); $$;

-- Settings -----------------------------------------------------------------------
create table public.platform_setting_definitions (
  key text primary key,
  label text not null,
  description text not null,
  setting_group text not null,
  value_type text not null constraint psd_value_type check (value_type in ('integer', 'boolean', 'text', 'integer_array')),
  min_value integer,
  max_value integer,
  unit text,
  default_value jsonb not null,
  write_role text not null default 'admin' constraint psd_write_role check (write_role in ('owner', 'admin')),
  sort_order integer not null default 0
);
create table public.platform_settings (
  key text primary key references public.platform_setting_definitions (key) on delete restrict,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create index platform_settings_updated_by_idx on public.platform_settings (updated_by) where updated_by is not null;
create table public.platform_setting_history (
  id bigint generated always as identity primary key,
  key text not null references public.platform_setting_definitions (key) on delete restrict,
  old_value jsonb,
  new_value jsonb not null,
  changed_by uuid references public.profiles (id) on delete set null,
  reason text not null,
  changed_at timestamptz not null default now()
);
create index platform_setting_history_key_idx on public.platform_setting_history (key, changed_at desc);
create index platform_setting_history_changed_by_idx on public.platform_setting_history (changed_by) where changed_by is not null;

-- Platform-internal audit trail. NOT the team-readable audit_log.
create table public.platform_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  team_id uuid references public.teams (id) on delete set null,
  before jsonb,
  after jsonb,
  reason text,
  at timestamptz not null default now()
);
create index platform_audit_log_team_idx on public.platform_audit_log (team_id, at desc) where team_id is not null;
create index platform_audit_log_actor_idx on public.platform_audit_log (actor_id) where actor_id is not null;
create index platform_audit_log_at_idx on public.platform_audit_log (at desc);

alter table public.platform_setting_definitions enable row level security;
alter table public.platform_settings enable row level security;
alter table public.platform_setting_history enable row level security;
alter table public.platform_audit_log enable row level security;
revoke all on public.platform_setting_definitions, public.platform_settings,
  public.platform_setting_history, public.platform_audit_log from anon, authenticated;
-- No policies and no grants: only SECURITY DEFINER functions and the service role touch these tables.

create function private.platform_audit(
  p_action text, p_target_type text, p_target_id text, p_team_id uuid,
  p_before jsonb, p_after jsonb, p_reason text, p_actor uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into public.platform_audit_log (actor_id, action, target_type, target_id, team_id, before, after, reason)
  values (p_actor, p_action, p_target_type, p_target_id, p_team_id, p_before, p_after, p_reason);
$$;

-- Price versions: Stripe Prices are immutable, so a list price is a row; a team subscription locks the row it signed up on.
create table public.billing_price_versions (
  id uuid primary key default gen_random_uuid(),
  amount_cents integer not null constraint bpv_amount check (amount_cents between 1 and 10000000),
  currency text not null default 'usd' constraint bpv_currency check (currency = 'usd'),
  billing_interval text not null default 'month' constraint bpv_interval check (billing_interval = 'month'),
  stripe_price_id text constraint bpv_stripe_price check (stripe_price_id ~ '^price_[A-Za-z0-9_]+$'),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (amount_cents, currency, billing_interval)
);
create index billing_price_versions_created_by_idx on public.billing_price_versions (created_by) where created_by is not null;
alter table public.billing_price_versions enable row level security;
revoke all on public.billing_price_versions from anon, authenticated;

-- Immutable once a Stripe price is attached; the amount never changes; versions are never deleted.
create function private.price_version_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'price_version_immutable' using errcode = '23514'; end if;
  if new.amount_cents <> old.amount_cents or new.currency <> old.currency or new.billing_interval <> old.billing_interval
     or (old.stripe_price_id is not null and new.stripe_price_id is distinct from old.stripe_price_id) then
    raise exception 'price_version_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger billing_price_versions_guard before update or delete on public.billing_price_versions
  for each row execute function private.price_version_guard();

-- The single Stripe Product (created lazily by the checkout function, stored once).
create table public.billing_stripe_product (
  singleton boolean primary key default true constraint bsp_singleton check (singleton),
  stripe_product_id text not null constraint bsp_product check (stripe_product_id ~ '^prod_[A-Za-z0-9_]+$'),
  created_at timestamptz not null default now()
);
alter table public.billing_stripe_product enable row level security;
revoke all on public.billing_stripe_product from anon, authenticated;

create function private.ensure_price_version(p_cents integer, p_actor uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.billing_price_versions (amount_cents, created_by) values (p_cents, p_actor)
    on conflict (amount_cents, currency, billing_interval) do nothing;
  select id into v_id from public.billing_price_versions
    where amount_cents = p_cents and currency = 'usd' and billing_interval = 'month';
  return v_id;
end;
$$;

-- Definitions and seed values (the only place a default price, trial or grace length appears) ----
insert into public.platform_setting_definitions
  (key, label, description, setting_group, value_type, min_value, max_value, unit, default_value, write_role, sort_order) values
  ('team_subscription.enabled', 'Team subscriptions on', 'Master switch. Off: every team has full access, no billing screens show and no notices are sent. Turn on through private.enable_team_billing so existing teams get a trial.', 'Team subscription', 'boolean', null, null, null, 'false', 'owner', 10),
  ('team_subscription.price_cents', 'Monthly price', 'List price per team per month for teams that subscribe after the change. Teams already paying keep the price they signed up at.', 'Team subscription', 'integer', 100, 50000, 'cents (USD)', '1000', 'admin', 20),
  ('team_subscription.trial_days', 'Free trial length', 'Days of free trial for teams created after the change. A running trial is never shortened or extended by this setting.', 'Team subscription', 'integer', 0, 90, 'days', '14', 'admin', 30),
  ('team_subscription.grace_days', 'Grace after a failed payment', 'Days a team keeps full access (with a banner) after a payment fails, before restricted access starts.', 'Team subscription', 'integer', 0, 30, 'days', '21', 'admin', 40),
  ('team_subscription.trial_reminder_days', 'Trial reminder days', 'How many days before the trial ends to remind team admins. One reminder per value.', 'Team subscription', 'integer_array', 1, 90, 'days', '[3, 1]', 'admin', 50),
  ('team_subscription.automatic_tax', 'Collect tax automatically', 'Turn on Stripe automatic tax (and collect a billing address) at checkout. Confirm with an accountant first.', 'Team subscription', 'boolean', null, null, null, 'false', 'owner', 60);
insert into public.platform_settings (key, value)
  select key, default_value from public.platform_setting_definitions;
insert into public.billing_price_versions (amount_cents)
  select (value #>> '{}')::integer from public.platform_settings where key = 'team_subscription.price_cents';

-- Typed readers (security definer: callers never read platform_settings directly) -------------
create function private.setting_int(p_key text)
returns integer language sql stable security definer set search_path = ''
as $$ select (value #>> '{}')::integer from public.platform_settings where key = p_key; $$;
create function private.setting_bool(p_key text)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((value #>> '{}')::boolean, false) from public.platform_settings where key = p_key; $$;
create function private.setting_int_array(p_key text)
returns integer[] language sql stable security definer set search_path = ''
as $$ select coalesce((select array_agg(x::integer order by x::integer desc) from jsonb_array_elements_text(value) x), '{}') from public.platform_settings where key = p_key; $$;

-- The setter (service role / SQL runbook). Validates against the definition; a reason is required. -----
create function private.set_platform_setting(p_key text, p_value jsonb, p_actor uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  d public.platform_setting_definitions;
  v_old jsonb;
  v_norm jsonb;
  el jsonb;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select * into d from public.platform_setting_definitions where key = p_key;
  if not found then raise exception 'unknown_setting' using errcode = '22023'; end if;

  if d.value_type = 'integer' then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric) then
      raise exception 'invalid_setting_value' using errcode = '22023', detail = 'Expected a whole number.';
    end if;
    if (d.min_value is not null and (p_value #>> '{}')::numeric < d.min_value)
       or (d.max_value is not null and (p_value #>> '{}')::numeric > d.max_value) then
      raise exception 'setting_out_of_range' using errcode = '22023', detail = format('Allowed %s to %s.', d.min_value, d.max_value);
    end if;
    v_norm := to_jsonb((p_value #>> '{}')::integer);
  elsif d.value_type = 'boolean' then
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'invalid_setting_value' using errcode = '22023'; end if;
    v_norm := p_value;
  elsif d.value_type = 'text' then
    if jsonb_typeof(p_value) <> 'string' or char_length(p_value #>> '{}') > 500 then
      raise exception 'invalid_setting_value' using errcode = '22023';
    end if;
    v_norm := p_value;
  else -- integer_array: unique, sorted descending, each within bounds, at most 10
    if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 10 then
      raise exception 'invalid_setting_value' using errcode = '22023';
    end if;
    for el in select * from jsonb_array_elements(p_value) loop
      if jsonb_typeof(el) <> 'number' or (el #>> '{}')::numeric <> trunc((el #>> '{}')::numeric) then
        raise exception 'invalid_setting_value' using errcode = '22023', detail = 'Expected whole numbers.';
      end if;
      if (d.min_value is not null and (el #>> '{}')::numeric < d.min_value)
         or (d.max_value is not null and (el #>> '{}')::numeric > d.max_value) then
        raise exception 'setting_out_of_range' using errcode = '22023', detail = format('Allowed %s to %s.', d.min_value, d.max_value);
      end if;
    end loop;
    v_norm := coalesce((select jsonb_agg(x order by x desc) from (select distinct (e #>> '{}')::integer x from jsonb_array_elements(p_value) e) s), '[]'::jsonb);
  end if;

  select value into v_old from public.platform_settings where key = p_key for update;
  if v_old is not distinct from v_norm then return; end if;

  insert into public.platform_settings (key, value, updated_at, updated_by) values (p_key, v_norm, now(), p_actor)
    on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  insert into public.platform_setting_history (key, old_value, new_value, changed_by, reason)
    values (p_key, v_old, v_norm, p_actor, btrim(p_reason));
  perform private.platform_audit('setting.change', 'platform_settings', p_key, null,
    jsonb_build_object('value', v_old), jsonb_build_object('value', v_norm), btrim(p_reason), p_actor);

  -- A new list price gets its own immutable version in the SAME transaction (reused when the amount existed before).
  if p_key = 'team_subscription.price_cents' then
    perform private.ensure_price_version((v_norm #>> '{}')::integer, p_actor);
  end if;
end;
$$;

-- Admin wrapper: platform admin (the key's write role or higher) on an MFA session.
create function public.admin_set_setting(p_key text, p_value jsonb, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_role text;
begin
  perform private.assert_platform_admin('support'); -- never reveal which keys exist to anyone else
  select write_role into v_role from public.platform_setting_definitions where key = p_key;
  if not found then raise exception 'unknown_setting' using errcode = '22023'; end if;
  perform private.assert_platform_admin_write(v_role);
  perform private.set_platform_setting(p_key, p_value, (select auth.uid()), p_reason);
end;
$$;

-- Everything a generic admin form needs: definition, current value and the last few changes.
create function public.admin_list_settings()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_platform_admin('support');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'key', d.key, 'label', d.label, 'description', d.description, 'group', d.setting_group,
      'value_type', d.value_type, 'min', d.min_value, 'max', d.max_value, 'unit', d.unit,
      'default', d.default_value, 'write_role', d.write_role, 'value', s.value,
      'updated_at', s.updated_at,
      'history', coalesce((select jsonb_agg(jsonb_build_object('old', h.old_value, 'new', h.new_value, 'reason', h.reason, 'at', h.changed_at) order by h.changed_at desc)
                           from (select * from public.platform_setting_history x where x.key = d.key order by x.changed_at desc limit 5) h), '[]'::jsonb))
      order by d.sort_order)
    from public.platform_setting_definitions d join public.platform_settings s on s.key = d.key), '[]'::jsonb);
end;
$$;

revoke execute on function
  private.platform_role_rank(text), private.platform_role(), private.is_platform_admin(text),
  private.assert_platform_admin(text), private.assert_platform_admin_write(text),
  private.platform_audit(text, text, text, uuid, jsonb, jsonb, text, uuid), private.ensure_price_version(integer, uuid),
  private.setting_int(text), private.setting_bool(text), private.setting_int_array(text),
  private.set_platform_setting(text, jsonb, uuid, text), private.price_version_guard()
  from public, anon, authenticated;
grant execute on function
  private.platform_role_rank(text), private.platform_role(), private.is_platform_admin(text),
  private.assert_platform_admin(text), private.assert_platform_admin_write(text),
  private.platform_audit(text, text, text, uuid, jsonb, jsonb, text, uuid), private.ensure_price_version(integer, uuid),
  private.setting_int(text), private.setting_bool(text), private.setting_int_array(text),
  private.set_platform_setting(text, jsonb, uuid, text)
  to service_role;
-- The public wrappers call private helpers as the definer, so authenticated needs no private grants.
revoke execute on function public.platform_admin_role(), public.admin_set_setting(text, jsonb, text),
  public.admin_list_settings() from public, anon, authenticated;
grant execute on function public.platform_admin_role(), public.admin_set_setting(text, jsonb, text),
  public.admin_list_settings() to authenticated;
