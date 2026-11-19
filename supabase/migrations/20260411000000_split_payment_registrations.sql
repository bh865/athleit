-- Split payments, step 3: registration events.
--  * registration_events gain plan terms (sizes, cadence) and "require full balance before: none | event start date". Like the price and
--    payment timing, they lock once registrations exist (the existing convention for registration terms) and are copied into the payment
--    event created for the registration event, which is frozen from the start.
--  * The plan must finish by the registration's payment deadline: the payment event's due date, or the event start if staff require the full
--    balance before it (private.plan_deadline).
--  * Installment 1 satisfies the spot hold: a request that is partially_paid lifts hold_expires_at and counts as paid-up-enough to accept.
--    The hold timer only ever applied to the first installment (the request is unpaid/processing until then).
--  * Declining or withdrawing cancels what is still owed (paid installments stay for staff to refund).
--  * Balance flags for staff: registration_balances (registration list) and team_player_balances (roster). Nothing is blocked automatically.

alter table public.registration_events
  add column plan_options integer[] not null default array[1]
    constraint registration_events_plan_options check (private.valid_plan_options(plan_options)),
  add column plan_cadence text not null default 'monthly'
    constraint registration_events_plan_cadence check (plan_cadence in ('weekly', 'biweekly', 'monthly')),
  add column require_full_balance text not null default 'none'
    constraint registration_events_require_balance check (require_full_balance in ('none', 'event_start')),
  add constraint registration_events_plan_needs_price check (plan_options = array[1] or price_cents is not null),
  add constraint registration_events_balance_needs_start check (require_full_balance = 'none' or starts_on is not null);

-- When a plan must be fully paid: a registration's payment deadline (earlier if staff require the balance before the event starts),
-- otherwise the request's own due date.
create function private.plan_deadline(r public.payment_requests, e public.payment_events)
returns timestamptz language sql stable security definer set search_path = ''
as $$
  select case when e.kind = 'registration' then
    coalesce((select case when re.require_full_balance = 'event_start' and re.starts_on is not null
                          then least(e.due_at, re.starts_on::timestamptz) else e.due_at end
              from public.registration_events re where re.id = e.registration_event_id), e.due_at)
    else r.due_at end;
$$;
revoke execute on function private.plan_deadline(public.payment_requests, public.payment_events) from public, anon, authenticated;
grant execute on function private.plan_deadline(public.payment_requests, public.payment_events) to authenticated, service_role;

