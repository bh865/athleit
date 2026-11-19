-- Family code: a household join code (mirrors teams.join_code) and a guardian join-request flow
-- (mirrors join_requests). A code never grants access by itself: it queues a request that an
-- existing guardian approves. Guardian lists expose display names only (no email or phone).

-- 1. Household code ----------------------------------------------------------------------------
-- A volatile default is evaluated per row, so this backfills existing households with distinct
-- codes and gives every future household one at creation (add_child, registration, ...).
alter table public.households
  add column join_code text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
alter table public.households
  add constraint households_join_code_format check (join_code ~ '^[A-Z0-9]{10}$');

-- 2. Requests ----------------------------------------------------------------------------------
create table public.household_join_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  message text constraint household_join_requests_message_length check (char_length(message) <= 500),
  status text not null default 'pending'
    constraint household_join_requests_status_check
      check (status in ('pending', 'approved', 'declined', 'cancelled')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index household_join_requests_household_id_idx on public.household_join_requests (household_id);
create index household_join_requests_requester_id_idx on public.household_join_requests (requester_id);
create index household_join_requests_decided_by_idx
  on public.household_join_requests (decided_by) where decided_by is not null;
create unique index household_join_requests_one_pending
  on public.household_join_requests (household_id, requester_id) where status = 'pending';

alter table public.household_join_requests enable row level security;
revoke all on public.household_join_requests from anon, authenticated;
grant select on public.household_join_requests to authenticated;

-- Nobody writes directly: every change goes through the functions below.
create policy "Requesters and guardians read household join requests" on public.household_join_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or private.is_household_guardian(household_id));

-- 3. Attempt limit -----------------------------------------------------------------------------
-- Fixed window, same table as svc_rate_limit. Callers must not raise after hitting it (a raise
-- would roll the hit back), which is why request_to_join_household returns an outcome.
create function private.hit_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.api_rate_limits (bucket, window_start, hits) values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = public.api_rate_limits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

-- 4. Functions ---------------------------------------------------------------------------------
create function public.rotate_household_join_code(p_household_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.is_household_guardian(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.households set join_code = v_code where id = p_household_id;
  perform private.write_audit('household.rotate_join_code', 'households', p_household_id, null, null, null, null);
  return v_code;
end;
$$;

-- Returns an outcome instead of raising for expected failures so the attempt is still counted:
-- 'sent' | 'invalid_code' (unknown or rotated: indistinguishable on purpose) | 'already_member'
-- | 'too_many_attempts'.
create function public.request_to_join_household(p_code text, p_message text default null)
returns table (outcome text, request_id uuid) language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.hit_rate_limit('household_join:' || v_uid, 10, 900) then
    return query select 'too_many_attempts'::text, null::uuid;
    return;
  end if;
  select id into v_household from public.households where join_code = upper(btrim(coalesce(p_code, '')));
  if v_household is null then
    return query select 'invalid_code'::text, null::uuid;
    return;
  end if;
  if private.is_household_guardian(v_household) then
    return query select 'already_member'::text, null::uuid;
    return;
  end if;
  insert into public.household_join_requests (household_id, requester_id, message)
  values (v_household, v_uid, nullif(btrim(p_message), ''))
  on conflict (household_id, requester_id) where status = 'pending' do nothing
  returning id into v_id;
  if v_id is null then
    -- Already pending: succeed quietly with the existing request.
    select r.id into v_id from public.household_join_requests r
      where r.household_id = v_household and r.requester_id = v_uid and r.status = 'pending';
  else
    perform private.write_audit('household_join_request.create', 'household_join_requests', v_id,
      null, null, null, jsonb_build_object('household_id', v_household));
  end if;
  return query select 'sent'::text, v_id;
end;
$$;

create function public.decide_household_join_request(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  r public.household_join_requests;
  v_target text := case when p_approve then 'approved' else 'declined' end;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into r from public.household_join_requests where id = p_request_id for update;
  if not found or not private.is_household_guardian(r.household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status = v_target then
    return; -- double decision: idempotent
  end if;
  if r.status <> 'pending' then
    raise exception 'request_not_pending';
  end if;
  if p_approve then
    insert into public.household_members (household_id, profile_id, relationship)
    values (r.household_id, r.requester_id, 'guardian')
    on conflict (household_id, profile_id) do nothing;
  end if;
  update public.household_join_requests
    set status = v_target, decided_by = auth.uid(), decided_at = now()
    where id = r.id;
  perform private.write_audit(
    case when p_approve then 'household_join_request.approve' else 'household_join_request.decline' end,
    'household_join_requests', r.id, null, null,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', v_target));
  if p_approve then
    select name into v_name from public.households where id = r.household_id;
    perform private.enqueue_notification(r.requester_id, 'announcements',
      jsonb_build_object('kind', 'family_access', 'title', 'Family access approved',
        'body', 'You can now see ' || left(coalesce(v_name, 'the family'), 100),
        'household_id', r.household_id),
      'hhjoin:' || r.id);
  end if;
end;
$$;

create function public.get_household_join_requests(p_household_id uuid)
returns table (request_id uuid, requester_name text, message text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.is_household_guardian(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select r.id, coalesce(nullif(btrim(p.display_name), ''), 'Someone'), r.message, r.created_at
    from public.household_join_requests r
    join public.profiles p on p.id = r.requester_id
    where r.household_id = p_household_id and r.status = 'pending'
    order by r.created_at;
end;
$$;

create function public.get_household_guardians(p_household_id uuid)
returns table (profile_id uuid, display_name text, relationship text, created_at timestamptz, is_you boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.is_household_guardian(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select hm.profile_id, coalesce(nullif(btrim(p.display_name), ''), 'Guardian'),
           hm.relationship::text, hm.created_at, hm.profile_id = auth.uid()
    from public.household_members hm
    join public.profiles p on p.id = hm.profile_id
    where hm.household_id = p_household_id
    order by hm.created_at, hm.profile_id;
end;
$$;

revoke execute on function private.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function
  public.rotate_household_join_code(uuid), public.request_to_join_household(text, text),
  public.decide_household_join_request(uuid, boolean), public.get_household_join_requests(uuid),
  public.get_household_guardians(uuid)
  from public, anon, authenticated;
grant execute on function
  public.rotate_household_join_code(uuid), public.request_to_join_household(text, text),
  public.decide_household_join_request(uuid, boolean), public.get_household_join_requests(uuid),
  public.get_household_guardians(uuid)
  to authenticated;
