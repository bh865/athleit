-- Admin portal (4/n): write functions. Every one: private.assert_platform_admin_write(min role) (aal2 required),
-- a reason of at least 10 characters (private.assert_admin_reason), and a platform_audit_log row with before, after and reason.

-- Fee configuration [owner] ---------------------------------------------------------------------------------
-- Impact preview: the active config, the proposed one, and what each would charge on a $100.00 payment.
-- NOTE: fee_config has one active row that applies immediately; a future effective date is not supported (see docs/admin.md).
create function public.admin_fee_config_impact(p_flat_cents integer, p_bps integer)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare c public.fee_config;
begin
  perform private.assert_platform_admin('owner');
  select * into c from public.fee_config where is_active;
  return jsonb_build_object('as_of', now(),
    'current', jsonb_build_object('flat_cents', c.platform_fee_flat_cents, 'bps', c.platform_fee_bps,
      'on_10000', c.platform_fee_flat_cents + (10000 * c.platform_fee_bps) / 10000),
    'proposed', jsonb_build_object('flat_cents', p_flat_cents, 'bps', p_bps,
      'on_10000', p_flat_cents + (10000 * p_bps) / 10000),
    'open_payments', (select count(*) from public.payments where status in ('requires_payment_method', 'processing')));
end;
$$;

