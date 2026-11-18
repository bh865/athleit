-- Phase 5 (B3): scheduled jobs and account/data operations
--
-- pg_cron jobs (all plain SQL, no Edge Function or Vault secret needed; emails are queued in notification_outbox and
-- delivered by the existing delivery worker):
--   registration-expire-holds    every 5 min   unpaid at-submission holds release their spot; waitlist advances
--   registration-staff-digest    every 15 min  batched "N new registrations" and "registration is full" for managers
--   registration-waiver-expiry   daily 14:00   guardians and staff hear about waivers expiring within 14 days
--   registration-retention       daily 03:30   anonymize old declined/withdrawn registrations, purge sensitive answers
--
-- Staff notifications never contain names or answers: an event title and a count.

alter table public.registration_events
  add column staff_digest_at timestamptz,
  add column filled_notified_at timestamptz;

-- Hold expiry ------------------------------------------------------------------------------------------------------
create function private.expire_registration_holds()
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
    -- Only UNPAID holds expire. A payment in flight ('processing') or already paid keeps its spot.
    with expired as (
      update public.registrations r set status = 'withdrawn', decision_note = 'payment_expired', hold_expires_at = null
      from public.payment_requests q
      where r.registration_event_id = e.id and r.status = 'submitted' and r.hold_expires_at < now()
        and q.id = r.payment_request_id and q.status = 'unpaid'
      returning r.id)
    select coalesce(array_agg(id), '{}') into v_ids from expired;
    v_total := v_total + cardinality(v_ids);
    if cardinality(v_ids) > 0 then
      perform private.write_audit('registration.hold_expired', 'registration_events', e.id, e.team_id, e.club_id, null,
        jsonb_build_object('count', cardinality(v_ids)));
      if e.auto_promote_waitlist then perform private.promote_waitlist(e.id, 1000); end if;
    end if;
  end loop;
  return v_total;
end;
$$;

-- Staff digests ---------------------------------------------------------------------------------------------------------
create function private.registration_managers(p_team_id uuid, p_club_id uuid)
returns table (profile_id uuid) language sql stable security definer set search_path = ''
as $$
  select tm.profile_id from public.team_memberships tm
    where p_team_id is not null and tm.team_id = p_team_id and tm.status = 'active' and tm.role in ('admin', 'manager')
  union
  select cm.profile_id from public.club_memberships cm
    where p_club_id is not null and cm.club_id = p_club_id and cm.status = 'active' and cm.role = 'admin';
$$;

create function private.send_registration_digests()
returns integer language plpgsql security definer set search_path = ''
as $$
declare e public.registration_events; r record; v_new integer; v_taken integer; v_sent integer := 0;
        v_bucket text := floor(extract(epoch from now()) / 60)::bigint::text;
begin
  for e in select * from public.registration_events where status in ('open', 'closed') loop
    select count(*) into v_new from public.registrations g
      where g.registration_event_id = e.id and g.status in ('submitted', 'waitlisted')
        and coalesce(g.verified_at, g.submitted_at) > coalesce(e.staff_digest_at, e.created_at);
    if v_new > 0 then
      for r in select * from private.registration_managers(e.team_id, e.club_id) loop
        perform private.enqueue_notification(r.profile_id, 'registration',
          jsonb_build_object('kind', 'registration', 'title', left(e.title, 100),
            'body', v_new || case when v_new = 1 then ' new registration' else ' new registrations' end,
            'registration_event_id', e.id),
          'regdigest:' || e.id || ':' || r.profile_id || ':' || v_bucket);
        v_sent := v_sent + 1;
      end loop;
      update public.registration_events set staff_digest_at = now() where id = e.id;
    end if;
    if e.capacity is not null then
      v_taken := private.registration_taken(e.id);
      if v_taken >= e.capacity and e.filled_notified_at is null then
        for r in select * from private.registration_managers(e.team_id, e.club_id) loop
          perform private.enqueue_notification(r.profile_id, 'registration',
            jsonb_build_object('kind', 'registration', 'title', left(e.title, 100), 'body', 'Registration is full',
              'registration_event_id', e.id),
            'regfull:' || e.id || ':' || r.profile_id || ':' || v_bucket);
          v_sent := v_sent + 1;
        end loop;
        update public.registration_events set filled_notified_at = now() where id = e.id;
      elsif v_taken < e.capacity and e.filled_notified_at is not null then
        update public.registration_events set filled_notified_at = null where id = e.id;
      end if;
    end if;
  end loop;
  return v_sent;
