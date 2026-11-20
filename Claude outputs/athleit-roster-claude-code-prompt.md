# Claude Code prompt: Roster page / screen (web and mobile)

Paste into Claude Code at the repo root. Read first, plan, then build. Proceed without waiting for approval unless you hit a real contradiction.

Implement this design in this codebase:
@https://claude.ai/code/artifact/a63c1d24-9cd0-46a8-8fb0-8bc72851bebc

Read the design's files from that link. Match how it looks, using this codebase's own components and conventions.

## Design source

The design file is one Claude Design artifact holding many screens. **Only the Roster files apply here.** Ignore Home, Family, Team, Pay, Account, Documents, Waivers, Registrations and the rest.

| Platform | Canvas (board index) | Views (the real markup) |
|---|---|---|
| Web | `project/Roster.dc.html` | `project/RosterWebView.dc.html` |
| Mobile | `project/RosterScreen.dc.html` | `project/RosterMobileView.dc.html` |
| Rationale, visibility, new data, accessibility, data source per element | `project/RosterRulesView.dc.html` (screen `rules`, board O0) | |

Read the rationale view first. **Its visibility matrix renders its cells as literal arrays in the board (a drawing bug), so use the matrix in section 2 of this prompt instead**, which is read straight from the board's data in the order Staff, Parent, Player 13+, Club admin.

Web screens (`RosterWebView`, 1280 desktop, 834 tablet): `scenA` (dark, coach, panel open, 14 players, 2 inactive, 3 ready), `scenAready` (inline Ready to add step open), `scenAwall` (jersey wall view), `scenAinactive` (All filter, inactive player), `scenAconflict`, `scenAsaved`, `removeConfirm`, `addEmpty`, `scenB` (parent squad view), `scenE` (player 13+) and `scenEempty`, `scenC` (dark, club admin read-only), `scenD` and `scenD2` (staff empty roster, nothing ready and 2 ready), `ready1`, `ready6`, `tablet` (834, panel as overlay, age column dropped), `players4`, `players25`, `longnames`, and the states `loading`, `error`, `noResults`, `jerseyConflict`, `contactsInactive`, `add_empty`, `add_filled`, `add_conflict`, `add_success`.

Mobile screens (`RosterMobileView`, 390): `scenA`, `scenAready`, `scenAsheet` (player sheet), `add_empty`, `add_filled`, `add_conflict`, `add_success`, `jerseyConflict`, `saved`, `contactsInactive`, `removeConfirm`, `scenB` (squad grid), `scenE`, `scenEempty`, `scenC` and `scenCsheet` (club admin, read-only sheet), `scenD` and `scenD2`, `players4`, `longnames`, `loading`, `error`, `noResults`.

Treat the board markup as the visual reference for layout, spacing, copy and states, not as code to paste. Use our components, tokens and conventions. Where a board value is hardcoded, map it to the nearest token.

## 0. Read first, then write a plan

Read before planning:
- Web: `apps/web/src/app/(app)/roster/page.tsx`, `apps/web/src/components/roster/roster-view.tsx` (the whole current implementation: `RosterView`, `PlaceForm`, `PlayerPanel`), `apps/web/src/components/app/sidebar.tsx`, the team overview roster snapshot (`components/team/overview.tsx`) and the Home Roster tile (`components/home/more-tiles.tsx`), which must keep working.
- Mobile: `apps/mobile/src/app/(app)/roster.tsx`, `apps/mobile/src/components/team/roster.tsx` (`RosterSection`, `PlaceForm`, `PlayerPanel`), `components/home/more-tiles.tsx`, `components/team/overview-tab.tsx`, `app/(app)/more.tsx`.
- Core and db: `packages/core/src/capabilities.ts` (`roster.viewFull`, `roster.viewLimited`, `roster.edit`, `roster.place`, `contacts.view`), `schemas/teams.ts` (`placePlayerOnRosterSchema`, `updateRosterRowSchema`), `scheduling.ts` (sport configs and their `positions`), `packages/db/src/api.ts` (`getRoster`, `getPlayer`, `getGuardianContacts`, `getJoinRequests`, `placePlayerOnRoster`, `updateRosterRow`, `removeFromRoster`, `getPhotoUrl`).
- Database: `supabase/migrations/20260102000400_team_players_roster.sql` (`get_team_roster`, `get_guardian_contacts`, the unique active jersey index, RLS), the storage migration for player photos, and `docs/permissions.md` (roster, photos, minors data rules).
- Docs: `docs/design-system.md`, `docs/design-system-additions.md` (it lists the expand-in-place roster panel as a known deviation; this work closes it), `docs/design-audit.md`.
- Tests: `apps/web/e2e/phase1.spec.ts` (roster flow), `apps/web/e2e/visual-app.spec.ts`, `apps/web/visual/`.

The plan must list: files to delete, files to rewrite, new shared logic in `packages/core`, how age and photos are loaded without one request per row (section 3), which design details have no existing component, and anything in the design that cannot be wired to data we have.

