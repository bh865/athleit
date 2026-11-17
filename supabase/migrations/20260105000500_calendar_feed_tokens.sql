-- Phase 2 (6/9): calendar_feed_tokens
--
-- A calendar feed is a secret URL a user subscribes to from Apple/Google Calendar. Only the
-- SHA-256 hash of the token is stored; the plaintext exists once, in the return value of
-- create/rotate. Clients can read their own rows WITHOUT the hash column. Resolution of a
-- presented token happens in resolve_calendar_feed_token (service role only, used by the feed
-- Edge Function).

create table public.calendar_feed_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique constraint calendar_feed_tokens_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);
create index calendar_feed_tokens_profile_id_idx on public.calendar_feed_tokens (profile_id);
-- at most one live token per person
create unique index calendar_feed_tokens_one_active on public.calendar_feed_tokens (profile_id) where revoked_at is null;

alter table public.calendar_feed_tokens enable row level security;
revoke all on public.calendar_feed_tokens from anon, authenticated;
grant select (id, profile_id, created_at, revoked_at, last_used_at) on public.calendar_feed_tokens to authenticated;

create policy "Read own feed tokens" on public.calendar_feed_tokens
  for select to authenticated using (profile_id = (select auth.uid()));

-- Deleting a team cascades to its events, locations and opponents; a RESTRICT foreign key
-- would abort that cascade, so use NO ACTION (checked at the end of the statement): an in-use
-- location/opponent still cannot be deleted on its own, but a team can be removed whole.
alter table public.events drop constraint events_location_id_fkey,
  add constraint events_location_id_fkey foreign key (location_id) references public.locations (id);
alter table public.events drop constraint events_opponent_id_fkey,
  add constraint events_opponent_id_fkey foreign key (opponent_id) references public.opponents (id);