create or replace function private.ensure_registration_payment(p_registration_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  r public.registrations; e public.registration_events; v_account public.connected_accounts; v_cfg public.fee_config;
  v_pe uuid; v_req uuid; v_due timestamptz;
begin
  select * into r from public.registrations where id = p_registration_id for update;
  if not found then return null; end if;
  if r.payment_request_id is not null then return r.payment_request_id; end if;
  select * into e from public.registration_events where id = r.registration_event_id;
  if e.price_cents is null or r.player_id is null or r.household_id is null then return null; end if;
  if not ((e.payment_timing = 'at_submission' and r.status = 'submitted')
          or (e.payment_timing = 'after_acceptance' and r.status in ('accepted', 'placed'))) then
    return null;
  end if;
  select * into v_account from public.connected_accounts ca
    where ca.team_id is not distinct from e.team_id and ca.club_id is not distinct from e.club_id;
  if not found then return null; end if;

  select id into v_pe from public.payment_events where registration_event_id = e.id;
  if v_pe is null then
    select * into v_cfg from public.fee_config where is_active;
    insert into public.payment_events (team_id, club_id, connected_account_id, title, amount_cents, due_at, audience, fee_policy,
      fee_config, status, published_at, kind, registration_event_id, created_by, plan_options, plan_cadence)
    values (e.team_id, e.club_id, v_account.id, left('Registration: ' || e.title, 100), e.price_cents,
      coalesce(e.closes_at, now()) + interval '30 days', 'registration', v_account.default_fee_policy,
      jsonb_build_object(
        'platform_fee_flat_cents', v_cfg.platform_fee_flat_cents, 'platform_fee_bps', v_cfg.platform_fee_bps,
        'stripe_fee_bps', v_cfg.stripe_fee_bps, 'stripe_fee_fixed_cents', v_cfg.stripe_fee_fixed_cents,
        'refund_athleit_charge_on_full', v_cfg.refund_athleit_charge_on_full,
        'refund_athleit_charge_on_partial', v_cfg.refund_athleit_charge_on_partial,
        'refund_service_fee_on_full', v_cfg.refund_service_fee_on_full,
        'refund_service_fee_on_partial', v_cfg.refund_service_fee_on_partial, 'config_id', v_cfg.id),
      'published', now(), 'registration', e.id, e.created_by, e.plan_options, e.plan_cadence)
    on conflict (registration_event_id) where registration_event_id is not null do nothing;
    select id into v_pe from public.payment_events where registration_event_id = e.id;
  end if;

  v_due := case when e.payment_timing = 'at_submission'
                then coalesce(r.hold_expires_at, now() + make_interval(mins => e.payment_hold_minutes))
                else now() + interval '7 days' end;
  insert into public.payment_requests (payment_event_id, player_id, household_id, amount_cents, due_at, display_id, registration_id)
  values (v_pe, r.player_id, r.household_id, e.price_cents, v_due, private.next_request_display_id(), r.id)
  returning id into v_req;
  update public.registrations set payment_request_id = v_req,
    hold_expires_at = case when e.payment_timing = 'at_submission' then v_due else hold_expires_at end
  where id = r.id;
  perform private.write_audit('registration.payment_request', 'registrations', r.id, e.team_id, e.club_id, null,
    jsonb_build_object('payment_request_id', v_req, 'timing', e.payment_timing));
  return v_req;
end;
$$;
create or replace function private.guard_registration_payment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare e public.registration_events;
begin
  select * into e from public.registration_events where id = new.registration_event_id;
  if e.price_cents is null or e.payment_timing <> 'at_submission' then return new; end if;
  if tg_op = 'INSERT' and new.status = 'submitted' and new.player_id is null then
    raise exception 'player_required' using errcode = '23514', detail = 'Choose or add the child before paying.';
  end if;
  if tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' and not exists (
       select 1 from public.payment_requests q where q.id = new.payment_request_id and q.status in ('paid', 'paid_offline', 'waived', 'partially_paid')) then
    raise exception 'payment_required' using errcode = '23514';
  end if;
  return new;
end;
$$;
create or replace function private.registration_payment_settled()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare r public.registrations; e public.registration_events; v_taken integer;
begin
  if new.registration_id is null or new.status not in ('paid', 'paid_offline', 'waived', 'partially_paid') or old.status is not distinct from new.status then
    return null;
  end if;
  select registration_event_id into r.registration_event_id from public.registrations where id = new.registration_id;
  if not found then return null; end if;
  select * into e from public.registration_events where id = r.registration_event_id for update;
  select * into r from public.registrations where id = new.registration_id for update;
  if r.hold_expires_at is null then return null; end if;
  if r.status = 'submitted' and r.hold_expires_at < now() and e.capacity is not null then
    v_taken := private.registration_taken(e.id);  -- the expired hold does not count, so this excludes r
    if v_taken >= e.capacity then
      if e.waitlist_enabled then
        update public.registrations set status = 'waitlisted', hold_expires_at = null,
          waitlist_position = coalesce(waitlist_position, private.next_waitlist_position(e.id)) where id = r.id;
      else
        update public.registrations set status = 'withdrawn', hold_expires_at = null, decision_note = 'payment_expired' where id = r.id;
      end if;
      perform private.write_audit('registration.late_payment', 'registrations', r.id, e.team_id, e.club_id, null,
        jsonb_build_object('outcome', 'over_capacity'));
      return null;
    end if;
  end if;
  update public.registrations set hold_expires_at = null where id = r.id;
  return null;
