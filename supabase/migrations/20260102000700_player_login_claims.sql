-- Phase 1A (8/8): player login claims
--
-- A player aged 13+ may link their own profile (own login). It auto-approves only when the
-- player's CONFIRMED sign-in email matches the email the guardian put on the player
-- (players.login_invite_email); otherwise a review request is created for the guardians.
-- Under-13 players can never be linked (also enforced by a trigger on players).

create table public.player_login_claims (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.request_status not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index player_login_claims_player_id_idx on public.player_login_claims (player_id);
create index player_login_claims_profile_id_idx on public.player_login_claims (profile_id);
create index player_login_claims_decided_by_idx on public.player_login_claims (decided_by)
  where decided_by is not null;
create unique index player_login_claims_one_pending
  on public.player_login_claims (player_id, profile_id) where status = 'pending';

alter table public.player_login_claims enable row level security;
revoke all on public.player_login_claims from anon, authenticated;
grant select on public.player_login_claims to authenticated;

create policy "Claimants and the player's guardians read claims" on public.player_login_claims
  for select to authenticated
  using (profile_id = (select auth.uid()) or private.is_guardian_of(player_id));

create function public.claim_player_login(p_player_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  p public.players;
  u auth.users;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into p from public.players where id = p_player_id for update;
  if not found then raise exception 'player_not_found'; end if;
  if p.date_of_birth > (current_date - interval '13 years')::date then
    raise exception 'player_under_13' using errcode = '23514',
      detail = 'Players under 13 cannot have their own login.';
  end if;
  if p.profile_id is not null then raise exception 'player_already_linked'; end if;
  select * into u from auth.users where id = v_uid;

  if p.login_invite_email is not null and u.email_confirmed_at is not null
     and lower(btrim(p.login_invite_email)) = lower(btrim(u.email)) then
    update public.players set profile_id = v_uid, login_invite_email = null where id = p.id;
    insert into public.player_login_claims (player_id, profile_id, status, decided_at)
    values (p.id, v_uid, 'approved', now()) returning id into v_id;
    perform private.write_audit('player.claim_login', 'players', p.id, null, null, null,
      jsonb_build_object('profile_id', v_uid, 'auto_approved', true));
    return 'approved';
  end if;

  insert into public.player_login_claims (player_id, profile_id) values (p.id, v_uid) returning id into v_id;
  perform private.write_audit('player.claim_login_request', 'player_login_claims', v_id, null, null, null,
    jsonb_build_object('player_id', p.id, 'profile_id', v_uid));
  return 'pending';
end;
$$;

create function public.decide_player_login_claim(p_claim_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  c public.player_login_claims;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into c from public.player_login_claims where id = p_claim_id for update;
  if not found or not private.is_guardian_of(c.player_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'pending' then raise exception 'request_not_pending'; end if;
  if p_approve then
    -- The players trigger rejects the link if the player is under 13.
    update public.players set profile_id = c.profile_id, login_invite_email = null where id = c.player_id;
  end if;
  update public.player_login_claims
    set status = case when p_approve then 'approved' else 'declined' end::public.request_status,
        decided_by = auth.uid(), decided_at = now()
    where id = c.id;
  perform private.write_audit(
    case when p_approve then 'player.claim_login_approve' else 'player.claim_login_decline' end,
    'player_login_claims', c.id, null, null, null,
    jsonb_build_object('player_id', c.player_id, 'profile_id', c.profile_id));
end;
$$;

revoke execute on function public.claim_player_login(uuid), public.decide_player_login_claim(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_player_login(uuid), public.decide_player_login_claim(uuid, boolean)
  to authenticated;
