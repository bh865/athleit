-- Phase 5 (B1): verification and signing tokens, email-only notification rows, status-machine tweaks
--
-- * registration_verification_tokens: HASHED single-use magic-link tokens (purpose 'verify') and short-lived
--   reusable signing tokens (purpose 'sign') handed to a verified anonymous registrant so they can sign waivers
--   without an account. Raw tokens never touch the database.
-- * notification_outbox may now carry an EMAIL-ONLY recipient (no profile): registrants without an account.
--   Registration emails are transactional: they bypass notification preferences. The existing worker
--   (claim_notifications) never sees these rows; claim_registration_emails does.
-- * 'registration' joins the notification categories (same pattern as 'payments' in Phase 4).
-- * At-submission payment holds: promoting a waitlisted registration puts it back to 'submitted' with a running hold.

-- Tokens --------------------------------------------------------------------------------------------------
create table public.registration_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  purpose text not null constraint registration_verification_tokens_purpose check (purpose in ('verify', 'sign')),
  -- sha256 hex of the raw token. 32 random bytes, so an unsalted hash cannot be brute forced.
  token_hash text not null unique constraint registration_verification_tokens_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index registration_verification_tokens_registration_id_idx on public.registration_verification_tokens (registration_id);
alter table public.registration_verification_tokens enable row level security;
revoke all on public.registration_verification_tokens from anon, authenticated;
create policy "No client access to verification tokens" on public.registration_verification_tokens
  for all to authenticated using (false) with check (false);

-- Issue a verification token for a pending registration. Older unused verify tokens stop working. At most
-- 5 per registration per day (a resend cannot be used to spam an inbox).
create function public.svc_issue_verification_token(p_registration_id uuid, p_token_hash text, p_ttl_minutes integer default 60)
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
  update public.registration_verification_tokens set used_at = now()
    where registration_id = p_registration_id and purpose = 'verify' and used_at is null;
  insert into public.registration_verification_tokens (registration_id, purpose, token_hash, expires_at)
  values (p_registration_id, 'verify', p_token_hash, now() + make_interval(mins => least(greatest(p_ttl_minutes, 5), 1440)));
end;
$$;

-- Consume a verification token (single use, expiring) and verify the registration, atomically: if verification
-- fails (event closed or full) the token is NOT burned. Replay, expiry and unknown tokens are indistinguishable.
create function public.svc_consume_verification_token(p_token_hash text)
returns table (registration_id uuid, display_id text, status text)
language plpgsql security definer set search_path = ''
as $$
declare v_reg uuid; v_status text; v_display text;
begin
  update public.registration_verification_tokens t set used_at = now()
    where t.token_hash = p_token_hash and t.purpose = 'verify' and t.used_at is null and t.expires_at > now()
    returning t.registration_id into v_reg;
  if v_reg is null then raise exception 'invalid_token' using errcode = '22023'; end if;
  v_status := public.svc_verify_registration(v_reg);
  select r.display_id into v_display from public.registrations r where r.id = v_reg;
  return query select v_reg, v_display, v_status;
end;
$$;

-- A verified registrant gets a signing token (reusable until it expires) to sign waivers without an account.
create function public.svc_issue_sign_token(p_registration_id uuid, p_token_hash text, p_ttl_minutes integer default 60)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.registrations r where r.id = p_registration_id
                 and r.status in ('submitted', 'waitlisted', 'accepted') and r.verified_at is not null) then
    raise exception 'not_verified' using errcode = '23514';
  end if;
  insert into public.registration_verification_tokens (registration_id, purpose, token_hash, expires_at)
  values (p_registration_id, 'sign', p_token_hash, now() + make_interval(mins => least(greatest(p_ttl_minutes, 5), 240)));
end;
$$;

create function public.svc_resolve_sign_token(p_token_hash text)
returns uuid language sql stable security definer set search_path = ''
as $$
  select t.registration_id from public.registration_verification_tokens t
  where t.token_hash = p_token_hash and t.purpose = 'sign' and t.expires_at > now()
    and exists (select 1 from public.registrations r where r.id = t.registration_id and r.status in ('submitted', 'waitlisted', 'accepted'));
$$;

-- Email-only notification rows -----------------------------------------------------------------------------------
alter table public.notification_outbox alter column profile_id drop not null;
alter table public.notification_outbox
  add column recipient_email text constraint notification_outbox_recipient_email_length check (char_length(recipient_email) <= 254),
  add constraint notification_outbox_one_recipient check (
    num_nonnulls(profile_id, recipient_email) = 1 and (recipient_email is null or channel = 'email'));

alter table public.notification_preferences drop constraint notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category in ('messages', 'announcements', 'schedule', 'payments', 'registration', 'payments_reserved'));
alter table public.notification_outbox drop constraint notification_outbox_category_check;
alter table public.notification_outbox add constraint notification_outbox_category_check
  check (category in ('messages', 'announcements', 'schedule', 'payments', 'registration', 'payments_reserved'));