end;
$$;
create or replace function private.registration_side_effects()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  e public.registration_events; v_issuer text; v_payload jsonb; v_kind text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  select * into e from public.registration_events where id = new.registration_event_id;
  select coalesce(t.name, c.name) into v_issuer from (select 1) o
    left join public.teams t on t.id = e.team_id left join public.clubs c on c.id = e.club_id;
  v_payload := jsonb_build_object('display_id', new.display_id, 'event_title', left(e.title, 120), 'issuer_name', left(v_issuer, 100),
    'player_first_name', left(new.player_first_name, 60), 'status', new.status, 'price_cents', e.price_cents,
    'payment_timing', e.payment_timing, 'hold_minutes', e.payment_hold_minutes, 'needs_account', new.submitted_by is null,
    'note', left(new.decision_note, 1000), 'registration_event_id', e.id, 'registration_id', new.id,
    'hold_active', new.hold_expires_at is not null);

  if tg_op = 'INSERT' then
    if new.status in ('submitted', 'waitlisted') and new.submitted_by is not null then
      perform private.enqueue_registration_email(new.guardian_email, 'received', v_payload, new.id || ':received');
    end if;
    if new.status = 'submitted' and e.price_cents is not null and e.payment_timing = 'at_submission' then
      perform private.ensure_registration_payment(new.id);
    end if;
    return null;
  end if;

  if old.status = 'pending_verification' and new.status in ('submitted', 'waitlisted') then
    perform private.enqueue_registration_email(new.guardian_email, 'received', v_payload, new.id || ':received');
  elsif old.status = 'waitlisted' and new.status in ('submitted', 'accepted') then
    perform private.enqueue_registration_email(new.guardian_email, 'promoted', v_payload, new.id || ':promoted');
    perform private.ensure_registration_payment(new.id);
  elsif new.status = 'accepted' then
    perform private.enqueue_registration_email(new.guardian_email, 'decision', v_payload, new.id || ':accepted');
    perform private.ensure_registration_payment(new.id);
  elsif new.status = 'waitlisted' then
    perform private.enqueue_registration_email(new.guardian_email, 'decision', v_payload, new.id || ':waitlisted');
  elsif new.status = 'declined' then
    perform private.enqueue_registration_email(new.guardian_email, 'decision', v_payload, new.id || ':declined');
  elsif new.status = 'withdrawn' and new.decision_note = 'payment_expired' then
    perform private.enqueue_registration_email(new.guardian_email, 'hold_expired', v_payload, new.id || ':hold_expired');
  end if;

  if new.status in ('declined', 'withdrawn') and new.payment_request_id is not null then
    update public.payment_requests set status = 'cancelled' where id = new.payment_request_id and status = 'unpaid';
    -- A plan with installments paid keeps them (staff refund through refund-payment); what is still owed stops.
    update public.payment_request_installments set status = 'cancelled', next_retry_at = null
      where request_id = new.payment_request_id and status in ('scheduled', 'due', 'failed');
  end if;
  return null;
