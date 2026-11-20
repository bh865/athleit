# Claude Code prompt: Schedule page / screen and its features (web and mobile)

Paste into Claude Code at the repo root. Read first, plan, then build. Proceed without waiting for approval unless you hit a real contradiction.

Implement this design in this codebase:
@https://claude.ai/code/artifact/<PASTE THE SCHEDULE DESIGN LINK HERE>

Read the design's files from that link. Match how it looks, using this codebase's own components and conventions.

> **Before pasting:** the earlier design file (`a63c1d24-9cd0-46a8-8fb0-8bc72851bebc`) did not contain any Schedule boards when this prompt was written (it held Home, Family, Roster, Team, Pay and others). Replace the link above with the file that holds the Schedule boards. If it is the same file, keep the old link. The behavior spec below stands on its own either way, and `athleit-schedule-claude-design-prompt.md` is the written brief the boards were made from.

## Design source

The design file is one Claude Design artifact that may hold many screens. **Only the Schedule files apply here.** Ignore Home, Family, Roster, Team, Pay, Account, Documents, Waivers, Registrations and the rest.

Start by listing the file and finding the Schedule boards (names will look like `Schedule*.dc.html`, plus `*View.dc.html` files holding the real markup and screen ids, and a rules or rationale view). Put the resulting map in your plan: web canvas and view, mobile canvas and view, rules view, and the list of screen ids per platform. If a scenario below has no board, say so in the plan instead of inventing one.

Scenarios the boards are meant to cover (web 1280 and 834, mobile 390):
- **A** parent, two children on two teams, busy week (Agenda, RSVP chips, inline quick actions, filter chips, a Needs reply row, a cancelled event, a game that is Live now; dark too)
- **B** coach team week (Week grid with counts on blocks, a series, New event, the drawer with the staff RSVP list, status filter and Set RSVP; dark on web)
- **C** Month with a picked day, parent and coach
- **D** event detail states: before (countdown), live, final with result, cancelled, updated, practice, virtual, series, no map, two children RSVP, staff
- **E** Past and results (record header, results list, empty past)
- **F** flows: New event (game and practice), repeat preview and cap error, Edit with scope picker, Cancel, Result by sport (soccer score, volleyball sets), Places, Opponents, Calendar link (before, shown once, active)
- **G** states: loading, error with retry, empty week (staff and parent), no results after filtering, club place ("Open a team"), failed RSVP with Retry
- **H** tablet 834: Week and drawer as overlay
- **I** the mobile equivalents of A, C, D, E, F, G

Treat the board markup as the visual reference for layout, spacing, copy and states, not as code to paste. Use our components, tokens and conventions. Where a board value is hardcoded, map it to the nearest token. **If the boards and this prompt disagree, say which you followed and why in the PR.** If a board's visibility matrix renders badly (as the Roster rules board did), use the matrix in section 2 below.

## 0. Read first, then write a plan

Read before planning:
- Web: `apps/web/src/app/(app)/schedule/page.tsx`, `apps/web/src/app/(app)/events/[id]`, and everything in `apps/web/src/components/schedule/`: `schedule-view.tsx`, `event-row.tsx`, `month-grid.tsx`, `event-detail.tsx`, `event-form.tsx`, `rsvp-controls.tsx`, `scope-picker.tsx`, `cancel-sheet.tsx`, `result-sheet.tsx`, `places-manager.tsx`, `opponents-manager.tsx`, `calendar-feed.tsx`, `next-up-card.tsx`, `items.ts`, `use-viewer-zone.ts`, `schedule.module.css`. Also the places that embed the schedule (team page) and `apps/web/src/app/dev/design/schedule-gallery.tsx`.
- Mobile: `apps/mobile/src/app/(app)/schedule.tsx`, `apps/mobile/src/app/(app)/events/[id].tsx`, and everything in `apps/mobile/src/components/schedule/`: `event-card.tsx`, `event-form.tsx`, `event-actions.tsx`, `rsvp-actions.tsx`, `calendar-feed.tsx`, `map-embed.tsx`, `next-up-card.tsx`, `items.ts`.
- Core and db: `packages/core/src/capabilities.ts` (`schedule.view|manage|rsvpNames|rsvpOwn`), `next-up-state.ts` (the live, countdown and final state machine the Home card uses; reuse it), the scheduling helpers and sport configs, the calendar feed and ICS code, and `packages/db/src/scheduling-api.ts` (confirm which wrappers exist: `staff_set_rsvp` is in the database and may already have a wrapper, check before writing one).
- Database: `supabase/migrations/20260105000000` to `20260105001200` (reference tables, events and series, RSVPs, event, RSVP and range functions, notifications, calendar feed), `20260401000100_event_virtual_url.sql`, the reminder function and its pgTAP test (`fn_send_rsvp_reminders`), and `supabase/tests/database/fn_*schedule*`, `fn_set_rsvp`, `fn_staff_set_rsvp`, `fn_update_event`, `fn_cancel_event`, `rsvps_rls`.
- Docs: `docs/scheduling.md`, `docs/permissions.md`, `docs/design-system.md`, `docs/design-system-additions.md`, `docs/design-audit.md`.
- Tests: `apps/web/e2e/scheduling.spec.ts`, `apps/web/e2e/visual-app.spec.ts`, `apps/web/visual/`.

