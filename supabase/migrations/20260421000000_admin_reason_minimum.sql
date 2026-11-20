-- Admin portal (1/n): every admin write needs a reason of at least 10 characters (the copy deck says 10).
-- Enforced in the public admin_* wrappers only. private.set_platform_setting keeps its 3 character floor
-- because service-role runbook calls (for example private.enable_team_billing(..., 'Launch')) use short reasons.

create function private.assert_admin_reason(p_reason text)
returns text language plpgsql immutable set search_path = ''
as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) < 10 then
    raise exception 'reason_required' using errcode = '22023', detail = 'Add a reason of at least 10 characters.';
  end if;
  return btrim(p_reason);
end;
$$;
revoke execute on function private.assert_admin_reason(text) from public, anon, authenticated;
grant execute on function private.assert_admin_reason(text) to service_role;

create or replace function public.admin_set_setting(p_key text, p_value jsonb, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_role text;
begin
  perform private.assert_platform_admin('support'); -- never reveal which keys exist to anyone else
  select write_role into v_role from public.platform_setting_definitions where key = p_key;
  if not found then raise exception 'unknown_setting' using errcode = '22023'; end if;
  perform private.assert_platform_admin_write(v_role);
  perform private.set_platform_setting(p_key, p_value, (select auth.uid()), private.assert_admin_reason(p_reason));
end;
$$;

create or replace function public.admin_extend_trial(p_team_id uuid, p_new_trial_ends_at timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_old timestamptz; v_reason text;
begin
  perform private.assert_platform_admin_write('admin');
  v_reason := private.assert_admin_reason(p_reason);
  if p_new_trial_ends_at is null then raise exception 'invalid_trial_end' using errcode = '22023'; end if;
  select trial_ends_at into v_old from public.team_billing where team_id = p_team_id for update;
  if not found then raise exception 'no_billing_row' using errcode = 'P0002'; end if;
  update public.team_billing set trial_ends_at = p_new_trial_ends_at where team_id = p_team_id;
  perform private.platform_audit('billing.extend_trial', 'team_billing', p_team_id::text, p_team_id,
    jsonb_build_object('trial_ends_at', v_old), jsonb_build_object('trial_ends_at', p_new_trial_ends_at), v_reason, (select auth.uid()));
end;
$$;

create or replace function public.admin_comp_team(p_team_id uuid, p_until timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare b public.team_billing; v_reason text;
begin
  perform private.assert_platform_admin_write('admin');
  v_reason := private.assert_admin_reason(p_reason);
  if p_until is not null and p_until <= now() then raise exception 'invalid_comp_end' using errcode = '22023'; end if;
  select * into b from public.team_billing where team_id = p_team_id for update;
  if not found then raise exception 'no_billing_row' using errcode = 'P0002'; end if;
  update public.team_billing set comped = true, comp_until = p_until where team_id = p_team_id;
  perform private.platform_audit('billing.comp', 'team_billing', p_team_id::text, p_team_id,
    jsonb_build_object('comped', b.comped, 'comp_until', b.comp_until), jsonb_build_object('comped', true, 'comp_until', p_until), v_reason, (select auth.uid()));
end;
$$;

create or replace function public.admin_clear_comp(p_team_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare b public.team_billing; v_reason text;
begin
  perform private.assert_platform_admin_write('admin');
  v_reason := private.assert_admin_reason(p_reason);
  select * into b from public.team_billing where team_id = p_team_id for update;
  if not found then raise exception 'no_billing_row' using errcode = 'P0002'; end if;
  update public.team_billing set comped = false, comp_until = null where team_id = p_team_id;
  perform private.platform_audit('billing.clear_comp', 'team_billing', p_team_id::text, p_team_id,
    jsonb_build_object('comped', b.comped, 'comp_until', b.comp_until), jsonb_build_object('comped', false), v_reason, (select auth.uid()));
end;
$$;