## 1. Scope

Rewrite the Roster page (web) and Roster screen (mobile) to match the design. No backend or migration change is expected; everything is built on existing reads and writes. If you find one is needed, stop and say so in the plan.

**Page parts (same item model, ordering and copy on web and mobile):** header (team name and season, **Add player**), summary strip, **Ready to add** section, toolbar (search, status filter, sort), the roster list (staff and club admin) or the **squad view** (parents and players 13+), the **player panel**, the **Add player** flow, and the remove confirm.

**Remove:** the always-on `PlaceForm` card at the top, the expand-in-place accordion `PlayerPanel`, and anything that only served them. Keep the Home Roster tile, the team Overview roster snapshot and the sidebar and More entries untouched.

**Not on this page:** schedule, RSVPs, payments, balances, waiver status, team staff (coaches and managers). Do not add them.

## 2. Who sees what

Visibility keeps coming from `capabilitiesForPlace` and the existing capabilities, never from the place kind alone. Use this matrix as a **check** on the existing logic. If the existing capability logic and the matrix disagree, keep the code's behavior, and list each difference in the PR.

| Element | Staff | Parent | Player 13+ | Club admin |
|---|---|---|---|---|
| Summary strip (Active, Inactive, Ready to add) | ✓ | – | – | ✓ (the Ready to add count only where `roster.place` allows it; check `scenC`) |
| One-line player count | – | ✓ | ✓ | – |
| Status filter | ✓ | – | – | ✓ |
| Search | ✓ | ✓ | ✓ | ✓ |
| Sort | ✓ | – | – | ✓ |
| Photos | ✓ | – | – | ✓ |
| Last names | ✓ | – | – | ✓ |
| Age and date of birth | ✓ | – | – | ✓ |
| Inactive players | ✓ | – | – | ✓ |
| Guardian contacts (active players only) | ✓ | – | – | – |
| Edit jersey, position, status | ✓ | – | – | – |
| Add player, Ready to add | ✓ | – | – | – |
| Remove from roster | ✓ | – | – | – |

Privacy is unchanged and database-enforced: parents and players never receive last names, ids, DOB or photos of teammates, only active players' first name, jersey and position (`get_team_roster`). Do not try to identify or highlight a parent's own child in the limited view. Guardian contacts only for active rostered children. Club admins read but never edit and never see contacts. Do not loosen anything.

## 3. Data wiring

