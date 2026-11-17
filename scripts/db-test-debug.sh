#!/usr/bin/env bash
# Show which assertions fail in one pgTAP file (read from pgTAP's results table), rolled back.
set -euo pipefail
cd "$(dirname "$0")/.."
f="supabase/tests/database/$1.test.sql"; tmp="$(mktemp)"
python3 - "$f" "$tmp" <<'PY'
import re, sys
src = open(sys.argv[1]).read().strip()
src = re.sub(r"select \* from finish\(\);\s*rollback;\s*$", "", src)
src += """
reset role;
do $tap$
declare r text;
begin
  execute format('select string_agg(numb || '': '' || coalesce(descr,'''') || '' => '' || coalesce(reason,''''), '' || '') from %s where not ok', (select oid::regclass from pg_class where relname = '__tresults__' limit 1)) into r;
  raise exception E'FAILED %', coalesce(r, 'none');
end $tap$;
"""
open(sys.argv[2], "w").write(src)
PY
pnpm --silent supabase db query --remote --yes --file "$tmp" 2>&1 | grep -o 'FAILED.*' | head -3
rm -f "$tmp"
