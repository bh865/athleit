#!/usr/bin/env bash
# Run the pgTAP files in supabase/tests/database against the LINKED hosted project
# without Docker (`supabase test db` needs a container for pg_prove).
#
# Safety: each file runs in one transaction that ENDS WITH AN EXCEPTION, so nothing can
# ever commit (fixtures, the pgtap extension and test users are all rolled back). The
# pass/fail counters are read back out of the exception message.
# Prefer `pnpm db:test` on a local stack when you have Docker; CI does.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/check-rls-tests.sh

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
status=0

for f in supabase/tests/database/*.test.sql; do
  name="$(basename "$f" .test.sql)"
  python3 - "$f" "$tmp/$name.sql" <<'PY'
import re, sys
src = open(sys.argv[1]).read().strip()
src = re.sub(r"select \* from finish\(\);\s*rollback;\s*$", "", src)
src += """

reset role;
do $tap$
declare fin text;
begin
  select string_agg(x, ' | ') into fin from finish() x;
  raise exception E'SUMMARY ran=% failed=% finish=%',
    _get('curr_test'), coalesce(_get('failed'), 0), coalesce(fin, '(none)');
end $tap$;
"""
open(sys.argv[2], "w").write(src)
PY
  out="$(pnpm --silent supabase db query --remote --yes --file "$tmp/$name.sql" 2>&1 || true)"
  summary="$(grep -o 'SUMMARY ran=[0-9]* failed=[0-9]*[^"\\]*' <<<"$out" | head -1 || true)"
  if [[ -z "$summary" ]]; then
    echo "✗ $name: test errored before finishing"; grep -o 'ERROR:[^\\"]*' <<<"$out" | head -2; status=1
  elif [[ "$summary" == *"failed=0 "* ]]; then
    echo "✓ $name ($summary)"
  else
    echo "✗ $name ($summary)"; status=1
  fi
done
exit $status