- **List:** `getRoster` (one call). The summary counts come from its rows plus the ready-to-add list.
- **Age and photo without N+1:** `get_team_roster` returns neither date of birth nor `photo_path`, and the old panel fetched `getPlayer` per open row. For the full list, load date of birth and `photo_path` for the roster's player ids in **one batched read** of `players` (staff and club admins already have read access to full player rows by RLS), derive age with `ageOn`, and fetch signed photo URLs with `getPhotoUrl` lazily for visible rows only, with initials as the fallback and while loading. If a batched read is not possible under the current RLS for any of these roles, say so in the plan before inventing an RPC. The limited view never loads either.
- **Ready to add:** `getJoinRequests` (only with `roster.place`), filtered as today to approved requests whose child is not on the roster. Show an approval date only if the existing rows already carry one; otherwise omit it (the design marks it optional).
- **Panel:** `getGuardianContacts` for an active player (only with `contacts.view`); an inactive player shows the design's calm note instead of calling it.
- **Writes:** `placePlayerOnRoster`, `updateRosterRow`, `removeFromRoster` with the existing schemas. After any write, reload the roster and the ready-to-add list.
- **Position quick-picks:** the `positions` array of the team's sport config. Position stays free text (up to 40 characters); chips only fill the field.
- **Shared logic in `packages/core`, unit-tested:** text and jersey search; status filter; sort (jersey with no-number last, name, position); summary counts; the **jersey conflict check** (jersey 0 to 99, conflict only against other **active** players on the team, ignoring the player being edited, returning the name of who has it, to match the database's unique active-jersey index); the display strings ("9 yrs", "number 7" for screen readers, "no number"); and the list of selectable positions. The database stays the authority: still map its unique violation to the same friendly message when the client check missed a race.

## 4. Page, web and mobile

Match the design boards; use existing components first.

- **Header:** "Roster", team name and season label. **Add player** is the page's only lime action and turns secondary while the panel or an inline step is open (per the rationale). With nothing ready to place it explains the path ("Approve a join request first") with a link to Requests, as drawn.
- **Summary strip and toolbar:** as drawn. Default status filter Active. Parents and players get the one-line count and search only.
- **Ready to add:** a row per approved child with an **Add** action that opens the inline jersey and position step on web and the Add sheet on mobile. The section disappears when empty; the empty-roster state explains the path. Prove 1, 3 and 6 rows (`ready1`, `scenA`, `ready6`).
- **Roster list (staff, club admin):** photo or initials, jersey as a large mono element (`–` when none), full name, age, position chip, and a status marker with icon and text ("Active", "Inactive", never the raw database word and never colour alone). Inactive rows quieter but readable. At 834 drop the age column first. Web also gets the **jersey wall** view toggle shown in `scenAwall` (list stays the default and the only view on mobile; keep the choice in local state only).
- **Squad view (parents, players):** active players only, a card per player with a large mono jersey, the first name and the position chip. No photos, last names, ages or status. Include the one-line footnote as drawn.
- **Player panel:** web, a **side panel** at the right of the list with the selected row highlighted (an overlay at 834); mobile, a full-height **bottom Sheet**. Content as drawn: identity (photo or avatar, name, "9 years old · born Mar 4, 2016" via an existing date formatter, jersey, position, status), guardian contacts (mailto and tel actions with text labels, plus copy), then the edit form: jersey with the live conflict check ("#7 is taken by Noah"), position (chips plus text), and an **Active | Inactive** segmented control with its one-line explanation, then Save and the success feedback. Club admins get the read-only variant with the read-only note.
- **Remove from roster:** a quiet destructive action at the bottom that opens the confirm dialog or sheet: Set inactive (safe, **receives initial focus**) and Remove (destructive). Removal never runs without it.
- **Add player flow:** child (preselected from a Ready to add row), jersey with live conflict check, position chips plus text, Add to roster; on success return to the list and briefly highlight the new row. States: empty, filled, conflict, success.
- **States:** loading skeleton, error with retry, search with no results, empty roster (warm, with Review requests and Invites links for staff; "No players on the roster yet." for the limited view), long names and 40-character positions truncating cleanly, 4 and 25 players on the same layout.
- If a design detail has no existing component, build it from existing primitives, and if it truly needs a new variant (jersey tile, ready-to-add row, side panel, segmented status control, position chips, per the rationale view) add it to `packages/tokens` or the shared UI layer as `docs/design-system.md` describes and list it in `docs/design-system-additions.md`. Update that file's roster row to remove the "expand-in-place" deviation.

## 5. Conventions

Phosphor icons through our wrappers, Manrope for UI, IBM Plex Mono for jersey numbers, ages and counts, light and dark from tokens, no hardcoded colors or sizes, lime only for the primary action, glass only where the system already uses it, solid fallbacks under reduce-transparency. 44px minimum targets. Status never by color alone. Jersey announced as "number 7" (and "no number"). Focus order: toolbar, list, then the panel; closing the panel returns focus to the selected row; the segmented control moves with arrow keys. Web and mobile stay consistent in copy, ordering and states. Reuse `friendlyError`, `LoadState`, `FormMessage`, `Badge`, `Avatar`, `Sheet`.

## 6. Verification

- `pnpm` typecheck, lint and unit tests pass.
- New Vitest coverage in `packages/core` for filter, sort (including no-jersey last), counts, the jersey conflict check (own row ignored, inactive players ignored, bounds 0 and 99), display strings, and position options per sport.
- Playwright + Axe specs, web: staff place a ready child through the new flow (update the existing roster flow in `phase1.spec.ts`; keep the test ids `roster-list`, `roster-limited`, `place-form` and `player-panel` working or update every use); jersey conflict shows before save; panel edit and save; Set inactive hides the player from the parent and drops contacts; remove only through the confirm; the parent sees the squad view with no last names, photos or status; a club admin sees the read-only list with no actions or contacts; search and status filter; empty states; keyboard focus returns to the row. Update the visual baselines in `apps/web/visual/` and the mobile screenshots, light and dark.
- Check the database privacy is untouched: no new query reads teammates' `players` rows for parents or players.
- Compare your screenshots with the design boards (`scenA`, `scenB`, `scenC`, `scenD`, `scenE`, `tablet`, the add and state boards on web; `scenA`, `scenAsheet`, `scenB`, `scenC`, `scenD`, the add and state boards on mobile), light and dark as drawn, and list every visible difference you chose to leave.
- Run the code review you would want before merging and fix what it finds.

## 7. Delivery

One commit per logical step (shared logic and tests, web page, web panel and flows, mobile screen, mobile sheet and flows, docs and tests). Open a PR with: summary, files removed, the design-to-component mapping, how age and photos are loaded, screenshots next to the design, test results, and a **list of anything you were unsure about, deferred, or that disagrees with the design** (including any matrix differences). Do not claim something works unless you ran it.

## Decisions already made

1. No backend change. The optional "Yours" marker for a parent's own child and the approval date on Ready to add are **not built** (a date only if the data already exists).
2. Players only. No staff list, schedule, payments, RSVP or waiver content on this page.
3. The player panel is a side panel (web) and a bottom sheet (mobile); the expand-in-place accordion is gone.
4. Remove always goes through the confirm, with Set inactive as the default safe action.
5. Position remains free text; chips are suggestions from the sport config only.
