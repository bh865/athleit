# Claude Code prompt: implement the new Home / dashboard (web + mobile)

Run from the repo root after the Claude Design mockups exist. Fill in the two `<<...>>` placeholders first.

---

## PROMPT

Implement the redesigned **Home** for Athleit on **web and mobile together** (vertical slice, per the README conventions). The approved mockups are at `<<PATH OR URL TO CLAUDE DESIGN EXPORT>>`; the design brief they were made from is `docs/design-prompts/home-dashboard-claude-design-prompt.md` (tile inventory, personas, privacy rules, capability matrix). Where the mockups and the brief disagree, the mockups win on visuals and the brief wins on who may see what. Work on a branch cut from `dev`, e.g. `feat/home-dashboard`. Use plan mode first and show me the plan before editing.

### Read first
- `README.md` (conventions 1 to 5), `docs/permissions.md`, `docs/design-system.md`, `docs/design-system-additions.md`, `docs/context-switcher-proposal.md`, `docs/scheduling.md`, `docs/notifications.md`, `docs/registration.md`, `docs/payments.md`, `supabase/README.md`.
- Existing Home: `apps/web/src/components/home/home-dashboard.tsx` (+ `home.module.css`), `apps/web/src/app/(app)/page.tsx`, `apps/mobile/src/app/(app)/index.tsx`.
- Reusable pieces: `components/payments/home-cards.tsx` (`DueCard`, `StaffPaymentsCard`), `components/schedule/next-up-card.tsx`, `rsvp-controls.tsx`, `registration/compliance-tracker.tsx`, `registration/my-registrations.tsx`, messages `thread-list`, mobile equivalents under `apps/mobile/src/components/**`.
- Capabilities: `packages/core/src/capabilities.ts`, `context.ts`, `pay-views.ts` (`capabilitiesForPlace`, `payViewsFor`, `teamForScreen`). Data layer: `packages/db/src/{api,scheduling-api,payments-api,registration-api}.ts`.

### Architecture
1. **Tile registry, shared logic.** Put the tile definitions in `packages/core` (or `packages/ui-core` if it's UI-only): an id, a title, a priority, and a `visible(ctx)` predicate built from `capabilitiesForPlace` (never `active.kind` or a single role). Both platforms render from the same registry so web and mobile cannot drift. Add a unit test per persona in the brief (parent, two-team parent, parent not yet placed, player 13+, coach, manager, admin + parent, club admin, no place) asserting exactly which tiles show. Follow the pattern in `context.test.ts`.
2. **Tiles are small, isolated components** that load their own data with `useLoad`, show the four states (skeleton, empty, populated, retryable error) via the existing `states` components, and **hide** when there is nothing to say (except the deliberate empty states in the brief). One tile failing must never blank the page.
3. **Attention strip** is derived, not stored: compute from the same queries the tiles use (RSVP missing on next event, payment due, expired/missing waiver, pending approvals, started game without a result, registrations to decide). Cap at 4 items with the priority order from the brief. Avoid duplicate requests by sharing queries through one hook per page (web `useLoad`, mobile equivalent) rather than each tile refetching.
4. **Data.** Reuse existing functions wherever the brief's inventory lists one. Only add backend where a tile truly needs it, and keep each addition minimal:
   - Prefer composing existing RPCs on the client.
   - If a new `SECURITY DEFINER` function or view is unavoidable (for example recent schedule changes, or a single attention summary), add a timestamped migration under `supabase/migrations/`, follow the permission helper pattern (`private.*`, pinned `search_path`, audited where relevant), add a pgTAP test file for every new table/function (CI fails otherwise), update `docs/permissions.md` and the functions list, run `pnpm db:types` (or `db:types:remote`), and **never edit a pushed migration**.
   - Do not weaken any privacy rule in the brief section 5. Add a pgTAP test that a parent and a player cannot read RSVP names, other families' payments, or full-roster fields through any new function.
5. **Design tokens only.** No hex/rgb literals, raw px/rem/radius/spacing/font values, direct Phosphor or blur imports. If a tile needs a new variant or icon, follow "Add a component" / "Add an icon" in `docs/design-system.md` (ui-core name, `components.ts` knob, contract entry, both platforms, both galleries). Use `design-exception` comments only with a real reason.
6. **Both platforms.** Web: CSS Modules on token variables. Mobile: `useTheme()` and token objects, expo-router. Use the tile order and layouts from the mockups (web grid, mobile single column with horizontal attention chips). Keep mobile's pending-invite resume logic in `index.tsx` intact.
7. **Navigation and deep links.** Every tile action links to the existing screen (`/schedule`, `/events/[id]`, `/pay`, `/registrations`, `/messages/[id]`, `/roster`, `/teams/[id]/requests`, `/family`, `/clubs/[id]`, etc.). Do not add new routes unless the mockups require them, and say so in the plan if they do.
8. **Realtime and freshness.** Reuse existing subscriptions (notifications, thread, rsvps/events) where a tile benefits; otherwise refetch on focus (mobile) and on visibility change (web). No polling loops.
9. **Accessibility.** Status is never colour alone; 44px targets; RSVP announced as "Maya: Going"; respects Reduce transparency; headings and landmarks correct on web; labels on mobile.

### Tests and verification (all required before you call it done)
- `pnpm lint && pnpm typecheck && pnpm test` clean.
- Unit tests for the tile registry per persona and for any new `packages/core` helpers.
- pgTAP for every new function/table (`pnpm db:test`; the RLS-test guard must pass).
- Update or add Playwright e2e in `apps/web/e2e` for: parent RSVP from Home, parent sees amount due, coach sees RSVP counts and pending join requests, a dual-role admin sees both sets, a player sees no staff tiles. Use the existing `e2e-*@example.test` pattern.
- Add the new tiles to **both design galleries** (`apps/web/src/app/dev/design/`, `apps/mobile/src/app/design.tsx`) in light and dark, then `pnpm --filter @athleit/web visual:update` and review every changed image against the mockups.
- Walk `docs/mobile-manual-tests.md` and add a Home section for the new tiles.
- Start the web app and the dev design gallery, load each persona (seed data or e2e fixtures), and compare against the mockups at 1280, 834 and 390 widths in light and dark. Report any visual deviation rather than hiding it.

### Constraints
- Do not change auth, RLS policies for existing tables, Stripe/webhook logic, or any pushed migration.
- Do not invent product features (no attendance stats, player stats, weather, lineups). If a mockup shows something without data behind it, stop and list it as a question instead of faking it.
- Commit in small logical steps (registry + tests, then each tile family, then galleries/visual baselines, then docs). Do not push or open a PR until I say so.

### Deliverable
A branch with the working Home on web and mobile, a short summary of what was built per tile, anything deferred or deviating from the mockups, any backend additions (with tests), and updated docs (`docs/permissions.md`, `docs/design-system-additions.md`).
