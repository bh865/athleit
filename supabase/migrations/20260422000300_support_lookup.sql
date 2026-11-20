-- Support center: the command palette recognises SUP-###### references (support role and above; not money related, so never restricted).
create or replace function public.admin_lookup(p_term text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_t text := btrim(coalesce(p_term, ''));
  v_admin boolean;
  v_kind text;
  v_restricted boolean := false;
  v_items jsonb := '[]'::jsonb;
  v_uuid uuid;
begin
  perform private.assert_platform_admin('support');
  v_admin := private.is_platform_admin('admin');
  if char_length(v_t) < 3 or char_length(v_t) > 100 then raise exception 'invalid_term' using errcode = '22023'; end if;
  if not private.hit_rate_limit('admin_lookup:' || (select auth.uid())::text, 60, 60) then
    return jsonb_build_object('rate_limited', true, 'as_of', now(), 'kind', null, 'restricted', false, 'items', '[]'::jsonb);
  end if;

  v_kind := case
    when v_t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then 'uuid'
    when v_t ~ '^pi_[A-Za-z0-9_]+$' then 'payment_intent' when v_t ~ '^in_[A-Za-z0-9_]+$' then 'invoice'
    when v_t ~ '^acct_[A-Za-z0-9]+$' then 'connect_account' when v_t ~ '^cus_[A-Za-z0-9_]+$' then 'customer'
    when v_t ~ '^sub_[A-Za-z0-9_]+$' then 'subscription' when v_t ~ '^evt_[A-Za-z0-9_]+$' then 'event'
    when v_t ~* '^RCP-[0-9]{4,}$' then 'receipt' when v_t ~* '^SUP-[0-9]{4,}$' then 'support_request' when v_t ~* '^[A-Z0-9]{10}$' then 'code' else 'text' end;

  if v_kind = 'uuid' then
    v_uuid := v_t::uuid;
    select coalesce(jsonb_agg(i), '[]'::jsonb) into v_items from (
      select jsonb_build_object('type', 'team', 'id', t.id, 'label', t.name) i from public.teams t where t.id = v_uuid
      union all select jsonb_build_object('type', 'club', 'id', c.id, 'label', c.name) from public.clubs c where c.id = v_uuid
      union all select jsonb_build_object('type', 'person', 'id', p.id, 'label', p.display_name) from public.profiles p where p.id = v_uuid) x;
  elsif v_kind in ('payment_intent', 'receipt', 'connect_account', 'invoice', 'customer', 'subscription') then
    if not v_admin then v_restricted := true;
    elsif v_kind = 'payment_intent' then
      select coalesce(jsonb_agg(jsonb_build_object('type', 'payment', 'id', p.id, 'label', coalesce(p.receipt_display_id, p.id::text), 'status', p.status)), '[]'::jsonb)
        into v_items from public.payments p where p.stripe_payment_intent_id = v_t;
    elsif v_kind = 'receipt' then
      select coalesce(jsonb_agg(jsonb_build_object('type', 'payment', 'id', p.id, 'label', p.receipt_display_id, 'status', p.status)), '[]'::jsonb)
        into v_items from public.payments p where p.receipt_display_id = upper(v_t);
    elsif v_kind = 'connect_account' then
      select coalesce(jsonb_agg(jsonb_build_object('type', 'connect', 'id', a.id, 'label', a.stripe_account_id, 'team_id', a.team_id, 'club_id', a.club_id)), '[]'::jsonb)
        into v_items from public.connected_accounts a where a.stripe_account_id = v_t;
    elsif v_kind = 'invoice' then
      select coalesce(jsonb_agg(jsonb_build_object('type', 'team', 'id', i.team_id, 'label', t.name, 'invoice', i.stripe_invoice_id)), '[]'::jsonb)
        into v_items from public.team_billing_invoices i join public.teams t on t.id = i.team_id where i.stripe_invoice_id = v_t;
    else
      select coalesce(jsonb_agg(jsonb_build_object('type', 'team', 'id', b.team_id, 'label', t.name)), '[]'::jsonb)
        into v_items from public.team_billing b join public.teams t on t.id = b.team_id
        where b.stripe_customer_id = v_t or b.stripe_subscription_id = v_t;
    end if;
  elsif v_kind = 'support_request' then
    select coalesce(jsonb_agg(jsonb_build_object('type', 'support_request', 'id', s.id, 'label', s.ref || ' ' || left(s.subject, 60), 'status', s.status)), '[]'::jsonb)
      into v_items from public.support_requests s where s.ref = upper(v_t);
  elsif v_kind = 'event' then
    if not v_admin then v_restricted := true;
    else
      select coalesce(jsonb_agg(jsonb_build_object('type', 'webhook_event', 'id', e.id, 'label', e.stripe_event_id, 'event_type', e.type)), '[]'::jsonb)
        into v_items from public.stripe_webhook_events e where e.stripe_event_id = v_t;
    end if;
  elsif v_kind = 'code' then
    select coalesce(jsonb_agg(i), '[]'::jsonb) into v_items from (
      select jsonb_build_object('type', 'team', 'id', t.id, 'label', t.name, 'via', 'team code') i from public.teams t where t.join_code = upper(v_t)
      union all select jsonb_build_object('type', 'household', 'id', h.id, 'label', h.name, 'via', 'family code') from public.households h where h.join_code = upper(v_t)) x;
  else
    select coalesce(jsonb_agg(i), '[]'::jsonb) into v_items from (
      select jsonb_build_object('type', 'team', 'id', t.id, 'label', t.name) i from public.teams t where t.name ilike private.admin_like(v_t) limit 5
      ) x;
  end if;

  perform private.platform_audit('lookup', 'lookup', null, null, null,
    jsonb_build_object('q', private.admin_log_term(v_t), 'kind', v_kind, 'results', jsonb_array_length(v_items)), null, (select auth.uid()));
  return jsonb_build_object('rate_limited', false, 'as_of', now(), 'kind', v_kind, 'restricted', v_restricted, 'items', v_items);
end;
$$;
