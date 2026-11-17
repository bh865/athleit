#!/usr/bin/env bash
# "No table ships without RLS tests."
# Every `create table public.<name>` in supabase/migrations must have a matching
# supabase/tests/database/<name>_rls.test.sql file. Runs as part of `pnpm db:test`.
set -euo pipefail
cd "$(dirname "$0")/.."

status=0
tables="$(grep -rhoiE 'create table( if not exists)? +(public\.)?"?[a-z0-9_]+' supabase/migrations 2>/dev/null \
  | sed -E 's/.*[ .]"?([a-z0-9_]+)$/\1/' | tr 'A-Z' 'a-z' | sort -u || true)"

for t in $tables; do
  if [[ ! -f "supabase/tests/database/${t}_rls.test.sql" ]]; then
    echo "✗ Table public.${t} has no RLS test: expected supabase/tests/database/${t}_rls.test.sql" >&2
    status=1
  else
    echo "✓ public.${t} has an RLS test"
  fi
done
exit $status
