#!/usr/bin/env bash
# Remove leftover Playwright users (e2e-*@example.test) and what they created from the LINKED project.
# Only needed when the e2e run had no E2E_SUPABASE_SERVICE_ROLE_KEY for its own teardown.
# Teams, clubs and households go first so the last-admin rule never blocks deleting a user.
#
# Phase 5 data is immutable BY DESIGN (published form and waiver versions, waiver acceptances, registrations use
# restrict foreign keys), so a team that ran the registration e2e cannot be deleted. Each delete is attempted on its
# own and skipped when the database protects it; the script reports what remains. Nothing is forced or disabled.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --silent supabase db query --remote --yes "
do \$\$
declare r record; v_t int := 0; v_c int := 0; v_h int := 0; v_u int := 0; v_kept int := 0;
begin
  for r in select id from public.teams where created_by in (select id from auth.users where email like 'e2e-%@example.test') loop
    begin delete from public.teams where id = r.id; v_t := v_t + 1;
    exception when others then v_kept := v_kept + 1; end;
  end loop;
  for r in select id from public.clubs where created_by in (select id from auth.users where email like 'e2e-%@example.test') loop
    begin delete from public.clubs where id = r.id; v_c := v_c + 1; exception when others then v_kept := v_kept + 1; end;
  end loop;
  for r in select distinct household_id id from public.household_members where profile_id in (select id from auth.users where email like 'e2e-%@example.test') loop
    begin delete from public.households where id = r.id; v_h := v_h + 1; exception when others then v_kept := v_kept + 1; end;
  end loop;
  for r in select id from auth.users where email like 'e2e-%@example.test' loop
    begin delete from auth.users where id = r.id; v_u := v_u + 1; exception when others then v_kept := v_kept + 1; end;
  end loop;
  raise notice 'deleted teams=% clubs=% households=% users=%; kept (protected) rows=%', v_t, v_c, v_h, v_u, v_kept;
end \$\$;
select count(*) as e2e_users_remaining from auth.users where email like 'e2e-%@example.test';"
