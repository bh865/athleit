-- Phase 4 (A1): payments foundation: notification category, fee_config, connected_accounts
--
-- Money is integer cents + currency (USD only for now); there are no floats in any money path.
-- Payment tables are written only by SECURITY DEFINER functions or by Edge Functions running
-- with the service role. Clients get read access only, scoped by membership.

-- The 'payments' notification category replaces the 'payments_reserved' placeholder. The old
-- value stays allowed (nothing writes it) so no existing row can violate the new constraint.
alter table public.notification_preferences drop constraint notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category in ('messages', 'announcements', 'schedule', 'payments', 'payments_reserved'));
alter table public.notification_outbox drop constraint notification_outbox_category_check;
alter table public.notification_outbox add constraint notification_outbox_category_check
  check (category in ('messages', 'announcements', 'schedule', 'payments', 'payments_reserved'));

create or replace function private.seed_notification_preferences(p_profile_id uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into public.notification_preferences (profile_id, channel, category)
  select p_profile_id, ch, cat
  from unnest(array['push', 'email']) ch,
       unnest(array['messages', 'announcements', 'schedule', 'payments']) cat
  on conflict do nothing;
$$;
insert into public.notification_preferences (profile_id, channel, category)
select p.id, ch, 'payments' from public.profiles p, unnest(array['push', 'email']) ch
on conflict do nothing;

-- Human-readable ids. Sequences are only ever advanced by the definer functions below; the
-- display id is a label, never an authority (every lookup is by uuid + RLS).
create sequence private.payment_request_display_seq start 3317;
create sequence private.payment_receipt_display_seq start 20481;

-- fee_config -----------------------------------------------------------------
-- One ACTIVE row at a time; every edit inserts a new row and deactivates the old one, so
-- history is kept. Edited only through private.admin_set_fee_config (service role).
-- stripe_fee_* are ESTIMATES used only to size the pass-through "service fee"; the real
-- Stripe fee is read from the balance transaction and recorded on payments.
create table public.fee_config (
  id uuid primary key default gen_random_uuid(),
  platform_fee_flat_cents integer not null default 0
    constraint fee_config_flat_range check (platform_fee_flat_cents between 0 and 10000),
  platform_fee_bps integer not null default 0
    constraint fee_config_bps_range check (platform_fee_bps between 0 and 2000),
  stripe_fee_bps integer not null default 290
    constraint fee_config_stripe_bps_range check (stripe_fee_bps between 0 and 1000),
  stripe_fee_fixed_cents integer not null default 30
    constraint fee_config_stripe_fixed_range check (stripe_fee_fixed_cents between 0 and 100),
  -- Refund policy (what happens to the Athleit charge and the pass-through service fee).
  -- Stripe does not return its own processing fee on a refund; these flags only decide what
  -- Athleit hands back to the payer. See docs/payments.md.
  refund_athleit_charge_on_full boolean not null default true,
  refund_athleit_charge_on_partial boolean not null default false,
  refund_service_fee_on_full boolean not null default true,
  refund_service_fee_on_partial boolean not null default false,
  is_active boolean not null default true,
  effective_from timestamptz not null default now(),
  note text constraint fee_config_note_length check (char_length(note) <= 300),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index fee_config_one_active on public.fee_config ((true)) where is_active;
create index fee_config_created_by_idx on public.fee_config (created_by) where created_by is not null;

-- Initial row: Athleit charges nothing until the owner picks pricing (decision pending);
-- Stripe estimate = US standard card pricing, only used for pass_on estimates.
insert into public.fee_config (note) values ('Initial config: no Athleit charge; Stripe estimate 2.9% + 30c');

-- Edit the config (service role only; no client can call this). Audited.
create function private.admin_set_fee_config(
  p_platform_fee_flat_cents integer, p_platform_fee_bps integer,
  p_stripe_fee_bps integer, p_stripe_fee_fixed_cents integer,
  p_refund_athleit_charge_on_full boolean, p_refund_athleit_charge_on_partial boolean,
  p_refund_service_fee_on_full boolean, p_refund_service_fee_on_partial boolean,
  p_note text default null, p_actor uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.fee_config;
  v_id uuid;
begin
  select * into v_old from public.fee_config where is_active for update;
  update public.fee_config set is_active = false where is_active;
  insert into public.fee_config (
    platform_fee_flat_cents, platform_fee_bps, stripe_fee_bps, stripe_fee_fixed_cents,
    refund_athleit_charge_on_full, refund_athleit_charge_on_partial,
    refund_service_fee_on_full, refund_service_fee_on_partial, note, created_by)
  values (p_platform_fee_flat_cents, p_platform_fee_bps, p_stripe_fee_bps, p_stripe_fee_fixed_cents,
    p_refund_athleit_charge_on_full, p_refund_athleit_charge_on_partial,
    p_refund_service_fee_on_full, p_refund_service_fee_on_partial, p_note, p_actor)
  returning id into v_id;
  insert into public.audit_log (actor_id, action, target_type, target_id, before, after)
  values (p_actor, 'fee_config.change', 'fee_config', v_id, to_jsonb(v_old),
          (select to_jsonb(f) from public.fee_config f where f.id = v_id));
  return v_id;
end;
$$;

alter table public.fee_config enable row level security;
revoke all on public.fee_config from anon, authenticated;
grant select on public.fee_config to authenticated;
create policy "Signed-in users read fee config" on public.fee_config
  for select to authenticated using (true);

-- connected_accounts ---------------------------------------------------------
-- One Stripe Connect (Express) account per team or per club. Written only by the
-- connect-onboarding / stripe-webhook Edge Functions (service role).
create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid unique references public.teams (id) on delete restrict,
  club_id uuid unique references public.clubs (id) on delete restrict,
  stripe_account_id text not null unique
    constraint connected_accounts_stripe_id_format check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  details_submitted boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  requirements jsonb not null default '{}'
    constraint connected_accounts_requirements_size check (pg_column_size(requirements) <= 8192),
  default_fee_policy text not null default 'absorb'
    constraint connected_accounts_fee_policy check (default_fee_policy in ('absorb', 'pass_on')),
  onboarding_status text not null default 'not_started'
    constraint connected_accounts_onboarding_status
    check (onboarding_status in ('not_started', 'in_review', 'needs_info', 'ready', 'disconnected')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connected_accounts_one_owner check (num_nonnulls(team_id, club_id) = 1)
);
create index connected_accounts_created_by_idx on public.connected_accounts (created_by) where created_by is not null;
create trigger connected_accounts_set_updated_at before update on public.connected_accounts
  for each row execute function public.set_updated_at();
create trigger connected_accounts_audit
  after insert or update or delete on public.connected_accounts
  for each row execute function private.audit_membership();

-- Who may manage the account: admins of the owning team / club. Coaches and managers can
-- see its status (connected_account_status), never change it.
create function private.is_issuer_admin(p_team_id uuid, p_club_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case
    when p_team_id is not null then private.has_team_role(p_team_id, array['admin']::public.team_role[])
    when p_club_id is not null then private.is_club_admin(p_club_id)
    else false end;
$$;

-- Staff who may OPERATE payments for an issuer: team staff (admin/coach/manager), or a club admin.
create function private.is_issuer_staff(p_team_id uuid, p_club_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case
    when p_team_id is not null then private.is_team_staff(p_team_id)
    when p_club_id is not null then private.is_club_admin(p_club_id)
    else false end;
$$;

alter table public.connected_accounts enable row level security;
revoke all on public.connected_accounts from anon, authenticated;
grant select on public.connected_accounts to authenticated;
create policy "Issuer admins read their connected account" on public.connected_accounts
  for select to authenticated using (private.is_issuer_admin(team_id, club_id));

-- Status for any staff of the issuer (coaches/managers included): no Stripe ids, no requirements.
create function public.connected_account_status(p_team_id uuid default null, p_club_id uuid default null)
returns table (exists_account boolean, onboarding_status text, charges_enabled boolean,
               payouts_enabled boolean, default_fee_policy text, can_manage boolean)
language sql stable security definer set search_path = ''
as $$
  select ca.id is not null, coalesce(ca.onboarding_status, 'not_started'),
         coalesce(ca.charges_enabled, false), coalesce(ca.payouts_enabled, false),
         coalesce(ca.default_fee_policy, 'absorb'), private.is_issuer_admin(p_team_id, p_club_id)
  from (select 1) one
  left join public.connected_accounts ca
    on ca.team_id is not distinct from p_team_id and ca.club_id is not distinct from p_club_id
  where num_nonnulls(p_team_id, p_club_id) = 1 and private.is_issuer_staff(p_team_id, p_club_id);
$$;

-- Admin-only: choose who bears processing fees by default (absorb | pass_on).
create function public.set_default_fee_policy(p_team_id uuid default null, p_club_id uuid default null, p_policy text default 'absorb')
returns void language plpgsql security definer set search_path = ''
as $$
declare v_old text;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if num_nonnulls(p_team_id, p_club_id) <> 1 or not private.is_issuer_admin(p_team_id, p_club_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_policy not in ('absorb', 'pass_on') then raise exception 'invalid_fee_policy' using errcode = '22023'; end if;
  select default_fee_policy into v_old from public.connected_accounts
    where team_id is not distinct from p_team_id and club_id is not distinct from p_club_id for update;
  if not found then raise exception 'no_connected_account' using errcode = 'P0002'; end if;
  update public.connected_accounts set default_fee_policy = p_policy
    where team_id is not distinct from p_team_id and club_id is not distinct from p_club_id;
end;
$$;

revoke execute on function private.admin_set_fee_config(integer, integer, integer, integer, boolean, boolean, boolean, boolean, text, uuid),
  private.is_issuer_admin(uuid, uuid), private.is_issuer_staff(uuid, uuid) from public, anon, authenticated;
grant execute on function private.is_issuer_admin(uuid, uuid), private.is_issuer_staff(uuid, uuid) to authenticated;
-- The fee config is edited by the service role / database owner only.
grant usage on schema private to service_role;
grant execute on function private.admin_set_fee_config(integer, integer, integer, integer, boolean, boolean, boolean, boolean, text, uuid) to service_role;
revoke execute on function public.connected_account_status(uuid, uuid), public.set_default_fee_policy(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.connected_account_status(uuid, uuid), public.set_default_fee_policy(uuid, uuid, text)
  to authenticated;
