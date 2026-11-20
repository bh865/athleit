-- Admin portal (3/n): People search and detail, and the global lookup behind the command palette.
-- People is search-only (no browse list). Every search, view and lookup is written to platform_audit_log.
-- A search term that looks like an email or a phone number is stored as a short hash, never in full.
-- Returned: names, emails (visible to every platform role) and masked phones. Never password or token fields.

create function private.admin_log_term(p_term text)
returns text language sql immutable set search_path = ''
as $$
  select case
    when p_term like '%@%' or length(regexp_replace(p_term, '[^0-9]', '', 'g')) >= 7
      then 'sha:' || substr(encode(extensions.digest(lower(btrim(p_term)), 'sha256'), 'hex'), 1, 16)
    else left(btrim(p_term), 40) end;
$$;

create function private.admin_mask_phone(p_phone text)
returns text language sql immutable set search_path = ''
as $$
  select case when p_phone is null or p_phone = '' then null
    else repeat('•', greatest(length(p_phone) - 4, 0)) || right(p_phone, 4) end;
$$;

-- Search by email, name, phone fragment, family code, team code, or an id. 30 searches per admin per minute. ------
-- Over the limit it RETURNS {rate_limited: true} (a raise would roll back the counter hit).
create function public.admin_search_people(p_query text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_digits text := regexp_replace(v_q, '[^0-9]', '', 'g');
  v_uuid uuid;
  v_results jsonb;
begin
  perform private.assert_platform_admin('support');
  if char_length(v_q) < 3 then raise exception 'query_too_short' using errcode = '22023', detail = 'Type at least 3 characters.'; end if;
  if char_length(v_q) > 100 then raise exception 'query_too_long' using errcode = '22023'; end if;
  if not private.hit_rate_limit('admin_people:' || (select auth.uid())::text, 30, 60) then
    return jsonb_build_object('rate_limited', true, 'as_of', now(), 'items', '[]'::jsonb);
  end if;
  begin v_uuid := v_q::uuid; exception when others then v_uuid := null; end;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.name), '[]'::jsonb) into v_results from (
    select p.id profile_id, p.display_name name, u.email, private.admin_mask_phone(u.phone) phone_masked, p.created_at,
           (select count(*) from public.team_memberships m where m.profile_id = p.id and m.status = 'active') team_roles,
           (select count(*) from public.household_members hm where hm.profile_id = p.id) households
    from public.profiles p join auth.users u on u.id = p.id
    where p.id = v_uuid
       or u.email ilike private.admin_like(v_q)
       or p.display_name ilike private.admin_like(v_q)
       or (length(v_digits) >= 4 and regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') like '%' || v_digits || '%')
       or p.id in (select hm.profile_id from public.household_members hm join public.households h on h.id = hm.household_id where h.join_code = upper(v_q))
       or p.id in (select m.profile_id from public.team_memberships m join public.teams t on t.id = m.team_id where t.join_code = upper(v_q) and m.role = 'admin')
    order by p.display_name limit 25) r;

  perform private.platform_audit('people.search', 'people', null, null, null,
    jsonb_build_object('q', private.admin_log_term(v_q), 'results', jsonb_array_length(v_results)), null, (select auth.uid()));
  return jsonb_build_object('rate_limited', false, 'as_of', now(), 'items', v_results);
end;
$$;

create function public.admin_get_person(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_person jsonb;
begin
  perform private.assert_platform_admin('support');
  select jsonb_build_object('profile_id', p.id, 'name', p.display_name, 'email', u.email, 'phone_masked', private.admin_mask_phone(u.phone),
           'created_at', p.created_at, 'last_sign_in_at', u.last_sign_in_at)
    into v_person from public.profiles p join auth.users u on u.id = p.id where p.id = p_user_id;
  if v_person is null then return null; end if;
  perform private.platform_audit('people.view', 'profile', p_user_id::text, null, null, null, null, (select auth.uid()));
  return jsonb_build_object('as_of', now(), 'person', v_person,
    'teams', coalesce((select jsonb_agg(jsonb_build_object('team_id', t.id, 'name', t.name, 'role', m.role, 'status', m.status) order by t.name)
      from public.team_memberships m join public.teams t on t.id = m.team_id where m.profile_id = p_user_id), '[]'::jsonb),
    'clubs', coalesce((select jsonb_agg(jsonb_build_object('club_id', c.id, 'name', c.name, 'role', m.role, 'status', m.status) order by c.name)
      from public.club_memberships m join public.clubs c on c.id = m.club_id where m.profile_id = p_user_id), '[]'::jsonb),
    'households', coalesce((select jsonb_agg(jsonb_build_object('household_id', h.id, 'name', h.name, 'relationship', hm.relationship,
        'members', (select coalesce(jsonb_agg(p2.display_name order by p2.display_name), '[]'::jsonb)
                    from public.household_members x join public.profiles p2 on p2.id = x.profile_id where x.household_id = h.id)) order by h.name)
      from public.household_members hm join public.households h on h.id = hm.household_id where hm.profile_id = p_user_id), '[]'::jsonb),
    'push_devices', (select count(*) from public.push_devices d where d.profile_id = p_user_id and d.revoked_at is null),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'note', n.note, 'author', pa.display_name, 'at', n.created_at) order by n.created_at desc)
      from (select * from public.admin_notes where subject_type = 'person' and subject_id = p_user_id order by created_at desc limit 50) n
      left join public.profiles pa on pa.id = n.author_id), '[]'::jsonb));
end;
$$;

-- Command palette lookup. Recognises uuid, pi_, in_, acct_, cus_, sub_, evt_, RCP-#### receipts, and 10 character codes.
-- Money related result types are hidden from support (restricted = true tells the UI to draw the jRestricted state).
create function public.admin_lookup(p_term text)
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
    when v_t ~* '^RCP-[0-9]{4,}$' then 'receipt' when v_t ~* '^[A-Z0-9]{10}$' then 'code' else 'text' end;

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

revoke execute on function private.admin_log_term(text), private.admin_mask_phone(text) from public, anon, authenticated;
grant execute on function private.admin_log_term(text), private.admin_mask_phone(text) to service_role;
revoke execute on function public.admin_search_people(text), public.admin_get_person(uuid), public.admin_lookup(text) from public, anon, authenticated;
grant execute on function public.admin_search_people(text), public.admin_get_person(uuid), public.admin_lookup(text) to authenticated;