create function public.admin_set_fee_config(
  p_flat_cents integer, p_bps integer, p_stripe_bps integer, p_stripe_fixed_cents integer,
  p_refund_charge_full boolean, p_refund_charge_partial boolean, p_refund_service_full boolean, p_refund_service_partial boolean,
  p_reason text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_reason text; v_old public.fee_config; v_id uuid;
begin
  perform private.assert_platform_admin_write('owner');
  v_reason := private.assert_admin_reason(p_reason);
  select * into v_old from public.fee_config where is_active;
  v_id := private.admin_set_fee_config(p_flat_cents, p_bps, p_stripe_bps, p_stripe_fixed_cents,
    p_refund_charge_full, p_refund_charge_partial, p_refund_service_full, p_refund_service_partial,
    left(v_reason, 300), (select auth.uid()));
  perform private.platform_audit('fee_config.change', 'fee_config', v_id::text, null,
    to_jsonb(v_old), (select to_jsonb(f) from public.fee_config f where f.id = v_id), v_reason, (select auth.uid()));
  return v_id;
end;
$$;

-- Team billing on and off [owner] --------------------------------------------------------------------------------------
create function public.admin_enable_team_billing_impact()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_platform_admin('owner');
  return jsonb_build_object('as_of', now(), 'enabled', private.setting_bool('team_subscription.enabled'),
    'teams', (select count(*) from public.teams), 'trial_days', private.setting_int('team_subscription.trial_days'));
end;
$$;

create function public.admin_enable_team_billing(p_reason text)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_reason text;
begin
  perform private.assert_platform_admin_write('owner');
  v_reason := private.assert_admin_reason(p_reason);
  if private.setting_bool('team_subscription.enabled') then raise exception 'already_enabled' using errcode = '22023'; end if;
  return private.enable_team_billing((select auth.uid()), v_reason);
end;
$$;

create function public.admin_disable_team_billing(p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_reason text;
begin
  perform private.assert_platform_admin_write('owner');
  v_reason := private.assert_admin_reason(p_reason);
  if not private.setting_bool('team_subscription.enabled') then raise exception 'already_disabled' using errcode = '22023'; end if;
  perform private.disable_team_billing((select auth.uid()), v_reason);
end;
$$;

-- Sport configuration [admin] ---------------------------------------------------------------------------------------------
create function public.admin_list_sport_configs()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_platform_admin('admin');
  return jsonb_build_object('as_of', now(), 'items', coalesce((select jsonb_agg(to_jsonb(s) order by s.sport) from public.sport_configs s), '[]'::jsonb));
end;
$$;

create function public.admin_set_sport_config(
  p_sport public.sport, p_period_type text, p_period_count smallint, p_period_minutes smallint,
  p_ties_allowed boolean, p_positions text[], p_scoring_label text, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_reason text; v_old jsonb; v_new jsonb;
begin
  perform private.assert_platform_admin_write('admin');
  v_reason := private.assert_admin_reason(p_reason);
  select to_jsonb(s) into v_old from public.sport_configs s where s.sport = p_sport for update;
  if v_old is null then raise exception 'unknown_sport' using errcode = '22023'; end if;
  update public.sport_configs set period_type = p_period_type, default_period_count = p_period_count,
    default_period_minutes = p_period_minutes, ties_allowed = p_ties_allowed, positions = coalesce(p_positions, '{}'), scoring_label = p_scoring_label
  where sport = p_sport; -- table check constraints reject bad values
  select to_jsonb(s) into v_new from public.sport_configs s where s.sport = p_sport;
  perform private.platform_audit('sport_config.change', 'sport_configs', p_sport::text, null, v_old, v_new, v_reason, (select auth.uid()));
end;
$$;

-- Reports [support] and the audited reveal [admin] ------------------------------------------------------------------------------
create function public.admin_review_message_report(p_report_id uuid, p_action text, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_reason text; r public.message_reports; v_status text;
begin
  perform private.assert_platform_admin_write('support');
  v_reason := private.assert_admin_reason(p_reason);
  if p_action not in ('action', 'dismiss') then raise exception 'invalid_action' using errcode = '22023'; end if;
  v_status := case p_action when 'action' then 'actioned' else 'dismissed' end;
  select * into r from public.message_reports where id = p_report_id for update;
  if not found then raise exception 'unknown_report' using errcode = 'P0002'; end if;
  if r.status <> 'open' then raise exception 'report_not_open' using errcode = '22023'; end if;
  update public.message_reports set status = v_status, reviewed_by = (select auth.uid()), reviewed_at = now() where id = p_report_id;
  perform private.platform_audit('report.' || p_action, 'message_reports', p_report_id::text, null,
    jsonb_build_object('status', r.status), jsonb_build_object('status', v_status), v_reason, (select auth.uid()));
end;
$$;

-- The ONLY path to a message body from the portal. Returns just the reported message, and audits it with the reason.
create function public.admin_reveal_reported_message(p_report_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_reason text; r public.message_reports; m public.messages;
begin
  perform private.assert_platform_admin_write('admin');
  v_reason := private.assert_admin_reason(p_reason);
  select * into r from public.message_reports where id = p_report_id;
  if not found then raise exception 'unknown_report' using errcode = 'P0002'; end if;
  select * into m from public.messages where id = r.message_id;
  if not found then raise exception 'message_gone' using errcode = 'P0002'; end if;
  perform private.platform_audit('report.reveal', 'message_reports', p_report_id::text, null, null,
    jsonb_build_object('message_id', m.id), v_reason, (select auth.uid()));
  return jsonb_build_object('report_id', r.id, 'message_id', m.id, 'body', m.body, 'sent_at', m.created_at,
    'sender', (select p.display_name from public.profiles p where p.id = m.sender_profile_id), 'removed', m.deleted_at is not null or m.hidden_at is not null);
end;
$$;

-- Admin management [owner]. The last owner can never be removed or demoted (enforced here, in the database). ---------------------
create function private.assert_not_last_owner(p_profile uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if (select role from public.platform_admins where profile_id = p_profile) = 'owner'
     and (select count(*) from public.platform_admins where role = 'owner') <= 1 then
    raise exception 'last_owner' using errcode = '23514', detail = 'At least one owner must always exist.';
  end if;
end;
$$;

create function public.admin_add_admin(p_email text, p_role text, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_reason text; v_id uuid;
begin
  perform private.assert_platform_admin_write('owner');
  v_reason := private.assert_admin_reason(p_reason);
  if p_role not in ('owner', 'admin', 'support') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.platform_admins where profile_id = v_id) then raise exception 'already_admin' using errcode = '23505'; end if;
  insert into public.platform_admins (profile_id, role, created_by) values (v_id, p_role, (select auth.uid()));
  perform private.platform_audit('admin.add', 'platform_admins', v_id::text, null, null, jsonb_build_object('role', p_role), v_reason, (select auth.uid()));
end;
$$;

create function public.admin_set_admin_role(p_profile_id uuid, p_role text, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_reason text; v_old text;
begin
  perform private.assert_platform_admin_write('owner');
  v_reason := private.assert_admin_reason(p_reason);
  if p_role not in ('owner', 'admin', 'support') then raise exception 'invalid_role' using errcode = '22023'; end if;
  perform 1 from public.platform_admins where role = 'owner' for update; -- serialise owner changes
  select role into v_old from public.platform_admins where profile_id = p_profile_id;
  if v_old is null then raise exception 'not_an_admin' using errcode = 'P0002'; end if;
  if p_role <> 'owner' then perform private.assert_not_last_owner(p_profile_id); end if;
  update public.platform_admins set role = p_role where profile_id = p_profile_id;
  perform private.platform_audit('admin.set_role', 'platform_admins', p_profile_id::text, null,
    jsonb_build_object('role', v_old), jsonb_build_object('role', p_role), v_reason, (select auth.uid()));
end;
$$;

create function public.admin_remove_admin(p_profile_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_reason text; v_old text;
begin
  perform private.assert_platform_admin_write('owner');
  v_reason := private.assert_admin_reason(p_reason);
  perform 1 from public.platform_admins where role = 'owner' for update;
  select role into v_old from public.platform_admins where profile_id = p_profile_id;
  if v_old is null then raise exception 'not_an_admin' using errcode = 'P0002'; end if;
  perform private.assert_not_last_owner(p_profile_id);
  delete from public.platform_admins where profile_id = p_profile_id;
  perform private.platform_audit('admin.remove', 'platform_admins', p_profile_id::text, null,
    jsonb_build_object('role', v_old), null, v_reason, (select auth.uid()));
end;
$$;

-- Support notes [support] ---------------------------------------------------------------------------------------------------------
create function public.admin_add_support_note(p_subject_type text, p_subject_id uuid, p_note text)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare v_id bigint;
begin
  perform private.assert_platform_admin_write('support');
  if p_subject_type not in ('team', 'club', 'person') then raise exception 'invalid_subject' using errcode = '22023'; end if;
  if p_note is null or char_length(btrim(p_note)) < 1 or char_length(p_note) > 2000 then raise exception 'invalid_note' using errcode = '22023'; end if;
  insert into public.admin_notes (subject_type, subject_id, note, author_id) values (p_subject_type, p_subject_id, btrim(p_note), (select auth.uid()))
    returning id into v_id;
  perform private.platform_audit('note.add', 'admin_notes', v_id::text, case when p_subject_type = 'team' then p_subject_id end,
    null, jsonb_build_object('subject_type', p_subject_type, 'subject_id', p_subject_id), 'Support note', (select auth.uid()));
  return v_id;
end;
$$;

-- Maintenance banner: ordinary setting definitions, so they appear in the generated Settings area with no new UI ----------------------------------
insert into public.platform_setting_definitions
  (key, label, description, setting_group, value_type, min_value, max_value, unit, default_value, write_role, sort_order) values
  ('platform.maintenance_banner_enabled', 'Show maintenance banner', 'Show the banner text below at the top of the app for everyone who is signed in.', 'Platform', 'boolean', null, null, null, 'false', 'admin', 100),
  ('platform.maintenance_banner', 'Maintenance banner text', 'Shown at the top of the app while the banner is on. Plain text, up to 500 characters.', 'Platform', 'text', null, null, null, '""', 'admin', 110);
insert into public.platform_settings (key, value)
  select key, default_value from public.platform_setting_definitions where key in ('platform.maintenance_banner_enabled', 'platform.maintenance_banner');

-- Read by the app shell: signed-in users only, text or null.
create function public.get_platform_banner()
returns text language sql stable security definer set search_path = ''
as $$
  select case when coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'platform.maintenance_banner_enabled'), false)
    then nullif(btrim((select value #>> '{}' from public.platform_settings where key = 'platform.maintenance_banner')), '') end;
$$;

-- Grants -------------------------------------------------------------------------------------------------------------------------------------------
revoke execute on function private.assert_not_last_owner(uuid) from public, anon, authenticated;
grant execute on function private.assert_not_last_owner(uuid) to service_role;
revoke execute on function
  public.admin_fee_config_impact(integer, integer),
  public.admin_set_fee_config(integer, integer, integer, integer, boolean, boolean, boolean, boolean, text),
  public.admin_enable_team_billing_impact(), public.admin_enable_team_billing(text), public.admin_disable_team_billing(text),
  public.admin_list_sport_configs(),
  public.admin_set_sport_config(public.sport, text, smallint, smallint, boolean, text[], text, text),
  public.admin_review_message_report(uuid, text, text), public.admin_reveal_reported_message(uuid, text),
  public.admin_add_admin(text, text, text), public.admin_set_admin_role(uuid, text, text), public.admin_remove_admin(uuid, text),
  public.admin_add_support_note(text, uuid, text), public.get_platform_banner()
  from public, anon, authenticated;
grant execute on function
  public.admin_fee_config_impact(integer, integer),
  public.admin_set_fee_config(integer, integer, integer, integer, boolean, boolean, boolean, boolean, text),
  public.admin_enable_team_billing_impact(), public.admin_enable_team_billing(text), public.admin_disable_team_billing(text),
  public.admin_list_sport_configs(),
  public.admin_set_sport_config(public.sport, text, smallint, smallint, boolean, text[], text, text),
  public.admin_review_message_report(uuid, text, text), public.admin_reveal_reported_message(uuid, text),
  public.admin_add_admin(text, text, text), public.admin_set_admin_role(uuid, text, text), public.admin_remove_admin(uuid, text),
  public.admin_add_support_note(text, uuid, text), public.get_platform_banner()
  to authenticated;
