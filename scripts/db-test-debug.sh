#!/usr/bin/env bash
# Show which assertions fail in one pgTAP file: each assertion's TAP line is captured into a
# temp table, then the "not ok" lines are raised. Always rolled back.
set -euo pipefail
cd "$(dirname "$0")/.."
f="supabase/tests/database/$1.test.sql"; tmp="$(mktemp)"
python3 - "$f" "$tmp" <<'PY'
import re, sys
src = open(sys.argv[1]).read().strip()
src = re.sub(r"select \* from finish\(\);\s*rollback;\s*$", "", src)
src = src.replace("select * from no_plan();", "select * from no_plan();\ncreate temp table tap_res (line text);\ngrant all on tap_res to public;", 1)
out = []
for ln in src.split("\n"):
    m = re.match(r"^select ((is|ok|isnt|is_empty|throws_ok|lives_ok|cmp_ok|results_eq)\(.*;)\s*$", ln)
    out.append(f"insert into pg_temp.tap_res select {m.group(1)}" if m else ln)
src = "\n".join(out) + """
reset role;
do $tap$ declare r text; begin
  select string_agg(line, ' || ') into r from pg_temp.tap_res where line like 'not ok%' or line like '%#%Failed%';
  raise exception E'FAILED %', coalesce(r, 'none'); end $tap$;
"""
open(sys.argv[2], "w").write(src)
PY
pnpm --silent supabase db query --remote --yes --file "$tmp" 2>&1 | grep -o 'FAILED.*\|ERROR:[^"]*' | head -3 | cut -c1-1500
rm -f "$tmp"
