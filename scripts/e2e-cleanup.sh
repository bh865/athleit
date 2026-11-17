#!/usr/bin/env bash
# Remove leftover Playwright users (e2e-*@example.test) and what they created from the LINKED project.
# Only needed when the e2e run had no E2E_SUPABASE_SERVICE_ROLE_KEY for its own teardown.
# Teams, clubs and households go first so the last-admin rule never blocks deleting a user.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --silent supabase db query --remote --yes "
with u as (select id from auth.users where email like 'e2e-%@example.test'),
 hh as (select household_id from public.household_members where profile_id in (select id from u)),
 t as (delete from public.teams where created_by in (select id from u) returning 1),
 c as (delete from public.clubs where created_by in (select id from u) returning 1),
 h as (delete from public.households where id in (select household_id from hh) returning 1),
 a as (delete from auth.users where id in (select id from u) returning 1)
select (select count(*) from t) teams, (select count(*) from c) clubs,
       (select count(*) from h) households, (select count(*) from a) users"
