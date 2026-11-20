# Claude Code prompt: Implement Home round 2 (web and mobile)

Paste everything below the line into Claude Code, run from `~/Documents/Development/prs/athleit`.

---

Implement this design in this codebase:
@https://claude.ai/code/artifact/a63c1d24-9cd0-46a8-8fb0-8bc72851bebc

Read the design's files from that link. Match how it looks, using this codebase's own components and conventions.

Work on a new branch `feat/home-round-2`.

## 0. Read first, then post a short plan before changing anything

**The design** (artifact `a63c1d24-9cd0-46a8-8fb0-8bc72851bebc`, files under `project/`). The artifact is a canvas of mockups, not code to copy. Use it as the visual and behavioral spec. Read these completely:

- `HomeRound2.dc.html` (web board) and `HomeRound2Mobile.dc.html` (mobile board). They list every screen and which `screen` key renders it.
- `Home2WebView.dc.html` and `Home2MobileView.dc.html`. These hold the actual markup, sizes, spacing and states. Screens: `dirA` / `dirB` (web attention directions), `dirList` / `dirStack` (mobile attention directions), `scenA`, `scenB`, `scenBdirB`, `scenCLive`, `scenCFinal`, `scenD`, `tablet`, and the state screens `nextCancelled`, `nextUpdated`, `nextNoMap`, `nextPractice`, `nextNone`, `attnEmpty`, `attnLoading`, `attnError`.
- `Home2RulesView.dc.html`. Priority rule, time-pressure chip wording, dual-role merging, web gutter, visibility matrix, accessibility notes, data sources. **Known issue in that file:** the visibility matrix cells print as raw arrays like `['✓', '✓', …]`. Read each array in column order: Parent, Player 13+, Coach, Manager, Team admin, Club admin.
- `HomeRound2.dc.html` is the round-2 web board. `Home.dc.html`, `HomeMobile.dc.html` and `HomeRules.dc.html` are the **previous round** and are for comparison only. Do not implement them.

The design uses its own inline styles and Phosphor web fonts. Translate every value to this codebase's tokens (`packages/tokens`), components (`apps/web/src/components/ui`, `apps/mobile/src/components/ui`) and Phosphor icon wrappers. Never copy hex values or inline styles. Where the design shows something with no existing component or token, say so in the plan and build it from existing primitives as a documented variant (the design lists these under "New variants needed" in the rules view).

**The code.** Read these before planning:
- Web: `apps/web/src/components/home/home-dashboard.tsx`, `attention-strip.tsx`, `tiles.tsx`, `more-tiles.tsx`, `tile-shell.tsx`, `home.module.css`, `use-home-data.ts`, `apps/web/src/components/schedule/next-up-card.tsx`, the app shell and layout for the main content pane.
- Mobile: `apps/mobile/src/app/(app)/index.tsx`, `apps/mobile/src/components/home/*`, `apps/mobile/src/components/schedule/next-up-card.tsx`.
- Core: `buildAttentionItems`, `deriveAttention`, `AttentionItem` / `AttentionKind`, `homeTileIds`, `capabilitiesForPlace`, `payViewsFor`, `describeEventTime` and their tests.
- `docs/design-system.md`, `docs/design-system-additions.md`, `docs/permissions.md`, `docs/scheduling.md`.

The plan must list: files to delete, files to rewrite, new shared logic in `packages/core`, which design details have no existing component, and anything in the design that cannot be wired to data we already have. Proceed without waiting for approval unless you hit a real contradiction.

## 1. Scope

**Remove completely** (components, imports, tile ids in `homeTileIds`, tests, CSS and e2e selectors that only served them):
- This week / Upcoming (`WeekTile`)
- Messages card on web (`MessagesCard`)
- Latest announcement (`AnnouncementTile`)
- Notification health (`NotificationHealthTile`), from "For your team" on web and mobile
- Payouts status tile (`PayoutsTile`), from "For your team" on web and mobile
- Add to your calendar (`CalendarTile`)
- Your places (`PlacesTile` on web, the `YOUR PLACES` list on mobile). The place switcher in the chrome is the only way to change place.

