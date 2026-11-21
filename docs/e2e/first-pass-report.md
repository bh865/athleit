# Athleit first end-to-end pass: report

Branch `test/e2e-first-pass` off `origin/buildout` @ 6fbdfe4. Hosted Dev project only; Stripe test mode only. **Read this first: iOS could not be built (Xcode 26.0, D-019). Android was set up and a first smoke path ran (see the Android section below); no other mobile paths were tested.** Payments, billing, registration, messaging realtime and the admin portal deep paths were not exercised beyond what the existing specs cover.

## Security note
No cross-user data exposure found. An outsider and a parent got nothing from a coach's team across 9 team pages, signed-in non-admins got not-found on 4 admin routes, and an outsider read 0 rows from 12 team tables and 8 global tables through the API (`persona-crawl.spec.ts`). One privacy-relevant repo gap (D-004): the migration that moved pin/archive state out of a table readable by other thread members was applied on Dev but missing from the repo; restored, needs your review.

## Base
`buildout` includes Phase 4 payments, Phase 5 registration/forms/waivers, split payments, team subscription/billing, admin portal, support center, roster/schedule/messages redesigns, and the shared PageHeader (verified by `page-headers.spec.ts`: one h1 header, no sideways scroll at 360/768/1280). The context switcher exists on web and mobile; not otherwise tested.

## Clean slate (see wipe-report.md)
Before: 24 users, 14 storage objects, 104 migrations, 13 cron jobs; Stripe 13 connected accounts, 11 customers, 7 products, 1 webhook. After the wipe: 0 users and identities, 0 rows in every wiped table, kept config tables unchanged (sport_configs 7, fee_config 1, platform_settings 8, definitions 8), 0 storage objects, 6 buckets, Stripe empty except the webhook endpoint (survived, secret unchanged). Billing price row restored from its migration seed (no Stripe price yet: created lazily at first checkout). You asked me to push the six support migrations: Dev now has 110 migrations and 15 cron jobs (+2), and platform_settings grew to 16 from the new migrations. Not verified: Step G's `supabase test db --linked` (needs Docker; used the rolled-back pgTAP harness instead, see D-017). You must sign up again as blakehayes865@gmail.com and kristin@athleit.com and re-create the platform owner (`docs/admin.md`).

## What was tested
- Web (production build, chromium, hosted Dev): full existing suite, final run 97 passed, 14 failed, 30 skipped, 18 not run (serial specs stop at the first failure). New: persona route crawl (visitor, new user, coach, parent: 0 server errors or console errors; 40 axe findings from one component, 2 missing h1, 1 never-idle page) and authorization negatives (all pass). Help pages and their axe checks pass.
- Database: pgTAP on Dev via the rolled-back harness: 120 files passed, 7 fail (D-017); 17 tables lack RLS test files (D-002).
- Advisors: 4 lints, none severe.

## Not tested, and why
Mobile (iOS build blocked, D-019; no Android SDK; Maestro installed but no flows run), push delivery, OAuth, real email links, Stripe payments (pay flow, declines, 3DS, refunds, split payments in a live Stripe run), Connect onboarding, billing checkout/portal, registration capacity/waitlist runs, messaging youth-safety and realtime beyond the existing spec, notifications by category, documents upload, account deletion, admin portal as an admin (owner row wiped), support center contact/requests (D-009), dynamic type, reduce motion, keyboard-only sweep, cross-platform. See `path-inventory.md` for per-path status.

## Defects (docs/defects.md has detail)
Fixed: D-001 production build broken (blocker), D-004 missing migration file (blocker, needs review), D-007 axe role on the human check, D-018 iOS pod install, D-003/D-006/D-008 stale or date-dependent tests, D-005 support migrations pushed on your instruction.
Open or blocked: D-002, D-010 (scheduling series test hangs, 10 tests unrun), D-012 (suspected stale roster after remove), D-013, D-014, D-016, D-017, D-019 (mobile build), D-020, D-021.
Needs a decision: D-009 deploy support Edge Functions (could send email; 2 new cron jobs call functions), D-011 cancelled-request card, D-015 account chip label (WCAG 2.5.3 on 40 pages).

## Migrations / approvals
No migration of mine is unpushed except the restored `20260416000500_thread_user_state.sql`, which must NOT be pushed (version already recorded on Dev). Billing webhook events (`checkout.session.completed`, `invoice.*`, `customer.subscription.*`) are missing from the existing Stripe endpoint and `STRIPE_WEBHOOK_SECRET` handling needs your call before billing can be tested.

## Left behind on Dev
2 `e2e-*@example.test` users, 2 teams, 6 forms and 2 storage objects that the database protects (immutable registration data); `scripts/e2e-cleanup.sh` cannot remove them. Nothing emailed anyone: no email was triggered by tests (confirmation is off on Dev).

## Flaky / unstable
Several serial specs time out at 1.5 m (scheduling series, waiver publish, clubs, messaging prefs, place autocomplete); `team-details` passed alone and failed once under load. Not papered over, not root-caused.

## Rerun commands
See the README section "First-pass E2E". Web: `cd apps/web && pnpm build && npx playwright test --project=chromium`; new spec: `e2e/persona-crawl.spec.ts`; cleanup: `bash scripts/e2e-cleanup.sh`; doctor: `scripts/e2e-doctor.sh`. CI: web build runs in CI, the Playwright job is optional and skipped without test-project secrets, so none of this gates merges.

## Beta readiness (honest)
Not ready to call. Strengths: sign-up/sign-in, team and roster basics, RSVP and live counts, Help site and the authorization model held up under direct probing; no leaks found. Gaps: the branch's production build was broken on arrival; the support center cannot work on Dev until the Edge Functions are deployed; about 14 e2e specs are stale or unstable so the suite is not a reliable gate; mobile is entirely unverified here; and the money paths (pay flow, refunds, split payments, billing) were not run this pass. I would not release a beta on this evidence alone: next steps are an Xcode update to unblock mobile, a rewrite of the drifted specs, then a payments and billing pass in Stripe test mode.

## Android emulator (added 2026-11-21)
Set up on this Mac with Homebrew (`android-commandlinetools`, `openjdk@17`) and `sdkmanager` (platform-tools, emulator, android-36, build-tools 36.0.0, Google APIs arm64 system image). AVD `athleit_e2e` (Pixel 8, Android 16). `JAVA_HOME=/opt/homebrew/opt/openjdk@17`, `ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`. The dev client built with `expo run:android --no-bundler` (about 5 minutes, BUILD SUCCESSFUL), installed, and connected to Metro through `adb reverse tcp:8081 tcp:8081`. The app points at the hosted Dev project with a Stripe test key.

Run on Android, as run id `e2e-1795270860` (user `e2e-1795270860-mobile@example.test`):
- Welcome screen, "Continue with email", Create account form with the live password-strength meter: pass.
- Sign-up against Dev: pass, lands on "What brings you here?" onboarding, then the More tab and Account screens render with the right name and email.
- Help and support: hub renders; articles unavailable (D-023). Contact support form: submitted with diagnostics on and no image; the deployed `submit-support-request` function answered with reference SUP-001005 and the confirmation screen. A signed-in request queues no email (the email drain only serves signed-out requesters).
- Not run on Android: View your request thread, image attach, offline states, push, Stripe payment sheet, joining or creating a team, the parent and coach flows, Maestro flows (D-022).
- iOS: still blocked. A newer Xcode is the fix; `softwareupdate` offers none and the Xcode install is yours to do.

Leftovers from this run on Dev: user `e2e-1795270860-mobile@example.test` and support request SUP-001005.