create or replace function private.seed_notification_preferences(p_profile_id uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into public.notification_preferences (profile_id, channel, category)
  select p_profile_id, ch, cat
  from unnest(array['push', 'email']) ch,
       unnest(array['messages', 'announcements', 'schedule', 'payments', 'registration']) cat
  on conflict do nothing;
$$;
insert into public.notification_preferences (profile_id, channel, category)
select p.id, ch, 'registration' from public.profiles p, unnest(array['push', 'email']) ch
on conflict do nothing;
drop policy "Create own preferences (implemented channels and categories only)" on public.notification_preferences;
create policy "Create own preferences (implemented channels and categories only)" on public.notification_preferences
  for insert to authenticated
  with check (profile_id = (select auth.uid()) and channel in ('push', 'email')
              and category in ('messages', 'announcements', 'schedule', 'payments', 'registration'));

-- The existing worker only ever claims rows that belong to a profile.
create or replace function public.claim_notifications(p_limit integer default 50)
returns table (id uuid, profile_id uuid, category text, channel text, payload jsonb, attempts integer)
language sql security definer set search_path = ''
as $$
  with due as (
    select o.id from public.notification_outbox o
    where o.channel in ('push', 'email')
      and o.profile_id is not null
      and o.status in ('pending', 'failed', 'sending')
      and o.deliver_after <= now()
      and o.attempts < 5
    order by o.deliver_after
    limit greatest(1, least(p_limit, 200))
    for update skip locked)
  update public.notification_outbox o
    set status = 'sending',
        deliver_after = now() + interval '5 minutes',
        attempts = o.attempts + case when o.status = 'sending' then 1 else 0 end
  from due where o.id = due.id
  returning o.id, o.profile_id, o.category, o.channel, o.payload, o.attempts;
$$;

create function public.claim_registration_emails(p_limit integer default 50)
returns table (id uuid, recipient_email text, payload jsonb, attempts integer)
language sql security definer set search_path = ''
as $$
  with due as (
    select o.id from public.notification_outbox o
    where o.channel = 'email' and o.profile_id is null and o.recipient_email is not null
      and o.status in ('pending', 'failed', 'sending')
      and o.deliver_after <= now() and o.attempts < 5
    order by o.deliver_after
    limit greatest(1, least(p_limit, 200))
    for update skip locked)
  update public.notification_outbox o
    set status = 'sending', deliver_after = now() + interval '5 minutes',
        attempts = o.attempts + case when o.status = 'sending' then 1 else 0 end
  from due where o.id = due.id
  returning o.id, o.recipient_email, o.payload, o.attempts;
$$;

-- Transactional registrant email: bypasses notification preferences by design. Deduped by key (one email per
-- event of a kind), so a retried transaction or a repeated cron run never sends twice.
create function private.enqueue_registration_email(p_email text, p_kind text, p_payload jsonb, p_dedupe text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.notification_outbox (profile_id, recipient_email, category, channel, payload, dedupe_key)
  values (null, lower(btrim(p_email)), 'registration', 'email', p_payload || jsonb_build_object('kind', 'registration_email', 'template', p_kind),
          left('regmail:' || p_dedupe, 300))
  on conflict (dedupe_key) do nothing;
$$;

-- Status machine: a waitlisted registration promoted for an at-submission event returns to 'submitted' with a hold.
create or replace function private.guard_registration()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.guardian_email := lower(btrim(new.guardian_email));
  if tg_op = 'UPDATE' then
    if new.registration_event_id is distinct from old.registration_event_id
       or new.display_id is distinct from old.display_id
       or new.form_version_id is distinct from old.form_version_id then
      raise exception 'registration_immutable' using errcode = '23514';
    end if;
    if old.anonymized_at is not null and new.* is distinct from old.* then
      raise exception 'registration_anonymized' using errcode = '23514';
    end if;
    if new.status is distinct from old.status and not (
         (old.status = 'pending_verification' and new.status in ('submitted', 'waitlisted', 'declined', 'withdrawn'))
      or (old.status = 'submitted' and new.status in ('accepted', 'waitlisted', 'declined', 'withdrawn'))
      or (old.status = 'waitlisted' and new.status in ('submitted', 'accepted', 'declined', 'withdrawn'))
      or (old.status = 'accepted' and new.status in ('placed', 'declined', 'withdrawn'))
      or (old.status = 'placed' and new.status in ('withdrawn'))) then
      raise exception 'invalid_status_transition' using errcode = '23514',
        detail = format('%s -> %s', old.status, new.status);
    end if;
  end if;
  return new;
end;
$$;

-- Promotion: pay-to-hold events move the registration to 'submitted' with a payment hold; others are accepted.
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
      update public.registrations set status = 'submitted', decided_at = now(),
        hold_expires_at = now() + make_interval(mins => e.payment_hold_minutes) where id = r.id;
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

-- Grants -------------------------------------------------------------------------------------------------------------------
revoke execute on function
  public.svc_issue_verification_token(uuid, text, integer), public.svc_consume_verification_token(text),
  public.svc_issue_sign_token(uuid, text, integer), public.svc_resolve_sign_token(text),
  public.claim_registration_emails(integer), private.enqueue_registration_email(text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function
  public.svc_issue_verification_token(uuid, text, integer), public.svc_consume_verification_token(text),
  public.svc_issue_sign_token(uuid, text, integer), public.svc_resolve_sign_token(text),
  public.claim_registration_emails(integer)
  to service_role;