The **payouts need action attention item stays** (it is rule 1 in the design's priority rule). Make sure its link lands on a working screen now that the tile is gone, and say where in the plan.

**Keep, in this order:** header, Needs your attention (redesigned), Next up (redesigned) with Team record, Amount due, "For your team" (Approvals, Waivers and compliance, Registrations, Payments collection, Roster snapshot, Setup checklist, Club overview card for club-only places), "For your family" (Amount due, Waivers, Registrations, My children, Roster snapshot), Documents. The `More` group label disappears when Documents is its only tile. Do not leave gaps where removed tiles were. An odd last tile in a group spans the full row so there is never a half-empty row.

Tile visibility keeps coming from `capabilitiesForPlace` and `payViewsFor`, never from the active place kind or a single role. Use the design's visibility matrix as a **check** on the existing logic. If the existing capability logic and the matrix disagree, keep the code's behavior, and list each difference in the PR. Do not loosen any privacy rule: parents see RSVP counts not names, limited roster only, payment names staff-only, waiver status only, no medical answers on Home, a parent with a team role but no child on the roster does not see the schedule.

## 2. Needs your attention

Implement **Direction B on both platforms**: on web, **Direction B, the lead item plus quiet list** (`dirB`, and `scenBdirB` for the dual-role case), and on mobile, **Direction B, the compact triage list** (`dirList`). Do not build Direction A (the triage card with the count ring on web, the snap stack on mobile). Note that the design's own recommendation was Direction A for web; the owner has overridden that, so follow Direction B. The scenario boards that show Direction A (`scenA`, `scenB`, `scenCLive`, `scenCFinal`, `scenD`, `tablet`) still apply for everything except the attention section, which should be rendered in Direction B. The component is shared in shape between web and mobile (same item model and ordering), with platform-specific rendering.

- Rows: icon circle, bold title, muted detail, a **time-pressure chip** with icon and text, and one trailing action that settles the item. Resolve in place where an action already exists: RSVP (`set_rsvp`), Approve / Decline for join requests, login claims and club link requests (reuse the functions behind `ApprovalsTile`). Anything that needs a full flow (pay, sign a waiver, enter a result, registration steps, setup, payouts) deep-links to the exact screen.
- Maximum 4 visible, then "+N more" opening the existing `Sheet` with all items.
- Dual roles: one merged list with a small place tag on each row ("U12 Falcons", "Household").
- States: loading skeleton, all-clear (the quiet check-circle line, per `attnEmpty`), error with retry (`attnError`). Hidden entirely only where the design hides it.
- **Priority rule and chip wording live in `packages/core`** as pure, unit-tested functions, exactly as written in `Home2RulesView` (blocking or overdue first, then time-boxed and close, then decisions others wait on, then everything else soonest first; ties to the oldest due date; the first item is the lead item). Chip text examples from the design: "Closes in 40 min", "Closes tonight", "Due in 3 days", "Game in 2 days", "Due Dec 1", "Overdue 5 days", "Expired Nov 15". Compute "now" from an injectable clock so tests are deterministic, and format in the viewer's time zone.
- Items come only from the existing attention kinds. If a kind lacks a due date or event time that the chip needs, add it to the item model from data that exists. Do not invent new queries or tables. If it truly cannot be derived, show the row without a chip and list it in the PR.

## 3. Next up (the game-day card)

Rewrite `NextUpHero` (web) and `NextUpCard` (mobile) to match the design (`scenA`, `scenB`, `scenCLive`, `scenCFinal`, and the state screens).

- **Web:** a wide map as roughly half of the card at 1280, with the glass place pill carrying the name and "Open in Maps". The pill falls back to a solid surface under reduce-transparency. Tablet 834 stacks Next up above Team record.
- **Mobile:** a 120px map strip at the top of the card with the place pill over it, the big time and countdown below, RSVP pills pinned at the bottom of the card. If the mobile app has no map component today, use the closest existing approach (a static map image if we already use one, otherwise the existing "open in maps" behavior) and say so in the plan. Do not add a new maps dependency without asking.
- **Time-aware headline:** large mono time with a live relative line ("in 2 days", "in 38 min"), switching to **Live now** (lime dot) between start and end, then **Final** with the score and an **Enter result** action for staff when no result is entered. Refresh the relative label on a timer without re-fetching. Spoken labels as in the design ("Game in 2 days, Saturday 10:00 AM", "Live now").
- Parents: per-child Going / Can't go pills and the quiet Maybe, announced as "Maya: Going". Staff: the proportional RSVP counts bar (Going / Can't go / Maybe / No reply, mono) and the Nudge and Set RSVP shortcuts. **Check whether a nudge and a staff-set-RSVP UI actually exist** (`docs/design-system-additions.md` says staff-set RSVPs are not built in the UI). Wire only what exists. For anything missing, leave the control out and list it in the PR. Do not build new backend for it.
- States from the design: cancelled (struck title, reason notice), updated (revision banner), practice (no opponent or result), no map (card re-balances), nothing scheduled (staff "Add an event", parents "Open schedule").
- Team record sits beside it on web and below it on mobile, with the design's polish.

