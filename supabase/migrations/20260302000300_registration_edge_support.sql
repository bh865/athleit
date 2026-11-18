-- Phase 5 (B4): read helpers for the Edge Functions (service role only)
--
-- * svc_find_pending_registration: lets submit-registration answer a repeated anonymous submission WITHOUT revealing
--   whether the child was already registered (it quietly re-sends the verification email).
-- * svc_acceptance_context: everything the signed-copy PDF and email need, from the acceptance row itself.
-- * svc_registration_signing_state: which waivers a registrant still has to sign (by registration id, for the
--   signing-token flow, where there is no signed-in user to ask).
-- * svc_record_evidence: store IP / user agent for a signed-in signature (only when the product decision enables it).

create function public.svc_find_pending_registration(
  p_event_id uuid, p_email text, p_first_name text, p_last_name text, p_date_of_birth date)
returns uuid language sql stable security definer set search_path = ''
as $$
  select r.id from public.registrations r
  where r.registration_event_id = p_event_id and r.status = 'pending_verification'
    and lower(r.guardian_email) = lower(btrim(p_email)) and lower(r.player_first_name) = lower(btrim(p_first_name))
    and lower(r.player_last_name) = lower(btrim(p_last_name)) and r.player_date_of_birth = p_date_of_birth
  limit 1;
$$;

create function public.svc_acceptance_context(p_acceptance_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'acceptance_id', a.id, 'accepted_at', a.accepted_at, 'signer_name', a.signer_name, 'signer_relationship', a.signer_relationship,
    'signer_email', a.signer_email, 'electronic_consent', a.electronic_consent,
    'waiver', jsonb_build_object('title', v.title, 'version', v.version, 'body', v.body, 'content_hash', v.content_hash),
    'registration_display_id', r.display_id,
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

create function public.svc_registration_signing_state(p_registration_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'display_id', r.display_id, 'status', r.status,
    'waivers', coalesce((
      select jsonb_agg(jsonb_build_object('version_id', v.id, 'title', v.title, 'body', v.body, 'content_hash', v.content_hash,
                                          'signed', a.id is not null) order by v.title)
      from unnest(e.waiver_version_ids) wv(id)
      join public.waiver_versions v on v.id = wv.id
      left join public.waiver_acceptances a on a.registration_id = r.id and a.waiver_version_id = v.id), '[]'::jsonb))
  from public.registrations r join public.registration_events e on e.id = r.registration_event_id
  where r.id = p_registration_id and r.status in ('submitted', 'waitlisted', 'accepted');
$$;

create function public.svc_record_evidence(p_acceptance_id uuid, p_ip inet, p_user_agent text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.waiver_acceptance_evidence (acceptance_id, ip_address, user_agent)
  values (p_acceptance_id, p_ip, left(p_user_agent, 400)) on conflict do nothing;
$$;

revoke execute on function public.svc_find_pending_registration(uuid, text, text, text, date), public.svc_acceptance_context(uuid),
  public.svc_registration_signing_state(uuid), public.svc_record_evidence(uuid, inet, text) from public, anon, authenticated;
grant execute on function public.svc_find_pending_registration(uuid, text, text, text, date), public.svc_acceptance_context(uuid),
  public.svc_registration_signing_state(uuid), public.svc_record_evidence(uuid, inet, text) to service_role;
