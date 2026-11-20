# Claude Design prompt: Roster page / screen (web and mobile)

Paste into Claude Design with the **Athleit design system** attached (glass shells W2 for web and M2 for mobile). Grounded in the repo as of 2026-11-19
(`apps/web/src/app/(app)/roster/page.tsx`, `apps/web/src/components/roster/roster-view.tsx`, `apps/mobile/src/app/(app)/roster.tsx`, `apps/mobile/src/components/team/roster.tsx`, `supabase/migrations/20260102000400_team_players_roster.sql`, `packages/core/src/capabilities.ts`, `docs/permissions.md`, `docs/design-system-additions.md`).
Same principles as the Home and Family prompts: existing components only, every element maps to data we have, four states per section, no invented metrics.

---

## Audit: what we have today

**Where it lives.** Web: sidebar item "Roster" (`/roster`, only when the person has a team). Mobile: More > Roster, with a back link. Home has a Roster tile and the team Overview has a count and "Open Roster". The page is for the **active team**; there is no roster for a family or club place.

**Three audiences, one component.** `RosterView` / `RosterSection` switch on capabilities:
- **Limited** (parents, players 13+, other team members; `roster.viewLimited`): a plain list of **active** players only: jersey number, first name, position. No last names, no ids, no photos, no DOB. This is a database rule (`get_team_roster`), not a UI choice.
- **Full, staff** (admin, manager, coach; `roster.viewFull`, `roster.edit`, `roster.place`, `contacts.view`): everyone including inactive, last names, status, expandable player panel with DOB, guardian contacts, editing and removal, plus a placement form.
- **Full, read-only** (club admin of the linked club): full list, no edit, no placement, no guardian contacts.

**What a staff person sees now (web).** Header "Roster" with the team name. A **Card with a form** "Add an approved child to the roster" at the top (only when approved join requests exist whose child is not on the roster yet): child Select, jersey, position, Add to roster. Below it a flat list: initials avatar, mono `#7`, full name, position, a lowercase status badge (`active` / `inactive`). Clicking a row **expands a panel under it**: "Maya Hayes · born 2016-03-04" (raw ISO date), Guardian contacts (mailto and tel links), then a form (jersey, position, status Select, Save, Remove from roster). **Mobile** is the same content: the jersey is baked into the title string ("#7  Maya Hayes") rather than shown as a mono element, contacts are ghost buttons, the panel is a Card inline under the row.

**Problems the redesign should solve**
1. **No overview.** No counts (active, inactive, ready to add), no search, filter or sort. Inactive players sit mixed into the same list as active ones. Fine for 12 players, poor for a club team with 18 to 25.
2. **Limited view is bare.** A parent sees a flat text list, and nothing makes it feel like a team page.
3. **Flat identity.** Staff see initials avatars even when a child has a photo (`photo_path`, signed URLs via `getPhotoUrl`); no age (only a raw ISO birth date inside the panel); status is a raw lowercase word.
4. **Adding a player is a form, not a flow.** Approved-but-unplaced children are hidden in a dropdown. The card disappears entirely when empty, so staff do not learn the path exists. Approving a join request and placing the child are two separate trips.
5. **Expand-in-place panel.** Editing, contacts and removal all happen in an accordion that pushes the list down. The design system's own roster pattern is a **side panel** (`docs/design-system-additions.md` lists this as a known deviation). On mobile it makes a long list jump.
6. **Destructive action has no guard.** **Remove from roster** deletes the entry immediately with no confirm, next to Save. The softer option, Inactive, is hidden in a Select.
7. **Errors arrive late.** A jersey number already taken by an active player (a database unique rule) is only reported after Save, as a generic message.
8. **Position is free text** even though each sport config has suggested positions (soccer: GK, DEF, MID, FWD, and so on); nothing helps the coach pick one.
9. **Empty states are one sentence of text** with no action, even for staff.

**Existing data (do not go beyond this)**

| Element | Source |
|---|---|
| Roster rows | `getRoster` → `get_team_roster`: team_player_id, player_id and last_name (full viewers only), first_name, jersey_number (0 to 99), position (free text up to 40 characters), status (active / inactive). Ordered by jersey, then first name. |
| Photo, DOB, age | `players.photo_path` + `getPhotoUrl`; `getPlayer` (first and last name, date of birth, household_id); `ageOn` |
| Guardian contacts | `getGuardianContacts` (display name, email, phone), staff only and only for **active** players; guardians see their own child's |
| Ready to add | `getJoinRequests` filtered to approved requests that name a child who is not on the roster yet |
| Place, edit, remove | `placePlayerOnRoster`, `updateRosterRow`, `removeFromRoster` (schemas `placePlayerOnRosterSchema`, `updateRosterRowSchema`) |
| Position suggestions | sport config `positions` for the team's sport (soccer, basketball, volleyball, football, baseball, softball, hockey) |
| Capabilities | `roster.viewFull`, `roster.viewLimited`, `roster.edit`, `roster.place`, `contacts.view` |