end;
$$;
create or replace function private.guard_registration_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_taken integer; v_block jsonb;
begin
  if jsonb_typeof(new.info_blocks) <> 'array' then raise exception 'invalid_info_block' using errcode = '23514'; end if;
  perform private.validate_info_blocks(new.info_blocks);
  -- A cover image must live under the issuer's own storage prefix (no pointing at another team's files).
  if new.cover_image_path is not null and split_part(new.cover_image_path, '/', 1) <> coalesce(new.team_id, new.club_id)::text then
    raise exception 'invalid_cover_path' using errcode = '23514';
  end if;
  for v_block in select value from jsonb_array_elements(new.info_blocks) loop
    if jsonb_typeof(v_block) <> 'object'
       or coalesce(v_block ->> 'type', '') not in ('key_facts', 'description', 'agenda', 'what_to_bring', 'faq') then
      raise exception 'invalid_info_block' using errcode = '23514';
    end if;
  end loop;
  if new.target_team_id is not null and new.club_id is not null and not exists (
       select 1 from public.teams t where t.id = new.target_team_id and t.club_id = new.club_id) then
    raise exception 'target_team_not_in_club' using errcode = '23514';
  end if;
  if new.target_team_id is not null and new.team_id is not null and new.target_team_id <> new.team_id then
    raise exception 'target_team_mismatch' using errcode = '23514';
  end if;
  if new.roster_behavior = 'propose_placement' and new.team_id is null and new.club_id is null then
    raise exception 'invalid_issuer' using errcode = '23514';
  end if;
  if new.form_version_id is not null and not exists (
       select 1 from public.form_versions v join public.forms f on f.id = v.form_id
       where v.id = new.form_version_id and f.team_id is not distinct from new.team_id and f.club_id is not distinct from new.club_id) then
    raise exception 'form_wrong_owner' using errcode = '23514';
  end if;
  if cardinality(new.waiver_version_ids) > 0 and exists (
       select 1 from unnest(new.waiver_version_ids) wv(id)
       where not exists (
         select 1 from public.waiver_versions v join public.waivers w on w.id = v.waiver_id
         where v.id = wv.id and (w.team_id is not distinct from new.team_id and w.club_id is not distinct from new.club_id
                 or (w.club_id is not null and w.club_id = (select t.club_id from public.teams t where t.id = new.team_id))))) then
    raise exception 'waiver_wrong_owner' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.team_id is distinct from old.team_id or new.club_id is distinct from old.club_id then
      raise exception 'issuer_immutable' using errcode = '23514';
    end if;
    if old.status <> 'draft' and new.slug <> old.slug then
      raise exception 'slug_locked' using errcode = '23514';
    end if;
    if new.status is distinct from old.status and not (
         (old.status = 'draft' and new.status in ('open', 'archived'))
      or (old.status = 'open' and new.status in ('closed', 'archived'))
      or (old.status = 'closed' and new.status in ('open', 'archived'))) then
      raise exception 'invalid_status_transition' using errcode = '23514', detail = format('%s -> %s', old.status, new.status);
    end if;
    if exists (select 1 from public.registrations r where r.registration_event_id = old.id) then
      if new.price_cents is distinct from old.price_cents or new.payment_timing is distinct from old.payment_timing
         or new.form_version_id is distinct from old.form_version_id
         or new.waiver_version_ids is distinct from old.waiver_version_ids
         or new.plan_options is distinct from old.plan_options or new.plan_cadence is distinct from old.plan_cadence
         or new.require_full_balance is distinct from old.require_full_balance then
        raise exception 'terms_locked' using errcode = '23514',
          detail = 'Price, payment timing, payment plans, form and waivers cannot change once registrations exist.';
      end if;
      if new.capacity is not null and new.capacity is distinct from old.capacity then
        v_taken := private.registration_taken(old.id);
        if new.capacity < v_taken then raise exception 'capacity_below_taken' using errcode = '23514'; end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;
create or replace function public.svc_create_plan(p_request_id uuid, p_n integer, p_start timestamptz default now())
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  r public.payment_requests;
  e public.payment_events;
begin
  select * into r from public.payment_requests where id = p_request_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into e from public.payment_events where id = r.payment_event_id;
  if r.status <> 'unpaid' or e.status <> 'published' or r.plan_count is not null then
    raise exception 'request_not_payable' using errcode = '23514';
  end if;
  if p_n is null or p_n < 2 or not (p_n = any (private.available_plan_sizes(e.plan_options, r.amount_cents, e.plan_cadence, p_start, private.plan_deadline(r, e)))) then
    raise exception 'plan_not_offered' using errcode = '23514';
  end if;
  insert into public.payment_request_installments (request_id, sequence, amount_cents, due_at)
    select p_request_id, g.sequence, g.amount_cents, g.due_at from private.generate_plan(r.amount_cents, p_n, e.plan_cadence, p_start) g;
  update public.payment_requests set plan_count = p_n where id = p_request_id;
  return p_n;