The plan must list: files to delete, files to rewrite, new shared logic in `packages/core`, the **three backend additions in section 3** (with the exact function and table shapes you will write), which design details have no existing component, anything in the design that cannot be wired to data we have, and the order of work (section 7).

## 1. Scope

Rewrite the Schedule page (web) and Schedule screen (mobile) and every feature around it so both match the design: views, filters, rows, event detail, and the flows (new and edit, cancel, result, places, opponents, calendar link). **Build the new features too**, as defined in section 3.

**Web views:** `Agenda | Week | Month` with range navigation and Today. Agenda is the default for parents and players, Week the default for staff. Agenda has an **Upcoming | Past** toggle. Week is a real time grid. Month shows counts or dots per day with the picked day in a side panel.

**Mobile views:** `Agenda | Month`, a horizontal week strip above the agenda, a Today jump, Upcoming | Past, infinite scroll in the upcoming direction, and a filter sheet. No week grid on mobile.

**Header:** "Schedule" with the team or family name, the staff-only lime **New event** (the page's only lime action), and a quiet **More** menu holding **Places**, **Opponents** (staff) and **Calendar link** (everyone), each with its one-line explanation. The three ghost buttons go away.

**Mobile gains:** Edit event, Places, Opponents (new flows, built from the web logic), and series scope on edit.

**Keep untouched:** the Home Next up card, the team page's embedded schedule (it must keep working with the rewritten component), notification deep links to `/events/<id>`, the calendar feed content, the sidebar and More entries, and the rule that a club place shows only "Open a team to see its schedule".

**Not on this page:** payments, fees, balances, waivers, registrations, roster details, messages. No invented metrics (no attendance percentages, weather, lineups, travel time).

## 2. Who sees what

Visibility keeps coming from `capabilitiesForPlace` and the existing capabilities. Use this matrix as a **check**; if it disagrees with the code, keep the code's behavior and list each difference in the PR.

| Feature | Staff | Parent / guardian | Player 13+ | Club admin |
|---|---|---|---|---|
| Agenda, Week, Month, Past | ✓ | ✓ (household) | ✓ | ✓ (read each linked team) |
| Filters: type | ✓ | ✓ | ✓ | ✓ |
| Filters: child, team, Needs reply | – | ✓ | – | – |
| Per-child RSVP chip on rows | – | ✓ own children | ✓ own | – |
| Inline Going / Can't go on rows | – | ✓ own children | ✓ own | – |
| Counts bar (Going, Can't go, Maybe, No reply) | ✓ | ✓ on detail only | ✓ on detail only | ✓ |
| Names list and notes | ✓ | – | – | – |
| Set RSVP for a player | ✓ | – | – | – |
| Nudge non-responders | ✓ | – | – | – |
| New, Edit, Cancel, Result, Delete | ✓ | – | – | – |
| Places, Opponents | ✓ | – | – | – |
| Calendar link | ✓ | ✓ | ✓ | ✓ |
| Updated chip and revision notice | ✓ | ✓ | ✓ | ✓ |

Privacy is unchanged and database-enforced: parents, players and club admins see RSVP **counts only**, names are staff-only, a parent sets RSVPs only for their own children (under 13: guardian only; 13+: their own login), RSVPs exist only for active rostered players, a parent with a team role but no child on the roster sees nothing, club admins never edit. Notifications and the calendar feed never contain a child's name. No medical data. **Do not loosen anything, and do not add any client read that bypasses these functions.**

## 3. New features and backend (the only backend work)

Everything else wires to existing reads and writes. These three are new. Write each as a migration with pgTAP tests in the existing style (`supabase/tests/database/`), RLS on, SECURITY DEFINER only where the existing functions already are, `search_path` pinned, and a test for every role in the matrix (staff, guardian, 13+ player, club admin, a stranger).

**3a. "Updated" per viewer.** Today the "Updated" banner only shows if the event changed while you had it open. Add a per-person seen marker:
- Table `event_seen(event_id, user_id, revision, seen_at)`, primary key `(event_id, user_id)`, RLS so a person reads and writes **only their own rows**.
- Function `mark_event_seen(event_id)`: upserts the caller's seen revision to the event's current revision. The caller must be allowed to see the event; otherwise raise the same error `get_event` raises.
- `team_schedule`, `team_schedule_range`, `household_schedule`, `household_schedule_range` and `get_event` additionally return the viewer's `seen_revision` (null when never seen). A row shows the quiet **Updated** chip when `revision > 1` and `revision > coalesce(seen_revision, 0)`. Opening the event detail calls `mark_event_seen` once.
- Do not change the existing return columns' meaning; append new ones, and update the generated types.

**3b. Previous time in the revision notice.** Today the notice can only say "the time or place changed".
- When `update_event` changes the start, end or place, record the **previous values** on the event (a nullable `last_change` jsonb or equivalent columns, written in the same function, holding the kind of change, the previous `starts_at` and `ends_at`, the previous place label, and the change time). A later edit that changes time or place replaces it; title and notes edits leave it alone. Series edits with a scope write it on every affected occurrence.
- `get_event` returns it. The detail shows "Time moved from 9:00 to 10:00" or "Place changed from Field 3 to Field 5" in the event's zone, falling back to "The time or place changed" when it is absent (older events). Only show it while the viewer's `revision > seen_revision` or the event has not yet started, whichever is shorter; do not show a stale change forever. State your rule in the plan.
- It must not contain any child's name, and it is not added to the calendar feed.

**3c. Nudge non-responders.** A staff action on the event detail (and the counts bar menu) that sends an ad-hoc RSVP reminder.
- Function `nudge_rsvp_non_responders(event_id)`: staff of the event's team only (same check as `staff_set_rsvp`), event not cancelled and not finished, returns the number of people notified. It must **reuse the existing reminder path** (read `send_rsvp_reminders`, its notification type, its copy and its delivery) rather than inventing a second one, targets only guardians and 13+ players of active players with **no reply**, and respects each recipient's existing notification preferences.
- **Rate limit** so it cannot be spammed: one nudge per event per 6 hours, enforced in the database (a `last_nudged_at` on the event or a small log table) with a friendly error the UI maps to "Already reminded recently. Try again later."
- The notification text never includes a child's name or the other children's replies, only the event title, time and a deep link to `/events/<id>`, like the automatic reminders.
- UI: a **Nudge** button on the staff RSVP section, disabled with the reason when nothing is pending, when the event is over, or when rate limited, with a confirm line ("Remind 5 families who haven't replied?") and a result toast ("Reminded 5 families"). The count shown before confirming comes from the existing summary, not a new read of names.

If any of the three turns out to need a design decision that contradicts the existing rules, stop and say so in the plan.

## 4. Data wiring and shared logic

- **Lists:** `team_schedule_range` (at most 100 days) for teams and `household_schedule_range` for households, one request per visible range (agenda window, week, month), cached per range, reloaded after any write. The agenda's upcoming direction pages by ranges of at most 100 days. **Past** uses the same range functions backwards, and the **record header** comes from `team_record` (team places only; a household's Past has no record).
- **Row model:** parents get one RSVP chip per child from the household rows; staff get the counts bar from the RSVP counts that already come with team rows, now **including Maybe**; 13+ players get their own chip; club admins get counts only. Priority when several states apply: **Live now, then Cancelled, then Needs reply, then Updated**; Series and type are always shown as quiet icons. Status is never conveyed by colour alone.
- **Inline quick actions on rows:** call the same RSVP action as the detail (`set_rsvp`), optimistic with Retry on failure, announced as "Maya: Going". Hidden for cancelled and finished events.
- **Staff RSVP:** `event_rsvp_detail` for the names list (staff only), with status filter and search; **Set RSVP** per player through `staff_set_rsvp`, marked "set by staff". Add the db wrapper only if it does not already exist.
- **Detail:** `get_event`; time-aware state from `packages/core/src/next-up-state.ts` (countdown, **Live now**, **Final** with the result, Ended), reused so Home and Schedule can never disagree; map plus **Open in Maps** (`mapsUrl`); **Join meeting** for virtual; "Arrive 9:30, 30 minutes early"; series indicator from `series_id`; result line with period scores.
- **Delete** is offered only when allowed. When RSVPs or a result exist, show "Cancel instead" with the reason (the database refuses; map its error).
- **Calendar link:** unchanged behavior (create, shown once with Copy, reset, turn off) with the explanation, states and add-to-calendar guidance as drawn.
- **Flows:** New and Edit event in sections (Basics, When, Where, Game details for games only, Arrive early and Notes, Repeat) on web as a right sheet (a full dialog at 834) and on mobile as a bottom sheet. **Repeat preview line** ("Creates 12 practices, Nov 18 to Feb 3") computed in `packages/core`, with the cap (52 occurrences and 366 days) enforced **before** save, DST-safe, using the same recurrence expansion the database uses. Scope picker for series edit and cancel (This event, This and following, All) with plain-language effects; "Families will be notified" when time, place or arrive-early change (title and notes edits are silent). Cancel needs a reason families will see. Result is shaped by the sport config with live validation (no ties where the sport disallows them, sets add up) and **Clear result**. Places and Opponents managers on both platforms, with the "in use" explanation on delete.
- **Filters:** type (Game, Practice, Event), child, team, Needs reply, as removable chips with a clear "no results" state. Filter state lives in the URL on web and local state on mobile.
- **Shared logic in `packages/core`, unit-tested with an injected clock (including DST days and a second time zone):** day grouping and sticky headings ("Today", "Tomorrow", dates); week and month range maths; week-grid block layout (position, height, overlap columns); filters; needs-reply; row state priority; counts bar proportions including Maybe; countdown and live state (reusing `next-up-state`); the repeat preview and cap; the revision-notice text (3b); the nudge eligibility and its messages (3c); the time-range display with the viewer's zone only when it differs.

## 5. Page, web and mobile

Match the design boards; use existing components first.

- **Agenda rows:** the date block anchor, time range, title, type icon and chip, place, "vs. Hawks · Home" for games with the result chip, then the state that matters (RSVP chips and quick actions, counts bar, Cancelled with reason struck through, Updated, Series, Live now with a lime dot, Final). The team name only when the household has more than one team.
- **Week grid (web):** seven columns, a time axis, blocks positioned and sized by start and end, type by icon plus colour, cancelled struck through, an untimed lane when needed, today in lime, a compact RSVP summary on each block for staff, overlapping events sharing the column. At 834, use the layout the board shows (say which in the PR).
- **Month:** type dots or short chips with counts, today in lime, the picked day in a side panel on web and beneath or in a sheet on mobile; "+N more" opens the day.
- **Detail:** the same content in the 400px drawer, the full page `/events/<id>` (wide layout) and the mobile screen. Closing the drawer returns focus to the opening row. Realtime keeps counts and the Updated notice live as today.
- **States:** loading skeletons, error with retry, empty week for staff ("New event" prompt) and for parents (warm, no action), no results after filters, the club place message, offline or failed RSVP with Retry, long titles and place names truncating cleanly.
- If a design detail has no existing component (week grid block, counts bar, RSVP chip, quick-action row, scope picker styling, repeat preview, filter chips), build it from existing primitives. If it truly needs a new variant, add it to `packages/tokens` or the shared UI layer as `docs/design-system.md` describes and list it in `docs/design-system-additions.md`. Update `apps/web/src/app/dev/design/schedule-gallery.tsx` to show the new components.

## 6. Conventions

Phosphor icons through our wrappers, Manrope for UI, IBM Plex Mono for counts, scores, times and countdowns, light and dark from tokens, no hardcoded colors or sizes, **lime only for the primary action and "now"**, glass only where the system already uses it, solid fallbacks under reduce-transparency. 44px minimum targets. Status never by colour alone. RSVP chips announced as "Maya: Going"; countdowns and live state announced in words; live-region updates for RSVP and Realtime changes. Keyboard: the week grid and agenda are navigable by arrow keys, focus returns to the opening row. Web and mobile stay consistent in copy, ordering and states. Reuse `friendlyError`, `LoadState`, `FormMessage`, `Badge`, `Avatar`, `Sheet`, and keep time-zone handling in the shared helpers.

## 7. Order of work, and verification

Build in this order, one commit per logical step: (1) migrations 3a, 3b and 3c with pgTAP tests, regenerated types and db wrappers; (2) shared logic in `packages/core` with unit tests; (3) web Agenda, rows, filters and Past; (4) web Week and Month; (5) web detail, staff RSVP and Nudge; (6) web flows (new and edit, cancel, result, places, opponents, calendar link, More menu); (7) mobile Agenda, Month, filters and detail; (8) mobile flows including Edit, Places and Opponents; (9) docs, tests and baselines.

- `pnpm` typecheck, lint and unit tests pass; **the full pgTAP suite passes**, including the new tests for every role; existing `fn_*` schedule tests still pass untouched.
- Vitest coverage for every shared function above, including DST, a second time zone, the repeat cap, week-grid overlap, row priority, Maybe in the counts, the revision-notice rule and nudge eligibility.
- Playwright + Axe, web (update `apps/web/e2e/scheduling.spec.ts` and keep the test ids `new-event`, `event-row`, `event-drawer`, `rsvp-controls`, `rsvp-counts`, `rsvp-list`, `edit-event`, `cancel-event`, `enter-result`, `confirm-cancel` working, or update every use): a parent sees chips and replies from the row; Needs reply and child filters; Maybe appears in counts; staff see names, filter and Set RSVP; a parent never sees names; Nudge sends once and is then rate limited; Updated shows until the event is opened; the revision notice shows the previous time; repeat preview and cap error before save; scope picker on edit and cancel; Delete blocked with "Cancel instead"; Past shows the record; club place message; the team page's embedded schedule still renders; keyboard focus returns to the row. Update the visual baselines in `apps/web/visual/` and the mobile screenshots, light and dark.
- Verify privacy by test, not by reading: no client query returns names to a parent, 13+ player or club admin; `event_seen` rows are readable only by their owner; the nudge notification and the calendar feed contain no child's name.
- Compare your screenshots with the design boards (A to I above, web and mobile, light and dark as drawn) and list every visible difference you chose to leave.
- Run the code review you would want before merging and fix what it finds.

## 8. Delivery

Open a PR with: summary, files removed, the design-to-component mapping, the three migrations and what each changes, the rule you chose for showing the revision notice, screenshots next to the design, test results, and a **list of anything you were unsure about, deferred, or that disagrees with the design** (including any matrix differences). Do not claim something works unless you ran it.

## Decisions already made

1. The only backend work is 3a (seen revisions), 3b (previous time), 3c (nudge with a database rate limit). No other schema or function changes.
2. Nudge reuses the existing reminder path and copy, never names a child, and is limited to one per event per 6 hours.
3. Maybe is shown in every counts bar.
4. Week grid is web only; mobile gets Agenda and Month with a week strip.
5. Mobile gains Edit, Places and Opponents, built from the same shared logic as web.
6. Club admins read each linked team's schedule only; a club place still says "Open a team".
7. Payments, waivers, registrations, roster and messages never appear on the Schedule.