end;
$$;

-- Waiver expiry -------------------------------------------------------------------------------------------------------
-- Looks at the LATEST acceptance per rostered player and waiver. Notifications carry the waiver title only (no child name).
create function private.waiver_expiry_notices()
returns integer language plpgsql security definer set search_path = ''
as $$
declare r record; g record; s record; v_sent integer := 0;
begin
  for r in
    select distinct on (a.player_id, v.waiver_id) a.id as acceptance_id, a.player_id, w.title, tp.team_id, p.household_id,
           a.accepted_at + make_interval(days => v.requires_resign_after_days) as expires_at
    from public.waiver_acceptances a
    join public.waiver_versions v on v.id = a.waiver_version_id and v.requires_resign_after_days is not null
    join public.waivers w on w.id = v.waiver_id
    join public.players p on p.id = a.player_id
    join public.team_players tp on tp.player_id = a.player_id and tp.status = 'active'
    join public.team_required_waivers rw on rw.team_id = tp.team_id and rw.waiver_id = w.id
    where a.player_id is not null
    order by a.player_id, v.waiver_id, a.accepted_at desc
  loop
    continue when r.expires_at < now() or r.expires_at > now() + interval '14 days';
    for g in select hm.profile_id from public.household_members hm where hm.household_id = r.household_id and hm.relationship = 'guardian' loop
      perform private.enqueue_notification(g.profile_id, 'registration',
        jsonb_build_object('kind', 'registration', 'title', 'Waiver renewal needed', 'body', left(r.title, 100) || ' expires soon',
          'team_id', r.team_id),
        'waiverexp:' || r.acceptance_id || ':' || g.profile_id);
      v_sent := v_sent + 1;
    end loop;
  end loop;
  -- One batched notice per team for staff.
  for s in
    select tp.team_id, count(distinct (a.player_id, v.waiver_id))::int as n
    from public.waiver_acceptances a
    join public.waiver_versions v on v.id = a.waiver_version_id and v.requires_resign_after_days is not null
    join public.team_players tp on tp.player_id = a.player_id and tp.status = 'active'
    join public.team_required_waivers rw on rw.team_id = tp.team_id and rw.waiver_id = v.waiver_id
    where a.player_id is not null
      and a.accepted_at + make_interval(days => v.requires_resign_after_days) between now() and now() + interval '14 days'
      and not exists (select 1 from public.waiver_acceptances a2 join public.waiver_versions v2 on v2.id = a2.waiver_version_id
                      where a2.player_id = a.player_id and v2.waiver_id = v.waiver_id and a2.accepted_at > a.accepted_at)
    group by tp.team_id
  loop
    for g in select * from private.registration_managers(s.team_id, null) loop
      perform private.enqueue_notification(g.profile_id, 'registration',
        jsonb_build_object('kind', 'registration', 'title', 'Waivers expiring soon',
          'body', s.n || case when s.n = 1 then ' waiver expires' else ' waivers expire' end || ' within 14 days', 'team_id', s.team_id),
        'waiverexp-staff:' || s.team_id || ':' || g.profile_id || ':' || current_date);
      v_sent := v_sent + 1;
    end loop;
  end loop;
  return v_sent;
end;
$$;

-- Retention and erasure --------------------------------------------------------------------------------------------------------
-- Replace personal data with placeholders and keep the row (counts, statuses, audit trail). Waiver acceptances are NOT
-- touched: they are append-only legal records (see docs/registration-privacy.md).
create function private.anonymize_registration(p_registration_id uuid)
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
  perform private.write_audit('registration.anonymize', 'registrations', r.id, e.team_id, e.club_id, null, null);
end;
$$;

create function public.svc_run_registration_retention(p_months integer default 12, p_sensitive_days integer default 90)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r record; v_anon integer := 0; v_sens integer; v_tokens integer;
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
  return jsonb_build_object('anonymized', v_anon, 'sensitive_purged', v_sens, 'tokens_deleted', v_tokens);
end;
$$;

