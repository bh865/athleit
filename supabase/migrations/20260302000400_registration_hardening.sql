-- Phase 5 (B5): hardening from the independent security review
--
-- 1  Claiming a registration no longer trusts `email_confirmed_at` (a project that auto-confirms signups would let anyone claim
--    anyone's registration). Ownership is now proved by an emailed single-use CLAIM TOKEN (purpose 'claim', hashed, 14 days),
--    minted when the email is sent and consumed with the claimant's session by svc_claim_registration.
-- 2  A payment completing after its hold expired can no longer push an event over capacity: settlement re-checks capacity under
--    the event lock; a 'processing' request past a grace period expires with its hold; requests that never got a payment
--    request expire too; a promoted registration whose request is already paid gets no new hold.
-- 3  get_public_registration is no longer executable by anon; the public page reads it through the Edge Function (service role).
-- 4  Anonymous duplicate submissions no longer invalidate the victim's verification link; unverified rows are purged after 24 h
--    and hidden from staff lists by default.
-- 5  Info blocks are validated in SQL (strict keys and lengths); a cover image path must sit under the issuer's own prefix.
-- 6  link_registration_player requires the child to match the registration (name and date of birth).
-- 7  Retention also deletes registrant-email outbox rows; erasure deletes the registrant's outbox rows.
-- 8  Forms: wider forbidden-label patterns, option labels checked, and an ordinary field may not be shown only when a sensitive
--    answer is given (its presence would leak the sensitive answer).


alter table public.registration_verification_tokens drop constraint registration_verification_tokens_purpose;
alter table public.registration_verification_tokens add constraint registration_verification_tokens_purpose
  check (purpose in ('verify', 'sign', 'claim'));

drop function public.claim_my_registrations();

create function public.svc_issue_claim_token(p_registration_id uuid, p_token_hash text, p_ttl_minutes integer default 20160)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.registrations r where r.id = p_registration_id and r.submitted_by is null
                 and r.verified_at is not null and r.anonymized_at is null and r.status not in ('declined', 'withdrawn')) then
    raise exception 'not_claimable' using errcode = '23514';
  end if;
  insert into public.registration_verification_tokens (registration_id, purpose, token_hash, expires_at)
  values (p_registration_id, 'claim', p_token_hash, now() + make_interval(mins => least(greatest(p_ttl_minutes, 60), 43200)));
end;
$$;