end;
$$;
create or replace function public.payer_plan_options(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.payment_requests;
  e public.payment_events;
  v_sizes integer[];
  v_now timestamptz := now();
begin
  select * into r from public.payment_requests where id = p_request_id;
  if not found or not private.is_household_guardian(r.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into e from public.payment_events where id = r.payment_event_id;
  if r.status <> 'unpaid' or e.status <> 'published' or r.plan_count is not null then
    return jsonb_build_object('sizes', jsonb_build_array(1), 'cadence', e.plan_cadence, 'plans', '{}'::jsonb);
  end if;
  v_sizes := private.available_plan_sizes(e.plan_options, r.amount_cents, e.plan_cadence, v_now, private.plan_deadline(r, e));
  return jsonb_build_object('sizes', to_jsonb(v_sizes), 'cadence', e.plan_cadence,
    'plans', (select jsonb_object_agg(n::text, (
        select jsonb_agg(jsonb_build_object('sequence', g.sequence, 'amount_cents', g.amount_cents, 'due_at', g.due_at) order by g.sequence)
        from private.generate_plan(r.amount_cents, n, e.plan_cadence, v_now) g)) from unnest(v_sizes) n where n > 1));
end;
$$;
create or replace function public.payer_plan_quote(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.payment_requests;
  e public.payment_events;
  v_sizes integer[];
  v_now timestamptz := now();
begin
  select * into r from public.payment_requests where id = p_request_id;
  if not found or not private.is_household_guardian(r.household_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into e from public.payment_events where id = r.payment_event_id;
  if r.status <> 'unpaid' or e.status <> 'published' then
    return jsonb_build_object('sizes', '[1]'::jsonb, 'plans', '{}'::jsonb, 'cadence', e.plan_cadence);
  end if;
  v_sizes := private.available_plan_sizes(e.plan_options, r.amount_cents, e.plan_cadence, v_now, private.plan_deadline(r, e));
  return jsonb_build_object('sizes', to_jsonb(v_sizes), 'cadence', e.plan_cadence, 'current_plan', r.plan_count,
    'plans', coalesce((select jsonb_object_agg(n::text, private.plan_quote(p_request_id, n, v_now)) from unnest(v_sizes) n where n > 1), '{}'::jsonb));
end;
$$;

-- Staff set the plan terms of a registration event (until registrations exist).
create function public.set_registration_event_plan(p_event_id uuid, p_options integer[], p_cadence text, p_require_full_balance text default 'none')
returns void language plpgsql security definer set search_path = ''
as $$
declare e public.registration_events;
begin
  select * into e from public.registration_events where id = p_event_id for update;
  if not found or not private.is_issuer_staff(e.team_id, e.club_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not private.valid_plan_options(p_options) then raise exception 'invalid_plan_options' using errcode = '22023'; end if;
  if p_cadence not in ('weekly', 'biweekly', 'monthly') then raise exception 'invalid_plan_cadence' using errcode = '22023'; end if;
  if p_require_full_balance not in ('none', 'event_start') then raise exception 'invalid_balance_rule' using errcode = '22023'; end if;
  update public.registration_events set plan_options = (select array_agg(x order by x) from unnest(p_options) x), plan_cadence = p_cadence,
    require_full_balance = p_require_full_balance where id = p_event_id;
  perform private.write_audit('registration_event.plan', 'registration_events', p_event_id, e.team_id, e.club_id,
    jsonb_build_object('plan_options', e.plan_options, 'plan_cadence', e.plan_cadence, 'require_full_balance', e.require_full_balance),
    jsonb_build_object('plan_options', p_options, 'plan_cadence', p_cadence, 'require_full_balance', p_require_full_balance));
end;
$$;

-- Cancelling a plan request (hold expired, withdrawn) stops what is still owed on it.
create function private.cancel_installments_on_request_cancel()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.payment_request_installments set status = 'cancelled', next_retry_at = null
    where request_id = new.id and status in ('scheduled', 'due', 'processing', 'failed');
  return null;
end;
$$;
create trigger payment_requests_cancel_installments after update of status on public.payment_requests
  for each row when (new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.plan_count is not null)
  execute function private.cancel_installments_on_request_cancel();

-- Balance flags. A balance is what is still owed: unpaid/processing plain requests plus open installments.
create function public.registration_balances(p_event_id uuid)
returns table (registration_id uuid, balance_cents bigint, plan_count integer, installments_paid integer, next_due_at timestamptz,
               overdue boolean, balance_required boolean)
language sql stable security definer set search_path = ''
as $$
  select g.id, coalesce(b.balance, 0), q.plan_count::integer,
         (select count(*)::integer from public.payment_request_installments i where i.request_id = q.id and i.status in ('paid', 'paid_offline', 'partially_refunded', 'refunded')),
         (select min(i.due_at) from public.payment_request_installments i where i.request_id = q.id and i.status in ('scheduled', 'due', 'failed')),
         exists (select 1 from public.payment_request_installments i where i.request_id = q.id and i.status in ('due', 'failed') and i.due_at <= now()),
         re.require_full_balance = 'event_start' and coalesce(b.balance, 0) > 0
  from public.registrations g
  join public.registration_events re on re.id = g.registration_event_id
  left join public.payment_requests q on q.id = g.payment_request_id
  left join lateral (
    select case when q.id is null then 0
                when q.plan_count is null then case when q.status in ('unpaid', 'processing') then q.amount_cents else 0 end
                else coalesce((select sum(i.amount_cents) from public.payment_request_installments i
                               where i.request_id = q.id and i.status in ('scheduled', 'due', 'processing', 'failed')), 0) end as balance) b on true
  where g.registration_event_id = p_event_id and private.is_issuer_staff(re.team_id, re.club_id)
    and g.status in ('submitted', 'accepted', 'placed');
$$;

create function public.team_player_balances(p_team_id uuid)
returns table (player_id uuid, balance_cents bigint, overdue boolean)
language sql stable security definer set search_path = ''
as $$
  select r.player_id,
         sum(case when r.plan_count is null then case when r.status in ('unpaid', 'processing') then r.amount_cents else 0 end
                  else coalesce((select sum(i.amount_cents) from public.payment_request_installments i
                                 where i.request_id = r.id and i.status in ('scheduled', 'due', 'processing', 'failed')), 0) end)::bigint,
         bool_or(case when r.plan_count is null then r.status = 'unpaid' and r.due_at <= now()
                      else exists (select 1 from public.payment_request_installments i where i.request_id = r.id and i.status in ('due', 'failed') and i.due_at <= now()) end)
  from public.payment_requests r
  join public.payment_events e on e.id = r.payment_event_id
  where e.team_id = p_team_id and e.status = 'published' and private.is_team_staff(p_team_id)
  group by r.player_id
  having sum(case when r.plan_count is null then case when r.status in ('unpaid', 'processing') then r.amount_cents else 0 end
                  else coalesce((select sum(i.amount_cents) from public.payment_request_installments i
                                 where i.request_id = r.id and i.status in ('scheduled', 'due', 'processing', 'failed')), 0) end) > 0;
$$;

revoke execute on function private.cancel_installments_on_request_cancel(), private.ensure_registration_payment(uuid),
  private.guard_registration_payment(), private.registration_side_effects(), private.registration_payment_settled(),
  private.guard_registration_event() from public, anon, authenticated;
revoke execute on function public.set_registration_event_plan(uuid, integer[], text, text), public.registration_balances(uuid),
  public.team_player_balances(uuid), public.svc_create_plan(uuid, integer, timestamptz), public.payer_plan_options(uuid),
  public.payer_plan_quote(uuid) from public, anon, authenticated;
grant execute on function public.set_registration_event_plan(uuid, integer[], text, text), public.registration_balances(uuid),
  public.team_player_balances(uuid), public.payer_plan_options(uuid), public.payer_plan_quote(uuid) to authenticated;
grant execute on function public.svc_create_plan(uuid, integer, timestamptz) to service_role;