-- Staff-triggered, audited: everything held about one registration (sensitive answers only with the capability).
create function public.export_registrant_data(p_registration_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare r public.registrations; e public.registration_events; v_sens jsonb := null;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into r from public.registrations where id = p_registration_id;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.registration_events where id = r.registration_event_id;
  if not private.is_issuer_manager(e.team_id, e.club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if private.can_read_sensitive(e.team_id, e.club_id) then
    select s.answers into v_sens from public.registration_sensitive_answers s where s.registration_id = r.id;
  end if;
  perform private.write_audit('registration.export_registrant', 'registrations', r.id, e.team_id, e.club_id, null,
    jsonb_build_object('sensitive', v_sens is not null));
  return jsonb_build_object(
    'registration', to_jsonb(r) - 'form_version_id',
    'event_title', e.title,
    'sensitive_answers', v_sens,
    'waiver_acceptances', coalesce((select jsonb_agg(jsonb_build_object('waiver_version_id', a.waiver_version_id, 'signer_name', a.signer_name,
        'signer_relationship', a.signer_relationship, 'signer_email', a.signer_email, 'accepted_at', a.accepted_at)) from public.waiver_acceptances a
        where a.registration_id = r.id), '[]'::jsonb),
    'payment', (select jsonb_build_object('display_id', q.display_id, 'status', q.status, 'amount_cents', q.amount_cents)
                from public.payment_requests q where q.id = r.payment_request_id));
end;
$$;

-- Staff-triggered, audited: erase a registrant's personal data now (parent request). A placed player must be removed
-- from the roster first (that is a roster decision, not a data one).
create function public.erase_registrant_data(p_registration_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.registrations; e public.registration_events; v_freed boolean;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select registration_event_id into r.registration_event_id from public.registrations where id = p_registration_id;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.registration_events where id = r.registration_event_id for update;
  if not private.is_issuer_manager(e.team_id, e.club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.registrations where id = p_registration_id for update;
  if r.status = 'placed' then raise exception 'placed_withdraw_first' using errcode = '23514'; end if;
  v_freed := private.registration_holds_spot(r, e);
  if r.status not in ('declined', 'withdrawn') then
    update public.registrations set status = 'withdrawn', hold_expires_at = null, decision_note = 'erased' where id = r.id;
  end if;
  perform private.anonymize_registration(r.id);
  perform private.write_audit('registration.erase', 'registrations', r.id, e.team_id, e.club_id, null, null);
  if v_freed and e.auto_promote_waitlist then perform private.promote_waitlist(e.id, 1000); end if;
end;
$$;

-- Account claim ----------------------------------------------------------------------------------------------------------------------
-- A signed-in user whose account email is CONFIRMED claims registrations that were made anonymously with that same
-- (verified) email. Matching is by verified email only: a registration is never claimable by name or id.
create function public.claim_my_registrations()
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := (select auth.uid()); v_email text; v_n integer;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  with c as (
    update public.registrations r set submitted_by = v_uid
    where r.submitted_by is null and r.verified_at is not null and r.anonymized_at is null
      and r.status not in ('declined', 'withdrawn') and lower(r.guardian_email) = v_email
    returning r.id)
  select count(*)::int into v_n from c;
  if v_n > 0 then
    perform private.write_audit('registration.claim', 'profiles', v_uid, null, null, null, jsonb_build_object('count', v_n));
  end if;
  return v_n;
end;
$$;

-- Schedules --------------------------------------------------------------------------------------------------------------------------
select cron.schedule('registration-expire-holds', '*/5 * * * *', 'select private.expire_registration_holds()');
select cron.schedule('registration-staff-digest', '*/15 * * * *', 'select private.send_registration_digests()');
select cron.schedule('registration-waiver-expiry', '0 14 * * *', 'select private.waiver_expiry_notices()');
select cron.schedule('registration-retention', '30 3 * * *', 'select public.svc_run_registration_retention()');

revoke execute on function
  private.expire_registration_holds(), private.registration_managers(uuid, uuid), private.send_registration_digests(),
  private.waiver_expiry_notices(), private.anonymize_registration(uuid),
  public.svc_run_registration_retention(integer, integer), public.export_registrant_data(uuid),
  public.erase_registrant_data(uuid), public.claim_my_registrations()
  from public, anon, authenticated;
grant execute on function public.export_registrant_data(uuid), public.erase_registrant_data(uuid), public.claim_my_registrations()
  to authenticated;
grant execute on function public.svc_run_registration_retention(integer, integer) to service_role;