-- The claimant is signed in; possession of the emailed token (sent to the registration's verified address) is the proof.
create function public.svc_claim_registration(p_token_hash text, p_user_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_reg uuid; v_event public.registration_events;
begin
  update public.registration_verification_tokens t set used_at = now()
    where t.token_hash = p_token_hash and t.purpose = 'claim' and t.used_at is null and t.expires_at > now()
    returning t.registration_id into v_reg;
  if v_reg is null then raise exception 'invalid_token' using errcode = '22023'; end if;
  update public.registrations set submitted_by = p_user_id
    where id = v_reg and submitted_by is null and anonymized_at is null and status not in ('declined', 'withdrawn');
  if not found then raise exception 'invalid_token' using errcode = '22023'; end if;
  select e.* into v_event from public.registrations r join public.registration_events e on e.id = r.registration_event_id where r.id = v_reg;
  perform private.write_audit('registration.claim', 'registrations', v_reg, v_event.team_id, v_event.club_id, null, null);
  return v_reg;
end;
$$;


drop function public.svc_issue_verification_token(uuid, text, integer);
create function public.svc_issue_verification_token(
  p_registration_id uuid, p_token_hash text, p_ttl_minutes integer default 60, p_keep_existing boolean default false)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.registrations r where r.id = p_registration_id and r.status = 'pending_verification') then
    raise exception 'not_pending' using errcode = '23514';
  end if;
  if (select count(*) from public.registration_verification_tokens t
      where t.registration_id = p_registration_id and t.purpose = 'verify' and t.created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many_requests' using errcode = '23514';
  end if;
  -- A resend caused by someone ELSE re-submitting the same details must not kill the real registrant's link.
  if not p_keep_existing then
    update public.registration_verification_tokens set used_at = now()
      where registration_id = p_registration_id and purpose = 'verify' and used_at is null;
  end if;
  insert into public.registration_verification_tokens (registration_id, purpose, token_hash, expires_at)
  values (p_registration_id, 'verify', p_token_hash, now() + make_interval(mins => least(greatest(p_ttl_minutes, 5), 1440)));
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
  end if;
  return null;
end;
$$;

-- Settlement of a payment for an at-submission hold. If the hold had already expired the spot may have been given away:
-- re-check capacity under the event lock; a registration that no longer fits is waitlisted (or withdrawn when there is no
-- waitlist) and its PAID request is left for staff to refund (registration_payment_status.refundable).
create or replace function private.registration_payment_settled()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare r public.registrations; e public.registration_events; v_taken integer;
begin
  if new.registration_id is null or new.status not in ('paid', 'paid_offline', 'waived') or old.status is not distinct from new.status then
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

create or replace function private.expire_registration_holds()
returns integer language plpgsql security definer set search_path = ''
as $$
declare e public.registration_events; v_ids uuid[]; v_total integer := 0;
begin
  for e in
    select ev.* from public.registration_events ev
    where ev.payment_timing = 'at_submission' and ev.price_cents is not null
      and exists (select 1 from public.registrations r where r.registration_event_id = ev.id and r.status = 'submitted'
                  and r.hold_expires_at < now())
  loop
    perform 1 from public.registration_events where id = e.id for update;
    -- Expire UNPAID holds, holds with no payment request at all, and holds whose payment has been "processing" for 15
    -- minutes past the hold (an abandoned checkout). A payment that completes anyway is reconciled by
    -- registration_payment_settled and refunded by staff if the spot is gone.
    with expired as (
      update public.registrations r set status = 'withdrawn', decision_note = 'payment_expired', hold_expires_at = null
      where r.registration_event_id = e.id and r.status = 'submitted' and r.hold_expires_at < now()
        and (r.payment_request_id is null
             or exists (select 1 from public.payment_requests q where q.id = r.payment_request_id
                        and (q.status = 'unpaid' or (q.status = 'processing' and r.hold_expires_at < now() - interval '15 minutes'))))
      returning r.id, r.payment_request_id)
    select coalesce(array_agg(id), '{}') into v_ids from expired;
    v_total := v_total + cardinality(v_ids);
    if cardinality(v_ids) > 0 then
      update public.payment_requests set status = 'cancelled'
        where id in (select payment_request_id from public.registrations where id = any (v_ids)) and status in ('unpaid', 'processing');
      perform private.write_audit('registration.hold_expired', 'registration_events', e.id, e.team_id, e.club_id, null,
        jsonb_build_object('count', cardinality(v_ids)));
      if e.auto_promote_waitlist then perform private.promote_waitlist(e.id, 1000); end if;
    end if;
  end loop;
  return v_total;
end;
$$;

create or replace function private.promote_waitlist(p_event_id uuid, p_max integer)
returns uuid[] language plpgsql security definer set search_path = ''
as $$
declare e public.registration_events; r public.registrations; v_out uuid[] := '{}';
begin
  select * into e from public.registration_events where id = p_event_id;
  while coalesce(cardinality(v_out), 0) < p_max
        and (e.capacity is null or private.registration_taken(p_event_id) < e.capacity) loop
    select * into r from public.registrations
      where registration_event_id = p_event_id and status = 'waitlisted'
      order by waitlist_position limit 1 for update;
    exit when not found;
    if e.payment_timing = 'at_submission' and e.price_cents is not null then
      -- A registration that already paid keeps its payment: no new hold, no second request.
      update public.registrations set status = 'submitted', decided_at = now(),
        hold_expires_at = case when exists (select 1 from public.payment_requests q where q.id = r.payment_request_id
                                            and q.status in ('paid', 'paid_offline', 'waived')) then null
                               else now() + make_interval(mins => e.payment_hold_minutes) end where id = r.id;
    else
      update public.registrations set status = 'accepted', decided_at = now() where id = r.id;
    end if;
    v_out := v_out || r.id;
    perform private.write_audit('registration.promote', 'registrations', r.id, e.team_id, e.club_id,
      jsonb_build_object('status', 'waitlisted'),
      jsonb_build_object('status', (select status from public.registrations where id = r.id), 'auto', p_max > 1));
  end loop;
  return v_out;
end;
$$;
create or replace function public.registration_payment_status(p_registration_id uuid)
returns table (payment_request_id uuid, request_display_id text, request_status text, amount_cents integer, refundable boolean)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.display_id, q.status, q.amount_cents,
         q.status in ('paid', 'partially_refunded') and (r.status in ('declined', 'withdrawn') or r.status = 'waitlisted')
  from public.registrations r
  join public.payment_requests q on q.id = r.payment_request_id
  where r.id = p_registration_id and (select auth.uid()) is not null and private.can_view_registration(r.id);
$$;

create function private.json_strings_ok(p_obj jsonb, p_allowed text[], p_max integer)
returns boolean language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p_obj) = 'object'
    and not exists (select 1 from jsonb_each(p_obj) e where not e.key = any (p_allowed) or jsonb_typeof(e.value) <> 'string'
                    or char_length(e.value #>> '{}') > p_max);
$$;

create function private.validate_info_blocks(p jsonb)
returns void language plpgsql immutable set search_path = ''
as $$
declare b jsonb; t text; it jsonb; v_max integer;
begin
  for b in select value from jsonb_array_elements(p) loop
    t := b ->> 'type';
    if jsonb_typeof(b) <> 'object' then raise exception 'invalid_info_block' using errcode = '23514'; end if;
    if t = 'description' then
      if not private.json_strings_ok(b, array['type', 'title', 'body'], 8000) then raise exception 'invalid_info_block' using errcode = '23514'; end if;
    elsif t in ('key_facts', 'agenda', 'faq', 'what_to_bring') then
      v_max := case t when 'key_facts' then 12 when 'faq' then 30 else 40 end;
      if exists (select 1 from jsonb_object_keys(b) k where k not in ('type', 'items', 'title'))
         or jsonb_typeof(b -> 'items') <> 'array'
         or jsonb_array_length(b -> 'items') > v_max
         or (b ? 'title' and (jsonb_typeof(b -> 'title') <> 'string' or char_length(b ->> 'title') > 120)) then
        raise exception 'invalid_info_block' using errcode = '23514';
      end if;
      for it in select value from jsonb_array_elements(b -> 'items') loop
        if t = 'what_to_bring' then
          if jsonb_typeof(it) <> 'string' or char_length(it #>> '{}') > 200 then raise exception 'invalid_info_block' using errcode = '23514'; end if;
        elsif not private.json_strings_ok(it,
              case t when 'key_facts' then array['label', 'value'] when 'faq' then array['question', 'answer'] else array['time', 'label'] end,
              case t when 'faq' then 2000 else 200 end) then
          raise exception 'invalid_info_block' using errcode = '23514';
        end if;
      end loop;
    else
      raise exception 'invalid_info_block' using errcode = '23514';
    end if;
  end loop;
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
         or new.waiver_version_ids is distinct from old.waiver_version_ids then
        raise exception 'terms_locked' using errcode = '23514',
          detail = 'Price, payment timing, form and waivers cannot change once registrations exist.';
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
create or replace function public.link_registration_player(p_registration_id uuid, p_player_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare r public.registrations; v_household uuid; v_req uuid; e public.registration_events;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into r from public.registrations where id = p_registration_id for update;
  if not found or not private.is_registration_family(p_registration_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not private.is_guardian_of(p_player_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status in ('declined', 'withdrawn') then raise exception 'invalid_status_transition' using errcode = '23514'; end if;
  if r.player_id is not null and r.player_id <> p_player_id then raise exception 'already_linked' using errcode = '23514'; end if;
  select household_id into v_household from public.players p where p.id = p_player_id
    and lower(p.first_name) = lower(r.player_first_name) and lower(p.last_name) = lower(r.player_last_name)
    and p.date_of_birth = r.player_date_of_birth;
  if v_household is null then raise exception 'player_mismatch' using errcode = '23514'; end if;
  update public.registrations set player_id = p_player_id, household_id = v_household,
    submitted_by = coalesce(submitted_by, (select auth.uid())) where id = p_registration_id;
  select * into e from public.registration_events where id = r.registration_event_id;
  v_req := private.ensure_registration_payment(p_registration_id);
  if v_req is not null then
    perform private.enqueue_registration_email(r.guardian_email, 'payment_due',
      jsonb_build_object('display_id', r.display_id, 'event_title', left(e.title, 120), 'price_cents', e.price_cents,
                         'payment_timing', e.payment_timing, 'registration_event_id', e.id),
      r.id || ':payment_due');
  end if;
  perform private.write_audit('registration.link_player', 'registrations', p_registration_id, e.team_id, e.club_id, null, null);
  return v_req;
end;
$$;
create or replace function public.list_registrations(
  p_event_id uuid, p_status text[] default null, p_search text default null, p_unpaid boolean default null,
  p_missing_waivers boolean default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, display_id text, status text, guardian_name text, guardian_email text, player_first_name text,
               player_last_name text, player_date_of_birth date, waitlist_position integer, waitlist_rank bigint,
               payment_request_id uuid, payment_status text, waivers_signed integer, waivers_required integer,
               submitted_at timestamptz, decided_at timestamptz, total_count bigint)
language sql stable security definer set search_path = ''
as $$
  with ev as (select e.* from public.registration_events e where e.id = p_event_id and private.is_issuer_staff(e.team_id, e.club_id)
                and (select auth.uid()) is not null),
  base as (
    select r.*, pq.status as pay_status,
      (select count(*)::int from public.waiver_acceptances a where a.registration_id = r.id
         and a.waiver_version_id = any (ev.waiver_version_ids)) as signed,
      cardinality(ev.waiver_version_ids) as required,
      case when r.status = 'waitlisted' then rank() over (partition by r.status order by r.waitlist_position) end as rnk
    from public.registrations r
    join ev on ev.id = r.registration_event_id
    left join public.payment_requests pq on pq.id = r.payment_request_id)
  select b.id, b.display_id, b.status, b.guardian_name, b.guardian_email, b.player_first_name, b.player_last_name,
         b.player_date_of_birth, b.waitlist_position, b.rnk, b.payment_request_id, b.pay_status, b.signed, b.required,
         b.submitted_at, b.decided_at, count(*) over ()
  from base b
  where ((p_status is null and b.status <> 'pending_verification') or b.status = any (p_status))
    and (p_search is null or p_search = ''
         or position(lower(p_search) in lower(b.display_id || ' ' || b.guardian_name || ' ' || b.guardian_email || ' '
                                                || b.player_first_name || ' ' || b.player_last_name)) > 0)
    and (p_unpaid is null or (p_unpaid = (b.pay_status in ('unpaid', 'processing'))))
    and (p_missing_waivers is null or (p_missing_waivers = (b.signed < b.required)))
  order by b.submitted_at desc, b.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
$$;
create or replace function private.anonymize_registration(p_registration_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.registrations; e public.registration_events;
begin
  select * into r from public.registrations where id = p_registration_id for update;
  if not found or r.anonymized_at is not null then return; end if;
  select * into e from public.registration_events where id = r.registration_event_id;
  update public.registrations set
    guardian_name = 'Anonymized', guardian_email = 'anonymized+' || r.id || '@anonymized.invalid', guardian_phone = null,
    guardian_relationship = 'Anonymized', player_first_name = 'Anonymized', player_last_name = 'Anonymized',
    player_date_of_birth = make_date(extract(year from r.player_date_of_birth)::int, 1, 1),
    answers = '{}'::jsonb, decision_note = null, submitted_by = null, player_id = null, household_id = null,
    anonymized_at = now()
  where id = r.id;
  delete from public.registration_sensitive_answers where registration_id = r.id;
  delete from public.registration_notes where registration_id = r.id;
  delete from public.registration_verification_tokens where registration_id = r.id;
  -- Queued or sent registrant emails carry the child's first name and the decision note.
  delete from public.notification_outbox where recipient_email is not null and payload ->> 'display_id' = r.display_id;
  perform private.write_audit('registration.anonymize', 'registrations', r.id, e.team_id, e.club_id, null, null);
end;
$$;
create or replace function public.svc_run_registration_retention(p_months integer default 12, p_sensitive_days integer default 90)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r record; v_anon integer := 0; v_sens integer; v_tokens integer; v_pending integer; v_mail integer;
begin
  for r in
    select g.id from public.registrations g join public.registration_events e on e.id = g.registration_event_id
    where g.status in ('declined', 'withdrawn') and g.anonymized_at is null
      and coalesce(e.ends_on, e.starts_on, e.closes_at::date) < (current_date - make_interval(months => p_months))::date
  loop
    perform private.anonymize_registration(r.id);
    v_anon := v_anon + 1;
  end loop;
  with d as (
    delete from public.registration_sensitive_answers s using public.registrations g, public.registration_events e
    where g.id = s.registration_id and e.id = g.registration_event_id and g.status <> 'placed'
      and coalesce(e.ends_on, e.starts_on, e.closes_at::date) < (current_date - p_sensitive_days)
    returning 1) select count(*)::int into v_sens from d;
  with d as (
    delete from public.registration_verification_tokens where expires_at < now() - interval '7 days' returning 1)
    select count(*)::int into v_tokens from d;
  -- Registrations that never confirmed their email: gone after 24 hours (they hold a stranger's address and a child's name).
  with d as (delete from public.registrations where status = 'pending_verification' and created_at < now() - interval '24 hours' returning 1)
    select count(*)::int into v_pending from d;
  with d as (delete from public.notification_outbox where recipient_email is not null and created_at < now() - interval '30 days'
             and (status in ('sent', 'skipped') or attempts >= 5) returning 1) select count(*)::int into v_mail from d;
  return jsonb_build_object('anonymized', v_anon, 'sensitive_purged', v_sens, 'tokens_deleted', v_tokens, 'pending_deleted', v_pending, 'emails_deleted', v_mail);
end;
$$;
create or replace function public.svc_acceptance_context(p_acceptance_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'acceptance_id', a.id, 'accepted_at', a.accepted_at, 'signer_name', a.signer_name, 'signer_relationship', a.signer_relationship,
    'signer_email', a.signer_email, 'electronic_consent', a.electronic_consent,
    'waiver', jsonb_build_object('title', v.title, 'version', v.version, 'body', v.body, 'content_hash', v.content_hash),
    'registration_display_id', r.display_id, 'guardian_email', r.guardian_email,
    'player_name', coalesce(p.first_name || ' ' || p.last_name, r.player_first_name || ' ' || r.player_last_name),
    'subject', coalesce(e.title, t.name))
  from public.waiver_acceptances a
  join public.waiver_versions v on v.id = a.waiver_version_id
  left join public.registrations r on r.id = a.registration_id
  left join public.registration_events e on e.id = r.registration_event_id
  left join public.players p on p.id = a.player_id
  left join public.team_players tp on tp.player_id = a.player_id and tp.status = 'active'
  left join public.teams t on t.id = tp.team_id
  where a.id = p_acceptance_id
  limit 1;
$$;
create or replace function private.is_forbidden_field_text(p_text text)
returns boolean language sql immutable set search_path = ''
as $$
  select coalesce(
    regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g')
      ~ '\m(ssn|s s n|ss number|social security|social sec|soc sec|social insurance|sin number|passport|drivers? licen[sc]e|driver s licen[sc]e|driving licen[sc]e|government id|govt id|national id|tax id|taxpayer|credit card|debit card|card number|cvv|cvc|routing number|bank account|iban)\M',
    false);
$$;
create or replace function private.validate_form_schema(p_schema jsonb)
returns void language plpgsql immutable set search_path = ''
as $$
declare
  v_field jsonb;
  v_ids text[] := '{}';
  v_id text;
  v_type text;
  v_key text;
  v_opt jsonb;
  v_show jsonb;
  v_vkey text;
  v_sens text[] := '{}';
  v_types constant text[] := array['short_text', 'long_text', 'email', 'phone', 'number', 'date',
    'single_choice', 'multiple_choice', 'dropdown', 'checkbox', 'consent_checkbox', 'address'];
  v_field_keys constant text[] := array['id', 'type', 'label', 'help', 'required', 'options', 'validation', 'show_if', 'sensitive'];
  v_vkeys constant text[] := array['min_length', 'max_length', 'min', 'max', 'pattern'];
begin
  if p_schema is null or coalesce(jsonb_typeof(p_schema), '') <> 'object'
     or coalesce(jsonb_typeof(p_schema -> 'fields'), '') <> 'array' then
    raise exception 'invalid_form_schema' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_object_keys(p_schema) k where k <> 'fields') then
    raise exception 'invalid_form_schema' using errcode = '23514', detail = 'Unknown top-level key.';
  end if;
  if jsonb_array_length(p_schema -> 'fields') > 60 or octet_length(p_schema::text) > 100000 then
    raise exception 'form_too_large' using errcode = '23514';
  end if;

  for v_field in select value from jsonb_array_elements(p_schema -> 'fields') loop
    if jsonb_typeof(v_field) <> 'object' then raise exception 'invalid_field' using errcode = '23514'; end if;
    for v_key in select jsonb_object_keys(v_field) loop
      if not v_key = any (v_field_keys) then
        raise exception 'invalid_field' using errcode = '23514', detail = 'Unknown field key ' || left(v_key, 40);
      end if;
    end loop;
    v_id := v_field ->> 'id';
    v_type := v_field ->> 'type';
    if coalesce(jsonb_typeof(v_field -> 'id'), '') <> 'string' or v_id !~ '^[a-z][a-z0-9_]{0,39}$' then
      raise exception 'invalid_field_id' using errcode = '23514';
    end if;
    if v_id = any (v_ids) then raise exception 'duplicate_field_id' using errcode = '23514'; end if;
    if coalesce(jsonb_typeof(v_field -> 'type'), '') <> 'string' or not v_type = any (v_types) then
      raise exception 'invalid_field_type' using errcode = '23514', detail = 'File uploads are not supported.';
    end if;
    if coalesce(jsonb_typeof(v_field -> 'label'), '') <> 'string' or char_length(btrim(v_field ->> 'label')) not between 1 and 200 then
      raise exception 'invalid_field_label' using errcode = '23514';
    end if;
    if v_field ? 'help' and (jsonb_typeof(v_field -> 'help') <> 'string' or char_length(v_field ->> 'help') > 500) then
      raise exception 'invalid_field_help' using errcode = '23514';
    end if;
    if private.is_forbidden_field_text(v_field ->> 'label') or private.is_forbidden_field_text(v_field ->> 'help') then
      raise exception 'forbidden_field' using errcode = '23514',
        detail = 'Forms cannot ask for government ID numbers, Social Security numbers or card data.';
    end if;
    if v_field ? 'required' and jsonb_typeof(v_field -> 'required') <> 'boolean' then
      raise exception 'invalid_field' using errcode = '23514';
    end if;
    if v_field ? 'sensitive' and jsonb_typeof(v_field -> 'sensitive') <> 'boolean' then
      raise exception 'invalid_field' using errcode = '23514';
    end if;

    if v_type in ('single_choice', 'multiple_choice', 'dropdown') then
      if coalesce(jsonb_typeof(v_field -> 'options'), '') <> 'array' or jsonb_array_length(v_field -> 'options') not between 1 and 50 then
        raise exception 'invalid_options' using errcode = '23514';
      end if;
      for v_opt in select value from jsonb_array_elements(v_field -> 'options') loop
        if jsonb_typeof(v_opt) <> 'object' or coalesce(jsonb_typeof(v_opt -> 'value'), '') <> 'string'
           or coalesce(jsonb_typeof(v_opt -> 'label'), '') <> 'string'
           or char_length(btrim(v_opt ->> 'value')) not between 1 and 100
           or char_length(btrim(v_opt ->> 'label')) not between 1 and 100
           or exists (select 1 from jsonb_object_keys(v_opt) k where k not in ('value', 'label')) then
          raise exception 'invalid_options' using errcode = '23514';
        end if;
        if private.is_forbidden_field_text(v_opt ->> 'label') then
          raise exception 'forbidden_field' using errcode = '23514';
        end if;
      end loop;
      if (select count(distinct o ->> 'value') from jsonb_array_elements(v_field -> 'options') o)
         <> jsonb_array_length(v_field -> 'options') then
        raise exception 'duplicate_option' using errcode = '23514';
      end if;
    elsif v_field ? 'options' then
      raise exception 'invalid_options' using errcode = '23514';
    end if;

    if v_field ? 'validation' then
      if jsonb_typeof(v_field -> 'validation') <> 'object' then raise exception 'invalid_validation' using errcode = '23514'; end if;
      for v_vkey in select jsonb_object_keys(v_field -> 'validation') loop
        if not v_vkey = any (v_vkeys) then raise exception 'invalid_validation' using errcode = '23514'; end if;
      end loop;
      -- Free-form regexes are a ReDoS risk: only length and numeric bounds are supported.
      if v_field -> 'validation' ? 'pattern' then raise exception 'invalid_validation' using errcode = '23514'; end if;
      for v_vkey in select jsonb_object_keys(v_field -> 'validation') loop
        if jsonb_typeof(v_field -> 'validation' -> v_vkey) <> 'number' then
          raise exception 'invalid_validation' using errcode = '23514';
        end if;
      end loop;
    end if;

    if v_field ? 'show_if' then
      v_show := v_field -> 'show_if';
      -- A condition may only look at an EARLIER field (no cycles, no forward references).
      -- An ordinary field shown only when a SENSITIVE answer is given would reveal that answer to anyone who reads ordinary answers.
      if jsonb_typeof(v_show) = 'object' and (v_show ->> 'field') = any (v_sens)
         and coalesce((v_field ->> 'sensitive')::boolean, false) = false then
        raise exception 'show_if_leaks_sensitive' using errcode = '23514';
      end if;
      if jsonb_typeof(v_show) <> 'object' or coalesce(jsonb_typeof(v_show -> 'field'), '') <> 'string'
         or not (v_show ->> 'field') = any (v_ids)
         or exists (select 1 from jsonb_object_keys(v_show) k where k not in ('field', 'equals', 'in'))
         or (v_show ? 'equals') = (v_show ? 'in') then
        raise exception 'invalid_show_if' using errcode = '23514';
      end if;
      if v_show ? 'in' and (jsonb_typeof(v_show -> 'in') <> 'array' or jsonb_array_length(v_show -> 'in') not between 1 and 50) then
        raise exception 'invalid_show_if' using errcode = '23514';
      end if;
      if v_show ? 'equals' and jsonb_typeof(v_show -> 'equals') not in ('string', 'number', 'boolean') then
        raise exception 'invalid_show_if' using errcode = '23514';
      end if;
    end if;
    if coalesce((v_field ->> 'sensitive')::boolean, false) then v_sens := v_sens || v_id; end if;
    v_ids := v_ids || v_id;
  end loop;
end;
$$;

-- Grants ------------------------------------------------------------------------------------------------------------
revoke execute on function public.get_public_registration(text) from public, anon, authenticated;
grant execute on function public.get_public_registration(text) to authenticated, service_role;
revoke execute on function
  public.svc_issue_claim_token(uuid, text, integer), public.svc_claim_registration(text, uuid),
  public.svc_issue_verification_token(uuid, text, integer, boolean),
  private.json_strings_ok(jsonb, text[], integer), private.validate_info_blocks(jsonb)
  from public, anon, authenticated;
grant execute on function public.svc_issue_claim_token(uuid, text, integer), public.svc_claim_registration(text, uuid),
  public.svc_issue_verification_token(uuid, text, integer, boolean) to service_role;
