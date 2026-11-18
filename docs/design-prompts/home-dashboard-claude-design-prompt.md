# Claude Design prompt: Home / team dashboard (web) and Home (mobile)

Paste into Claude Design with the **Athleit design system** attached. Grounded in the repo as of 2026-11-18
(`docs/permissions.md`, `packages/core/src/capabilities.ts`, `pay-views.ts`, `home-dashboard.tsx`, mobile `(app)/index.tsx`, `docs/scheduling.md`, `docs/notifications.md`, `docs/registration.md`).

---

## PROMPT

You are redesigning the **Home** experience of Athleit (youth sports team management) using the attached **Athleit design system** (charcoal / lime / ice, glass sheets, mono numerals, light and dark). Produce high-fidelity mockups for **web (desktop 1280 and tablet 834)** and **mobile (iPhone 390)**. These are mockups that Claude Code will implement afterwards, so every tile must map to data we already have (listed below). Do not invent features, data or components outside the system.

### 1. What exists today (the problem)
- **Web Home** is a "Next up" hero (title, time, place, map tile, RSVP controls for parents or Going / Can't go / No reply counts for staff) plus a row of three thin cards: Messages (3 latest threads), Payments (parent "amount due" or staff "outstanding" bar), Roster (player count; staff also Active / Pending).
- **Mobile Home** is a greeting, one Next up card and a plain "Your places" list. It is far thinner than web and has no payments, messages, alerts or roster.
- Both ignore most of what the product now does: schedule changes and cancellations, game results and team record, registrations and waitlists, waiver compliance, documents, join requests, announcements, payouts status, and families with several children on several teams.

### 2. Principles
1. **Tiles follow capabilities, not roles.** A person can be Admin + Parent of one team, or coach of one team and parent on another. The context is a **place** (team, club or household) and capabilities are the union of the person's roles there. Design the dashboard as a composition of tiles that appear or disappear by capability, and show the dual-role case explicitly.
2. **Answer "what do I need to do or know right now?"** Order by urgency: things that need action first (RSVP, pay, sign, approve), then what changed, then what's next, then context.
3. **Nothing is shown that the person is not allowed to see.** See the privacy rules in section 5. Mock these tiles with the restricted data, not with data the database would refuse.
4. **Every tile has four states** (draw them once on a reference sheet, then use in the personas): loading skeleton, empty (with a useful next action), populated, error with retry. Tiles with nothing to say **hide** rather than show an empty shell, except where an empty state teaches the user what to do (e.g. no events yet).
5. Use existing components only: Card, ListRow / ListGroup, Badge, Chip, StatusDot, Avatar, SegmentedControl, Sheet, Button, IconButton, Notice (`warnSoft` / `badSoft`), EmptyState, mono numerals (`mono`, `monoLg`, `monoXl`), Label kickers. Lime is for the primary action and "today", not decoration. No new tokens. If a tile truly needs a new variant, list it in a "New variants needed" note instead of silently inventing one.
6. Web: sidebar (Home, Messages, Roster, Schedule, Pay, Registrations, Alerts, Family) plus the place switcher at the top. Mobile: top place switcher and tab bar. The Home mockups must sit inside that chrome.

### 3. Personas and scenarios to mock
Draw each persona for **web and mobile**, in **light** mode, plus dark for the two marked (D). Use realistic content (e.g. U12 Falcons, soccer, Maya and Eli as children, Riverside Park, vs. Hawks, Jersey fee $45, Tournament fee, Fall 2026 season). Sport is soccer unless noted.

**A. Parent, one child, one team** (D). Mid-week. Next game Saturday 10:00, child's RSVP not answered. Jersey fee $45 due in 3 days. Coach posted an announcement. One unread parent thread. A required waiver is expired.
**B. Parent, two children on two teams (and a sport change)**. Per-child RSVP for the same weekend, one child's practice moved (revision change) and one game cancelled with a reason. Two payments due, combined total. Needs the per-child grouping done well on a 390 screen.
**C. Parent, newly registered, not yet placed**. Registration status "Accepted, waiting for a team" or "Waitlisted #4", an unsigned waiver, a payment due for registration. No team schedule yet (the schedule is only visible once the child is on the roster), so Home must carry this journey.
**D. Player 13+** (own login). Sees own RSVP, next events, team record, announcements, limited roster (first name, jersey, position), and own payment requests as read-only (guardians pay). No contacts, no other families, no staff tiles. Show the claimed-login-pending state as a separate small frame (waiting for a guardian to approve).
**E. Coach**. Game day: attendance counts (Going / Can't go / Maybe / No reply) with a "nudge" action, tiles for results to enter after a game that has started, pending join requests, waiver compliance for the roster, upcoming week. No team-admin-only tiles (no refunds, no member management, no payouts setup, no medical answers).
**F. Team admin who is also a parent** (D). The dual-role case. Everything coach sees plus admin tiles (payments collection, payouts status, registration pipeline, members / invites, club link requests) plus the parent tiles for their own child. Show how the page stays calm with this many tiles: a priority "Needs your attention" strip on top, then grouped sections ("For your team", "For your family"), with a switcher-free layout.
**G. Manager** (admin-lite): like admin without refunds, member management, invites for staff roles and payouts setup; can manage registrations, documents, payment requests.
**H. Club admin (club-only place)**. Teams in the club, pending team link requests (approve / decline), club-issued payments collection and payouts, club registrations (capacity, waitlist), documents. Aggregates only for linked teams' own registrations and no payment events of linked teams.
**I. Empty and onboarding**: brand-new user with no place (existing "Welcome, how will you use Athleit?"), a new team with no events, no roster, no payouts set up; refine as a setup checklist tile.
**J. Offline / degraded**: one tile in error, others fine; push disabled banner for a user with no notification device.

### 4. Tile inventory (design all of these; each lists audience and data already available)

| # | Tile | Who sees it (capability) | Content and actions | Data source (exists today) |
|---|------|--------------------------|---------------------|----------------------------|
| 1 | **Needs your attention** (priority strip) | Anyone with open actions | Max 4 action chips: RSVP needed, payment due, waiver to sign, join request / link request / login claim to approve, game result to enter, registration to decide. Each is one tap to the exact screen. Hides when empty ("You're all caught up" only as a single quiet line on mobile). | Derived from the sources below |
| 2 | **Next up** (hero) | `schedule.view` | Kicker "NEXT UP · SAT 10:00 AM", title, time, place with Open in Maps tile, arrive-early note, home/away, opponent. Parent: per-child Going / Can't go (+ quiet Maybe). Staff: mono RSVP counts and a "Set RSVP for a player" shortcut. States: **cancelled** (reason, struck through), **updated** (revision banner), result entered. | `next_up`, `event_rsvp_summary`, `set_rsvp` |
| 3 | **This week** | `schedule.view` | Compact agenda of the next 7 days (games and practices, per child for families). Shows RSVP status dot per row, cancelled struck through. "See full schedule" link. | `team_schedule`, `household_schedule` |
| 4 | **Schedule changes** | `schedule.view` | Recent changes since last visit: time moved, location changed, cancelled with reason. Notice-style rows. | `events.revision`, `cancelled_reason`, schedule notifications |
| 5 | **Team record and last result** | `schedule.view` | W-L-T for the season label (mono), last result chip "W 3-2", sport-shaped scoring label (Goals / Points / Runs / Sets won). Staff: "Enter result" when a started game has none. | `team_record`, `game_results`, `sport_configs` |
| 6 | **Messages** | team members | 3 latest threads with unread dot, announcement threads marked with the ANNOUNCEMENT kicker; staff get "Post announcement". Unread count badge. | `get_thread_list`, announcements |
| 7 | **Latest announcement** | team members | Pinned most recent announcement (author, time, two-line clamp). Staff-only: read count. | announcement threads |
| 8 | **Amount due** (family) | `payments.pay` (guardians) / read for player | Total due in mono, next due date, number of requests, Pay button. Multi-child: grouped by child. Player view: read-only, "Ask a parent to pay". | `household_payments`, `payer_checkout_quote` |
| 9 | **Collection** (staff) | `payments.view` | Outstanding and collected mono totals with progress bar, number of open events, "Send reminders" (manage only), link to who has not paid (names, staff only). | `event_collection_summary`, `send_payment_reminders` |
| 10 | **Payouts status** | team / club admin (`payments.setup`); coach sees status only | Four states: not started, in review, needs info, ready (+ disconnected). Action "Set up payouts". Show as a checklist item in new-team onboarding. | `connected_account_status` |
| 11 | **Registrations** | family: `registration.register`; staff: `registration.view` | Family: my registrations with status chip (pending verification, submitted, waitlisted + position, accepted, placed, declined, withdrawn) and next step (sign waiver, pay). Staff: open events with capacity bar, waitlist length, "N to review", "Place accepted players" action. Club admin: aggregates for linked teams. | `list_my_registrations`, `registration_capacity_summary`, `list_registrations` |
| 12 | **Waivers and compliance** | family: own; staff: `registration.view` | Family: "Sign waiver for Maya" / expired. Staff: Signed / Missing / Expired counts in mono with names list (names and statuses only, never signed text or medical answers) and "Remind" if available. | `waiver_compliance`, `waiver_acceptances` |
| 13 | **Join requests and approvals** | staff `joinRequests.decide`; guardians `family.claimReview`; club admin `club.decideLink` | One approvals tile with tabs or sections: join requests to the team, player login claims (13+) to approve, team-to-club link requests. Approve / Decline inline. | `get_join_requests`, `get_player_login_claims`, `get_link_requests` |
| 14 | **Roster snapshot** | `roster.viewLimited` / `roster.viewFull` | Parent and player: avatar stack and player count (first names only). Staff: Active / Pending counts, avatar stack, "Add player". | `get_team_roster` |
| 15 | **Documents** | `documents.view` | Pinned and newest documents (team handbook, schedule PDF, medical forms) with file-type icon; staff: "Upload". Staff-only documents marked. | `list_documents` |
| 16 | **Family / My children** | guardians | Child cards (photo, name, age, team chips) with status (on roster, pending placement, login claim pending), "Add a child". On mobile this replaces the thin "Your places" list. | `household`, `add_child`, `player_login_claims` |
| 17 | **Your places** | everyone with 2+ places | Teams, clubs, household as rows with role labels ("Admin · Parent"), unread dots and a next-event line. Mobile keeps this but lower. | `buildContexts`, `next_up` |
| 18 | **Members and invites** | team admin (`members.manage`), manager / coach for family invites | Invite link / QR / code with copy and share, outstanding invites, join code with rotate. | `create_invite`, `rotate_team_join_code` |
| 19 | **Club overview** | club admin | Teams list with record and next event, link requests, club-issued collection, registration capacity. | club read functions |
| 20 | **Calendar subscribe** | `schedule.view` | "Add to your calendar" with the feed link (one tap to copy; reset/off in settings). Shown until used, then tucked into settings. | `create_calendar_feed_token`, `calendar-feed` function |
| 21 | **Notification health** | everyone (own), admin (team failures) | Quiet banner when push is off or quiet hours are on; admin sees "N notifications failed to deliver" link. | `register_push_device`, `get_notification_failures` |
| 22 | **Setup checklist** | admin / manager of a new team | Add events, invite families, set up payouts, publish registration, add a waiver. Each with done state, dismissible. | derived |

### 5. Privacy rules the mockups must respect (database-enforced, so UI must not imply otherwise)
- Parents and players see **counts** of RSVPs, never other families' names or notes. Names and notes are staff only.
- Parents and players see the **limited roster** only (first name, jersey number, position of active players). No last names, no DOB, no contacts. Guardian contacts appear only to the child's own guardians and to staff of the team the child is actively on.
- Payment names ("who has not paid") are staff only. Families see only their own household's requests and receipts. Players see their own requests but cannot pay by default.
- Medical / sensitive registration answers and staff notes never appear on Home. Waiver tiles show status only.
- Under-13 children have no login. The player persona is 13+ only.
- A parent with a team role but no child on the roster does **not** see the schedule (persona C needs a dedicated state).
- Club admins see linked teams' roster names but not contacts, and see aggregates (not rows) for team-issued registrations and no linked-team payment events.
- Messages: parents and teens only get Direct and group threads they take part in; announcements are staff-post, member-read.

### 6. Layout guidance
**Web desktop (1280):** page header with greeting + date and contextual actions (staff: "New event"; parent: "Schedule"). Row 1: Needs your attention strip. Row 2: Next up hero (wide) + Team record / Last result (narrow). Row 3: three or four equal tiles by persona. Row 4: secondary tiles (documents, roster, members, setup). Use the existing 2/3-column grid; do not exceed 9 tiles visible without scrolling for the dual-role admin and show how lower-priority tiles collapse into "More". Provide a **tablet (834)** version of persona F that proves the reflow.
**Mobile (390):** single column, thumb-reachable actions. Order: greeting, attention chips (horizontal scroll), Next up (with RSVP buttons inside the card), This week, then Amount due / Collection, Messages, Registrations, Roster, Your places. Use Sheets for detail, no nested scrolling. Show one persona (F) as a long-scroll frame annotated with the section breaks.

### 7. Deliverables
1. A **tile gallery** artboard: every tile in the four states, web and mobile sizes, light and dark.
2. Persona boards **A to J** as specified, web and mobile.
3. A **capability-to-tile matrix** (rows = tiles, columns = Parent, Player 13+, Coach, Manager, Team admin, Club admin, Guardian-only) matching the inventory so Claude Code can wire visibility from `capabilitiesForPlace`.
4. An ordered **priority rule** for the attention strip and a note on dual-role merging (union of capabilities, "Admin · Parent" label).
5. A short **"New variants needed"** list (if any) and an **accessibility note** per tile (status never by colour alone, 44px targets, RSVP announced as "Maya: Going", reduce-transparency fallback).
6. Annotate each tile with its data source from the table so implementation is a straight wire-up.

Constraints: no invented metrics (no attendance percentages, player stats, leaderboards, weather, lineups; these do not exist), no new tokens, no hardcoded values, glass only where the system uses it (sheets, sidebar, toasts), mono for money, counts and scores.

---

## Notes for the hand-off to Claude Code (not part of the prompt)
- Visibility should come from `capabilitiesForPlace(contexts, kind, id)`, never from `active.kind` or a single role (see `docs/context-switcher-proposal.md`).
- Web Home today lives in `apps/web/src/components/home/home-dashboard.tsx`; mobile in `apps/mobile/src/app/(app)/index.tsx`. Tiles in the same feature (payments `home-cards.tsx`, schedule `next-up-card.tsx`) are already reusable.
- Likely new read helpers: an attention aggregate (RSVP-needed, approvals count), recent schedule changes, and a registration summary for the Home. Everything else in the table is an existing function.
- Per `docs/design-system.md`, new components/variants start in the design system, then `tokens.contract.json`, then code.
