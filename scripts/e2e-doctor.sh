#!/usr/bin/env bash
# Environment check for the E2E pass. Prints names/versions only, never env values.
cd "$(dirname "$0")/.."
ok(){ printf '  ok    %s\n' "$1"; }; bad(){ printf '  MISSING %s\n' "$1"; }
chk(){ if command -v "$1" >/dev/null 2>&1; then ok "$1 $($1 ${2:---version} 2>&1 | head -1)"; else bad "$1"; fi; }
echo "Tooling"; chk node; chk pnpm; chk git; chk stripe; chk maestro; chk xcrun "--version"; chk adb "version"; chk psql
echo "Repo"; echo "  .nvmrc: $(cat .nvmrc 2>/dev/null)  packageManager: $(node -p "require('./package.json').packageManager" 2>/dev/null)"
[ -d node_modules ] && ok "dependencies installed" || bad "dependencies (pnpm install)"
echo "Supabase"; ref="$(cat supabase/.temp/project-ref 2>/dev/null)"; [ -n "$ref" ] && ok "linked to $ref" || bad "supabase link"
echo "Env files (names only)"
for f in apps/web/.env.local apps/mobile/.env.local; do
  if [ -f "$f" ]; then ok "$f: $(grep -E '^[A-Z_]+=' "$f" | cut -d= -f1 | tr '\n' ' ')"; else bad "$f"; fi
done
echo "Playwright browsers"; ls "$HOME/Library/Caches/ms-playwright" 2>/dev/null | tr '\n' ' ' || true; echo
echo "iOS simulators"; xcrun simctl list runtimes 2>/dev/null | grep -i ios | head -3; xcrun simctl list devices available 2>/dev/null | grep -i "iphone" | head -4