**Privacy rules that stay exactly as they are**: parents and players never see teammates' last names, ids, DOB or photos, only active players' first name, jersey and position; guardian contacts only for active rostered children and only to staff and the child's own guardians; club admins read but never edit and never see contacts; payment names are staff-only and waiver status is not on this page; no medical data anywhere.

---

## PROMPT

Redesign the **Roster** page (web) and **Roster** screen (mobile) of Athleit (youth sports team management), using the attached **Athleit design system** (charcoal #272A2B, electric lime #CCFF33, ice blue #E1EFF6, glass sheets, Phosphor icons, Manrope, IBM Plex Mono for jersey numbers and numerals, light and dark). Produce high-fidelity mockups for **web (desktop 1280, tablet 834)** and **mobile (iPhone 390)**. Claude Code will implement these, so every element must map to the data listed in the audit. No new tokens and no invented metrics. If something needs a new variant or new data, list it under "New variants needed" or "New data needed" instead of inventing it silently.

### 1. What this page is for

The Roster is the **team's people page**: who is on the team, in what role on the field, and (for staff) how to reach and manage them. Nothing else. **No schedule, RSVPs, payments, balances or waiver status anywhere on this page**; those have dedicated areas. Do not show team staff (coaches and managers) here; the roster is players only.

The page has **three audiences from one design** and the differences must be obvious in the drawings:
1. **Staff** (admin, manager, coach): full roster, panel, placement, editing.
2. **Parents and players 13+**: the limited roster, designed with real character even though it holds only jersey, first name and position.
3. **Club admin**: full roster, read-only.

### 2. Page structure

1. **Page header**: "Roster", the team name and season label as subtitle (for example "U12 Falcons · Fall 2026"). Staff get a primary action **Add player** when children are ready to place; otherwise no action (do not invent one).
2. **Summary row** (staff and club admin only): three quiet mono counts, **Active**, **Inactive**, **Ready to add**, as a compact stat strip or segmented filter. For parents and players: just one line, "14 players" (active count) in mono.
3. **Ready to add** (staff with `roster.place` only): a designed section, not a form at the top. One row per approved child who is not on the roster yet: avatar, name, "Approved Nov 12" if a date is available (otherwise omit), and an **Add** action that opens a small inline step to set **jersey** and **position** and confirm. When there are none, the section is gone, but a staff empty roster explains the path (section 7). Several ready children stack cleanly; show 1, 3 and 6.
4. **Toolbar** (staff and club admin): search by name or jersey, status filter (**Active | Inactive | All**, default Active), and sort (**Jersey**, **Name**, **Position**). Parents and players get search only, no status filter (inactive players are not visible to them).
5. **The roster itself**: described in section 3.

### 3. The roster list

**Staff and club admin (full).** A table-like list on web and a stacked list on mobile. Each row: avatar (**photo when `photo_path` exists, initials otherwise**), **jersey number as a large mono element** (not text in a title; `–` when none), full name, **age** (for example "9 yrs"), position as a chip, and a status marker with icon and text (**Active**, **Inactive**; never colour alone, and capitalised, not the raw database word). Selecting a row opens the player panel (section 4). Inactive rows are visibly quieter but remain readable. Web at 1280: a proper list with column alignment (jersey, player, age, position, status, chevron). At 834: drop age first. Mobile: two-line rows, jersey on the left, status as a small chip, chevron.

Consider an optional **jersey wall** view toggle on web (a grid of jersey-number tiles with the first name below, showing the team as a squad). Draw it as a second view for scenario A only if it is cheap; the list remains the default and the only view on mobile.

**Parents and players (limited).** Active players only, as a **squad view**: a grid of cards on web and a two-column grid or clean list on mobile. Each card shows a big mono jersey number, the **first name**, and the position chip. **No photos, no last names, no ages, no status.** Parents must understand at a glance this is the team, not their private data; a quiet one-line footnote is allowed ("Teammates are shown by first name only."). Do not mark or highlight a parent's own child: identity is not returned to this view.

**Club admin.** Same as staff full list, but no Add, no edit, no remove, no contacts; the panel is a read-only profile with a note "Read-only for club admins".

### 4. Player panel (staff)

Replace the expand-in-place accordion.
- **Web**: a **side panel** on the right of the list (the design system's own roster pattern), selected row highlighted, list stays in place. At 834 it becomes an overlay panel.
- **Mobile**: a **bottom Sheet** (full height when open) opened from the row, not an inline card.

Content, top to bottom:
1. **Identity**: large avatar or photo, full name, age and date of birth formatted for people ("9 years old · born Mar 4, 2016"), jersey as a big mono number, position, status.
2. **Guardian contacts** (staff with `contacts.view`, active players only): a row per guardian with name, a **mailto** action and a **tel** action as icon buttons with text labels, copy on long-press or a copy icon. An inactive player shows a calm note: "Contacts are shown for active players only."
3. **Edit** (staff with `roster.edit`): jersey (mono input; **checks live against the other active players and says who has it**, "#7 is taken by Noah"), position (**quick-pick chips from the sport's suggested positions plus a free text field**), and an **Active / Inactive** segmented control with a one-line explanation of what Inactive does ("Hidden from parents. Contacts are no longer shown.").
4. **Save** primary; success feedback inline or as a toast.
5. **Remove from roster** as a clearly separated, quiet destructive action at the bottom, which opens a **confirm Sheet or dialog**: "Remove Maya from U12 Falcons? This deletes their roster entry. If you only want to hide them, set them to Inactive instead." with **Set inactive** as the safe alternative button and **Remove** as the destructive one.

### 5. Add player flow

Opened from **Ready to add** or the header **Add player**. A small Sheet (mobile) or dialog (web): the child (pre-selected when launched from a row), jersey (live conflict check like above), position (chips plus text), **Add to roster**. Success returns to the list with the new row briefly highlighted. Also draw the conflict error and the "no children ready to add" state of the header action (the action explains the path, "Approve a join request first", with a link to Requests).

### 6. Scenarios to draw (web and mobile, light; dark for the two marked D)

- **A. Coach, full roster** (D): 14 players, 2 inactive (hidden by the Active filter), 3 ready to add, summary strip, toolbar, one row selected with the side panel open on web and the Sheet open on mobile.
- **B. Parent, limited squad view** (light): 12 active players, with the real-looking squad grid, one-line footnote.
- **C. Club admin, read-only** (D): full list with the read-only panel.
- **D. Staff, empty roster**: no players and no ready-to-add (explains the path with links to Requests and Invites), and a second variant with 2 ready to add.
- **E. Player 13+**: same as B, noting it is identical, plus the empty limited roster ("No players on the roster yet.").
- **F. States**: loading skeleton, error with retry, search with no results, jersey conflict, remove confirm, Add player flow (empty, filled, conflict, success), contacts for an inactive player, panel save success.
- **G. Tablet 834** of scenario A.

Use realistic content: U12 Falcons, Fall 2026 season, soccer positions (GK, DEF, MID, FWD), players such as Maya Hayes #7 MID, Noah Brooks #10 FWD, Ava Chen #1 GK, Liam Ortiz #4 DEF, guardian "Jordan Hayes" with email and phone.

### 7. Empty and edge cases to draw
- Staff, no players yet: warm and actionable ("Your roster is empty. Approve a join request, then add the child here.") with **Review requests**, plus a link to Invites. Never an empty shell.
- Players with no jersey number show `–` and sort last, as today.
- A long name and a long position (40 characters) truncate cleanly.
- 4 players and 25 players on the same layout, to prove it scales both ways.

### 8. Deliverables
1. Artboards for the scenarios above, web and mobile.
2. One paragraph on why the squad view, the side panel and the Ready to add section were chosen.
3. A **visibility matrix**: rows = page elements (summary strip, status filter, photos, last names, age, contacts, edit, add, remove, ready to add), columns = Staff, Parent, Player 13+, Club admin.
4. **New variants needed** (jersey tile, ready-to-add row, side panel, segmented status control, position chips) and **New data needed** (if any; optional ones clearly marked).
5. An **accessibility note**: status never by colour alone, 44px targets, jersey announced as "number 7", focus order list to panel and back, destructive confirm focus, search and filter keyboard behavior, reduce-transparency fallback for any glass.
6. Annotate each element with its data source from the audit table so implementation is a straight wire-up.

Constraints: no schedule, payments, waiver or RSVP content, no invented metrics (no goals, stats, attendance), no new tokens, no hardcoded values, mono for jersey numbers, ages and counts, lime reserved for the primary action only.

---

## Notes for the hand-off to Claude Code (not part of the prompt)
- Everything above can be built on existing data. Optional extras (a "Yours" marker for a parent's own child, an approval date on Ready to add) need new reads; leave them out unless the design cannot work without them.
- Shared view-model logic belongs in `packages/core` (filter, sort, jersey conflict check, position suggestions from the sport config) so web and mobile share it, with unit tests.
- Keep test ids stable or update the specs: `roster-list`, `roster-limited`, `place-form`, `player-panel` in `apps/web/e2e/phase1.spec.ts` and the visual baselines in `apps/web/visual/`.
- Per `docs/design-system.md`, new components or variants go into the design system first, then `tokens.contract.json`, then code. `docs/design-system-additions.md` currently lists the expand-in-place roster panel as a known deviation; the side panel closes it.
