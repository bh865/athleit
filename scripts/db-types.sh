#!/usr/bin/env bash
# Regenerate packages/db/src/database.types.ts from the *local* Supabase stack.
# Writes to a temp file first so a failed run never truncates the committed types.
set -euo pipefail
cd "$(dirname "$0")/.."
out="packages/db/src/database.types.ts"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
pnpm exec supabase gen types typescript > "$tmp"
mv "$tmp" "$out"
pnpm exec prettier --write "$out" > /dev/null
echo "Wrote $out"
