-- Phase 4 (A6): payer_checkout_quote, collection summary/detail, household payments & receipts
--
-- The quote is the ONE place a charge amount is computed. It takes only request ids; the
-- amount, fees and destination come from database rows (the event's frozen fee snapshot).
-- Both the review sheet in the apps and the create-payment-intent Edge Function call it.

create function public.payer_checkout_quote(p_request_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_found integer;
  v_households integer;
  v_accounts integer;
  v_policies integer;
  v_configs integer;
  v_all_guardian boolean;
  v_all_payable boolean;
  v_fee jsonb;
  v_policy text;
  v_cfg jsonb;
  v_account uuid;
  v_household uuid;
  v_charges boolean;
  b record;
  v_ordered record;
  v_weights bigint[];
  v_plat bigint[];
  v_pass bigint[];
  v_lines jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_i integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_request_ids) x where x is not null;
  if v_ids is null or cardinality(v_ids) not between 1 and 25 then
    raise exception 'invalid_request_set' using errcode = '22023';
  end if;

  select count(*), count(distinct r.household_id), count(distinct e.connected_account_id),
         count(distinct e.fee_policy), count(distinct e.fee_config),
         bool_and(private.is_household_guardian(r.household_id)),
         bool_and(r.status = 'unpaid' and e.status = 'published'
                  and not exists (select 1 from public.payment_items i where i.payment_request_id = r.id and i.is_active)),
         min(e.fee_policy), (array_agg(e.fee_config))[1], (array_agg(e.connected_account_id))[1],
         (array_agg(r.household_id))[1]
  into v_found, v_households, v_accounts, v_policies, v_configs, v_all_guardian, v_all_payable,
       v_policy, v_cfg, v_account, v_household
  from public.payment_requests r
  join public.payment_events e on e.id = r.payment_event_id
  where r.id = any (v_ids);

  -- Unknown ids and other families' requests look identical: not_authorized.
  if v_found <> cardinality(v_ids) or not v_all_guardian then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_households > 1 then raise exception 'mixed_household' using errcode = '23514'; end if;
  if v_accounts > 1 or v_policies > 1 or v_configs > 1 then
    raise exception 'mixed_checkout' using errcode = '23514',
      detail = 'Requests with different payees or fee terms must be paid separately.';
  end if;
  if not v_all_payable then raise exception 'request_not_payable' using errcode = '23514'; end if;
  select ca.charges_enabled into v_charges from public.connected_accounts ca where ca.id = v_account;
  if not coalesce(v_charges, false) then raise exception 'account_not_ready' using errcode = '23514'; end if;

  select sum(r.amount_cents) as base, array_agg(r.amount_cents order by r.id) as weights
    into v_ordered from public.payment_requests r where r.id = any (v_ids);
  select * into b from private.fee_breakdown(v_ordered.base, v_policy, v_cfg);
  v_weights := v_ordered.weights;
  v_plat := private.allocate_cents(b.platform_fee_cents, v_weights);
  v_pass := private.allocate_cents(b.processing_fee_cents, v_weights);

  for v_ordered in
    select r.id, r.display_id, r.amount_cents, e.title
    from public.payment_requests r join public.payment_events e on e.id = r.payment_event_id
    where r.id = any (v_ids) order by r.id
  loop
    v_i := v_i + 1;
    v_lines := v_lines || jsonb_build_object('kind', 'item', 'request_id', v_ordered.id,
      'display_id', v_ordered.display_id, 'label', v_ordered.title, 'amount_cents', v_ordered.amount_cents);
    v_items := v_items || jsonb_build_object('request_id', v_ordered.id, 'amount_cents', v_ordered.amount_cents,
      'platform_fee_cents', v_plat[v_i], 'processing_fee_passthrough_cents', v_pass[v_i]);
  end loop;
  if b.platform_fee_cents > 0 then
    v_lines := v_lines || jsonb_build_object('kind', 'athleit_charge', 'label', 'Athleit charge', 'amount_cents', b.platform_fee_cents);
  end if;
  if b.processing_fee_cents > 0 then
    v_lines := v_lines || jsonb_build_object('kind', 'service_fee', 'label', 'Service fee', 'amount_cents', b.processing_fee_cents);
  end if;

  return jsonb_build_object(
    'currency', 'usd', 'fee_policy', v_policy, 'connected_account_id', v_account, 'household_id', v_household,
    'request_set_key', md5(array_to_string(v_ids, ',')),
    'lines', v_lines, 'items', v_items,
    'base_cents', b.base_cents, 'platform_fee_cents', b.platform_fee_cents,
    'processing_fee_cents', b.processing_fee_cents, 'total_cents', b.total_cents,
    'estimated_stripe_fee_cents', b.estimated_stripe_fee_cents, 'estimated_net_cents', b.estimated_net_cents);
end;
$$;

-- Aggregate collection status. Staff of the issuing team, or a club admin for a club-issued
-- event. Money is the request base amount (fees are the payer's line items, not the event's).
--   expected    = requests that are not cancelled or waived
--   collected   = paid + paid_offline + partially_refunded (the refunded amount is reported separately)
--   outstanding = unpaid + processing
create function public.event_collection_summary(p_event_id uuid)
returns table (expected_cents bigint, collected_cents bigint, outstanding_cents bigint, refunded_cents bigint,
               waived_cents bigint, total_requests integer, paid_count integer, unpaid_count integer,
               processing_count integer, waived_count integer, refunded_count integer, disputed_count integer,
               progress_percent integer, due_at timestamptz, status text)
language sql stable security definer set search_path = ''
as $$
  with q as (
    select r.* from public.payment_requests r
    where r.payment_event_id = p_event_id and private.is_event_staff(p_event_id)),
  agg as (
    select coalesce(sum(amount_cents) filter (where status not in ('cancelled', 'waived')), 0) as expected,
           coalesce(sum(amount_cents) filter (where status in ('paid', 'paid_offline', 'partially_refunded')), 0) as collected,
           coalesce(sum(amount_cents) filter (where status in ('unpaid', 'processing')), 0) as outstanding,
           coalesce(sum(amount_cents) filter (where status = 'waived'), 0) as waived,
           count(*) filter (where status <> 'cancelled') as total,
           count(*) filter (where status in ('paid', 'paid_offline', 'partially_refunded')) as paid_n,
           count(*) filter (where status = 'unpaid') as unpaid_n,
           count(*) filter (where status = 'processing') as processing_n,
           count(*) filter (where status = 'waived') as waived_n,
           count(*) filter (where status = 'refunded') as refunded_n,
           count(*) filter (where disputed) as disputed_n
    from q)
  select agg.expected, agg.collected, agg.outstanding,
         (select coalesce(sum(f.amount_cents), 0) from public.refunds f
            join public.payment_items i on i.id = f.payment_item_id
            join public.payment_requests rq on rq.id = i.payment_request_id
          where rq.payment_event_id = p_event_id and f.status = 'succeeded' and private.is_event_staff(p_event_id)),
         agg.waived, agg.total::integer, agg.paid_n::integer, agg.unpaid_n::integer, agg.processing_n::integer,
         agg.waived_n::integer, agg.refunded_n::integer, agg.disputed_n::integer,
         case when agg.expected = 0 then 0 else least(100, (agg.collected * 100 / agg.expected))::integer end,
         ev.due_at, ev.status
  from agg
  cross join public.payment_events ev
  where ev.id = p_event_id and private.is_event_staff(p_event_id);
$$;

-- Per-request detail with names. STAFF ONLY (issuing team staff / issuing club admin).
create function public.event_collection_detail(p_event_id uuid)
returns table (request_id uuid, display_id text, player_name text, household_name text, amount_cents integer,
               status text, due_at timestamptz, paid_at timestamptz, paid_via text, receipt_display_id text,
               last_reminded_at timestamptz, disputed boolean)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.display_id, p.first_name || ' ' || p.last_name, h.name, r.amount_cents, r.status, r.due_at,
         r.paid_at,
         case when r.status = 'paid_offline' then 'offline'
              when r.status in ('paid', 'partially_refunded', 'refunded') then 'card' end,
         (select pay.receipt_display_id from public.payment_items i
            join public.payments pay on pay.id = i.payment_id
          where i.payment_request_id = r.id and pay.receipt_display_id is not null
          order by pay.succeeded_at desc nulls last limit 1),
         r.last_reminded_at, r.disputed
  from public.payment_requests r
  join public.players p on p.id = r.player_id
  join public.households h on h.id = r.household_id
  where r.payment_event_id = p_event_id and private.is_event_staff(p_event_id)
  order by p.last_name, p.first_name, r.display_id;
$$;

-- The caller's own households' requests. Guardians can pay; a 13+ player sees their own
-- requests read-only (can_pay = false). Never anyone else's.
create function public.household_payments(p_household_id uuid default null)
returns table (request_id uuid, display_id text, payment_event_id uuid, title text, issuer_name text,
               player_first_name text, household_id uuid, amount_cents integer, status text, due_at timestamptz,
               paid_at timestamptz, disputed boolean, can_pay boolean)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.display_id, e.id, e.title,
         coalesce((select t.name from public.teams t where t.id = e.team_id),
                  (select c.name from public.clubs c where c.id = e.club_id)),
         p.first_name, r.household_id, r.amount_cents, r.status, r.due_at, r.paid_at, r.disputed,
         private.is_household_guardian(r.household_id) and r.status = 'unpaid' and e.status = 'published'
  from public.payment_requests r
  join public.payment_events e on e.id = r.payment_event_id
  join public.players p on p.id = r.player_id
  where (private.is_household_guardian(r.household_id) or private.is_player_self(r.player_id))
    and (p_household_id is null or r.household_id = p_household_id)
  order by (r.status = 'unpaid') desc, r.due_at, r.display_id
  limit 300;
$$;

-- Receipts for the caller's households: successful (and later refunded) payments.
create function public.household_receipts(p_household_id uuid default null)
returns table (payment_id uuid, receipt_display_id text, succeeded_at timestamptz, status text,
               total_charged_cents integer, base_cents integer, platform_fee_cents integer,
               processing_fee_passthrough_cents integer, refunded_cents bigint, items jsonb)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.receipt_display_id, p.succeeded_at, p.status, p.total_charged_cents, p.base_cents,
         p.platform_fee_cents, p.processing_fee_passthrough_cents,
         (select coalesce(sum(f.amount_cents), 0) from public.refunds f where f.payment_id = p.id and f.status = 'succeeded'),
         (select coalesce(jsonb_agg(jsonb_build_object(
                   'request_id', r.id, 'display_id', r.display_id, 'title', e.title,
                   'player_first_name', pl.first_name, 'amount_cents', i.amount_cents) order by r.display_id), '[]'::jsonb)
          from public.payment_items i
          join public.payment_requests r on r.id = i.payment_request_id
          join public.payment_events e on e.id = r.payment_event_id
          join public.players pl on pl.id = r.player_id
          where i.payment_id = p.id)
  from public.payments p
  where private.is_household_guardian(p.household_id)
    and p.status in ('succeeded', 'partially_refunded', 'refunded')
    and (p_household_id is null or p.household_id = p_household_id)
  order by p.succeeded_at desc nulls last
  limit 300;
$$;

revoke execute on function
  public.payer_checkout_quote(uuid[]), public.event_collection_summary(uuid), public.event_collection_detail(uuid),
  public.household_payments(uuid), public.household_receipts(uuid)
  from public, anon, authenticated;
grant execute on function
  public.payer_checkout_quote(uuid[]), public.event_collection_summary(uuid), public.event_collection_detail(uuid),
  public.household_payments(uuid), public.household_receipts(uuid)
  to authenticated;
