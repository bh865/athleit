-- Auth + onboarding (2/2): own join requests (read, cancel) and signed-out previews.
--
--  * get_my_join_requests(): what the requester supplied and its status. A team or family name
--    is returned only once the request is approved, so a pending requester learns nothing.
--  * cancel_join_request(kind, id): the requester's own pending request only.
--  * preview_invite_public(token) / preview_claim_public(player_id): the banner shown before sign-in.
--    Fixed, minimal shape; rate limited per caller with the same limiter as the family code.
--  * get_join_requests now hides cancelled requests from staff.

-- Staff queue without cancelled requests (same signature, so replace in place).
create or replace function public.get_join_requests(p_team_id uuid)
returns table (id uuid, requester_id uuid, requester_name text, player_id uuid,
               player_first_name text, player_last_name text, message text,
               status public.request_status, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select jr.id, jr.requester_id, pr.display_name, jr.player_id,
         case when jr.status in ('pending', 'approved') then p.first_name end,
         case when jr.status in ('pending', 'approved') then p.last_name end,
         jr.message, jr.status, jr.created_at
  from public.join_requests jr
  join public.profiles pr on pr.id = jr.requester_id
  left join public.players p on p.id = jr.player_id
  where jr.team_id = p_team_id and private.is_team_staff(p_team_id) and jr.status <> 'cancelled'
  order by (jr.status = 'pending') desc, jr.created_at desc;
$$;

create function public.get_my_join_requests()
returns table (kind text, request_id uuid, status text, created_at timestamptz, decided_at timestamptz,
               child_first_name text, place_name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return query
    select * from (
      select 'team'::text as kind, jr.id as request_id, jr.status::text as status, jr.created_at,
             jr.decided_at, p.first_name as child_first_name,
             case when jr.status = 'approved' then t.name end as place_name
      from public.join_requests jr
      join public.teams t on t.id = jr.team_id
      left join public.players p on p.id = jr.player_id
      where jr.requester_id = auth.uid()
      union all
      select 'household'::text, hr.id, hr.status, hr.created_at, hr.decided_at, null::text,
             case when hr.status = 'approved' then h.name end
      from public.household_join_requests hr
      join public.households h on h.id = hr.household_id
      where hr.requester_id = auth.uid()
    ) r
    order by r.created_at desc, r.request_id
    limit 20;
end;
$$;

create function public.cancel_join_request(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_team uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_kind = 'team' then
    select jr.team_id, jr.status::text into v_team, v_status
      from public.join_requests jr where jr.id = p_id and jr.requester_id = v_uid for update;
    if not found then raise exception 'request_not_found'; end if;
    if v_status <> 'pending' then raise exception 'request_not_pending'; end if;
    update public.join_requests set status = 'cancelled'::public.request_status, decided_at = now()
      where id = p_id;
    perform private.write_audit('join_request.cancel', 'join_requests', p_id, v_team, null,
      jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'cancelled'));
  elsif p_kind = 'household' then
    select hr.status into v_status
      from public.household_join_requests hr where hr.id = p_id and hr.requester_id = v_uid for update;
    if not found then raise exception 'request_not_found'; end if;
    if v_status <> 'pending' then raise exception 'request_not_pending'; end if;
    update public.household_join_requests set status = 'cancelled', decided_at = now() where id = p_id;
    perform private.write_audit('household_join_request.cancel', 'household_join_requests', p_id,
      null, null, jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'cancelled'));
  else
    raise exception 'invalid_target';
  end if;
end;
$$;

-- Caller key for anonymous rate limits: the user when signed in, else the first forwarded address.
create function private.caller_key()
returns text language sql stable set search_path = ''
as $$
  select coalesce(
    auth.uid()::text,
    nullif(btrim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), ''),
    'unknown');
$$;

-- Outcome is 'ok', 'invalid', 'expired' or 'rate_limited'. Every other column is null unless 'ok'.
-- A used, revoked or expired invite all report 'expired' so the caller cannot tell them apart.
create function public.preview_invite_public(p_token text)
returns table (outcome text, kind text, target_name text, role text, inviter_first_name text)
language plpgsql security definer set search_path = ''
as $$
declare
  i public.invites;
  v_kind text;
  v_name text;
  v_inviter text;
begin
  if not private.hit_rate_limit('invite_preview:' || private.caller_key(), 30, 900) then
    return query select 'rate_limited'::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  select * into i from public.invites where token_hash = private.hash_token(coalesce(p_token, ''));
  if not found then
    return query select 'invalid'::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  if i.revoked_at is not null or i.expires_at <= now() or i.use_count >= i.max_uses then
    return query select 'expired'::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  if i.team_id is not null then
    v_kind := 'team'; select t.name into v_name from public.teams t where t.id = i.team_id;
  elsif i.club_id is not null then
    v_kind := 'club'; select c.name into v_name from public.clubs c where c.id = i.club_id;
  else
    v_kind := 'family'; select h.name into v_name from public.households h where h.id = i.household_id;
  end if;
  select nullif(split_part(btrim(coalesce(p.display_name, '')), ' ', 1), '') into v_inviter
    from public.profiles p where p.id = i.created_by;
  return query select 'ok'::text, v_kind, v_name, i.role, v_inviter;
end;
$$;

-- First name only, and only for a player who could claim a login (13+, not yet linked).
create function public.preview_claim_public(p_player_id uuid)
returns table (outcome text, player_first_name text)
language plpgsql security definer set search_path = ''
as $$
declare
  p public.players;
begin
  if not private.hit_rate_limit('claim_preview:' || private.caller_key(), 30, 900) then
    return query select 'rate_limited'::text, null::text;
    return;
  end if;
  select * into p from public.players where id = p_player_id;
  if not found or p.profile_id is not null
     or p.date_of_birth > (current_date - interval '13 years')::date then
    return query select 'invalid'::text, null::text;
    return;
  end if;
  return query select 'ok'::text, p.first_name;
end;
$$;

revoke execute on function private.caller_key() from public, anon, authenticated;
grant execute on function private.caller_key() to anon, authenticated;
revoke execute on function
  public.get_my_join_requests(), public.cancel_join_request(text, uuid),
  public.preview_invite_public(text), public.preview_claim_public(uuid)
  from public, anon, authenticated;
grant execute on function public.get_my_join_requests(), public.cancel_join_request(text, uuid)
  to authenticated;
grant execute on function public.preview_invite_public(text), public.preview_claim_public(uuid)
  to anon, authenticated;
