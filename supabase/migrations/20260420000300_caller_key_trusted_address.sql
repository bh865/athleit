-- Rate-limit key for the signed-out previews: stop trusting the part of x-forwarded-for a client can write.
--
-- A client can send its own X-Forwarded-For, and proxies append to it, so the FIRST entry is attacker
-- controlled (a new value per call defeats the limit). Order of trust now:
--   1. the signed-in user id;
--   2. cf-connecting-ip, which Cloudflare (in front of hosted Supabase) overwrites on every request;
--   3. the LAST x-forwarded-for entry, which the nearest proxy appended and the client cannot choose
--      (coarser: callers behind the same proxy share a bucket, which only makes the limit stricter);
--   4. 'unknown'.
-- Without Cloudflare in front (a self-hosted or local stack), step 2 is client supplied: fine for
-- development, and a reason to keep the limit per key rather than global.
create or replace function private.caller_key()
returns text language sql stable set search_path = ''
as $$
  with h as (
    select nullif(current_setting('request.headers', true), '')::json as j
  )
  select left(coalesce(
    auth.uid()::text,
    nullif(btrim(h.j ->> 'cf-connecting-ip'), ''),
    nullif(btrim((string_to_array(coalesce(h.j ->> 'x-forwarded-for', ''), ','))[
      cardinality(string_to_array(coalesce(h.j ->> 'x-forwarded-for', ''), ','))
    ]), ''),
    'unknown'
  ), 64)
  from h;
$$;
