# Supabase

Local backend for Athleit: Postgres, Auth, Realtime, Storage and Edge Functions,
run by the Supabase CLI (needs Docker or a compatible container runtime).

```
supabase/
  config.toml     local stack config (auth redirect URLs, provider placeholders)
  migrations/     the only way schema changes happen
  seed.sql        local dev seed data (minimal)
  tests/database/ pgTAP tests (run with `pnpm db:test`)
```

## Rule: no table ships without RLS tests

Every table in `public` **must** have Row Level Security enabled **and** a pgTAP test
file proving it. This is enforced twice:

1. `scripts/check-rls-tests.sh` (run by `pnpm db:test` and CI) fails if a
   `create table public.<name>` in a migration has no
   `supabase/tests/database/<name>_rls.test.sql`.
2. `tests/database/rls_enabled.test.sql` fails if any table in `public` has RLS off.

### How to add an RLS test for a new table

1. Create the table in a new migration (`pnpm supabase migration new <name>`), and in the
   same migration `alter table ... enable row level security;`, revoke what `anon` /
   `authenticated` should not have, and add policies.
2. Copy `tests/database/profiles_rls.test.sql` to `tests/database/<table>_rls.test.sql`.
3. Keep the skeleton, replace the assertions:

   ```sql
   begin;
   create extension if not exists pgtap with schema extensions;
   select plan(<number of assertions>);

   -- fixtures as superuser (insert into auth.users fires the profile trigger)
   insert into auth.users (id, email) values ('<uuid-A>', 'a@example.test');

   -- act as anonymous
   set local role anon;
   select set_config('request.jwt.claims', '{"role":"anon"}', true);
   -- ... assertions ...

   -- act as a signed-in user
   set local role authenticated;
   select set_config('request.jwt.claims', '{"sub":"<uuid-A>","role":"authenticated"}', true);
   -- ... assertions ...

   reset role; -- back to superuser to inspect raw data
   select * from finish();
   rollback;
   ```

4. Cover, at minimum, for **every** policy: the allowed actor can do it, a different
   authenticated user cannot (reads return zero rows; writes affect zero rows or raise
   `42501`), and `anon` cannot. Use `throws_ok(sql, '42501')` when the privilege is
   revoked, `is_empty(...)` when RLS filters rows out.
5. Run `pnpm db:reset && pnpm db:test`.

Once membership-based permissions land in Phase 1, add a test per role (owner, manager,
member, non-member) for each table, not just owner vs. stranger.
