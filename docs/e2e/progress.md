# E2E first pass: progress log

Base: `origin/buildout` @ 6fbdfe4, worktree `../athleit-e2e`, branch `test/e2e-first-pass`. Resume from here after a context reset.

## Done
- Wave -1: guards, BEFORE snapshot, Stripe reset (user), DB wipe, storage wipe, billing price row restored. See `wipe-report.md`.
- Wave 0 (partial): `scripts/e2e-doctor.sh`; deps installed; env + supabase link copied from main checkout (untracked); `next build` fixed (D-001).
- Wave 1: `path-inventory.md` first version.
## Running / next
- Full Playwright suite against the production build (`apps/web`, `npx playwright test --project=chromium`, port 3100); iOS runtime download (`xcodebuild -downloadPlatform iOS`); Maestro install (brew).
- Then: persona seed script, route crawl + axe spec, authorization negatives, mobile pass.
## Restart commands
- Web (prod): `cd apps/web && pnpm build && pnpm start --port 3100`; tests: `npx playwright test --project=chromium`
- Cleanup of e2e users (no service key): `bash scripts/e2e-cleanup.sh`
- pgTAP on Dev (rolled back): `pnpm db:test`
## Open defects
See `defects.md` (D-002 open).
