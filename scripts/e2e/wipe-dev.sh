#!/usr/bin/env bash
# DEV PROJECT ONLY. Wipes all user/test data from the hosted "Athleit Dev" Supabase project (one transaction).
# Never point this at staging or production. It refuses unless the ref below is given AND --confirm is passed.
#   scripts/e2e/wipe-dev.sh qzvwoqnykpmvzdnetkmy --dry-run   # runs everything, then rolls back
#   scripts/e2e/wipe-dev.sh qzvwoqnykpmvzdnetkmy --confirm   # commits
# Storage objects are NOT touched here (use scripts/e2e/wipe-storage.mjs: the Storage API, not SQL).
set -euo pipefail
cd "$(dirname "$0")/../.."
ALLOWED_REF="qzvwoqnykpmvzdnetkmy"
REF="${1:-}"; MODE="${2:-}"
[[ "$REF" == "$ALLOWED_REF" ]] || { echo "refusing: project ref must be exactly $ALLOWED_REF" >&2; exit 2; }
[[ "$MODE" == "--confirm" || "$MODE" == "--dry-run" ]] || { echo "refusing: pass --confirm (commit) or --dry-run (rollback)" >&2; exit 2; }
LINKED="$(cat supabase/.temp/project-ref 2>/dev/null || true)"
[[ "$LINKED" == "$ALLOWED_REF" ]] || { echo "refusing: supabase CLI is linked to '${LINKED:-nothing}', not $ALLOWED_REF" >&2; exit 2; }
for f in apps/web/.env.local apps/mobile/.env.local; do
  if [[ -f "$f" ]] && grep -E '^[A-Z_]*SUPABASE_URL=' "$f" | grep -vq "$ALLOWED_REF"; then
    echo "refusing: $f points at a different Supabase project" >&2; exit 2
  fi
done
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
if [[ "$MODE" == "--confirm" ]]; then end="commit;"; else end="do \$\$ begin raise exception 'DRY RUN OK: everything verified, rolled back'; end \$\$;"; fi
sed "s/-- @END@/$end/" scripts/e2e/wipe-dev.sql > "$tmp"
pnpm --silent supabase db query --linked --yes -f "$tmp"