## 4. Web gutter (affects the whole site)

The design sets the content pane to a 12-column grid with a 20px column gap, **40px left padding from the sidebar edge and 56px right padding**. Apply this in the shared app shell so every page benefits, not only Home. Then walk every web route for double padding, full-bleed elements that now clip, and tables or chat views that need the old width. Fix those in their own commits. Below 900px the sidebar already collapses, so keep the existing narrow-screen gutters.

## 5. Conventions

Follow the existing system: Phosphor icons through our wrappers, Manrope for UI, IBM Plex Mono for money, counts, scores and countdowns, light and dark from tokens, no hardcoded colors or sizes, lime only for the primary action and "now", glass only where the system already uses it (sheets, sidebar, toasts, and the new map pill). 44px minimum targets. Status never by color alone: every chip, segment and banner has an icon and text. Keyboard order on triage rows: title, chip, then actions left to right, "+N more" last. Web and mobile stay consistent in item model, copy and ordering. If a new component or variant is needed, add it to `packages/tokens` or the shared UI layer the way `docs/design-system.md` describes, and add it to `docs/design-system-additions.md`.

## 6. Verification

- `pnpm` typecheck, lint and unit tests pass. Update or delete tests for removed tiles and `homeTileIds`.
- New Vitest coverage for the attention priority rule (each tier, ties, dual role merge, max 4 plus overflow) and chip wording (under an hour, tonight, within a week, further out, overdue, expired), plus the Next up state machine (before, live, final, cancelled, updated) with an injected clock and time zones including DST.
- Playwright + Axe specs for: parent with two children resolving an RSVP from the attention row, staff approving a join request in place, all-clear state, Next up in each state, and the removed tiles being absent. Update the web visual baselines in `apps/web/visual/` and the mobile screenshots, light and dark.
- Compare your screenshots with the design boards for scenarios A, B, C and D (web, tablet 834 and mobile) and list every visible difference you chose to leave. The attention section in those boards is drawn in Direction A for most web scenarios, so compare that section against `dirB` / `scenBdirB` instead.
- Run the code review you would want before merging and fix what it finds.

## 7. Delivery

One commit per logical step. Open a PR with: summary, files removed, the design-to-component mapping, screenshots next to the design for the key scenarios, test results, and a **list of anything you were unsure about, deferred, or that disagrees with the design** (map on mobile, Nudge and Set RSVP, the payouts item link, any matrix differences, the gutter fallout). Do not claim something works unless you ran it.

## Decisions already made

1. Direction B on both platforms: web uses the lead item plus quiet list, mobile uses the compact list. Direction A is not built.
2. The removed tiles are gone for good, not hidden behind a flag.
3. The payouts attention item stays; the payouts tile does not.
4. The gutter change is site-wide.
5. The existing capability logic wins over the design's visibility matrix. Differences go in the PR.
