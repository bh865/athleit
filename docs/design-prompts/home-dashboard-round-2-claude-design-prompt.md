# Claude Design prompt: Home, round 2 (web and mobile)

Paste into Claude Design with the **Athleit design system** attached (the glass shells W2 for web and M2 for mobile). Grounded in the repo as of 2026-11-19
(`apps/web/src/components/home/home-dashboard.tsx`, `attention-strip.tsx`, `tiles.tsx`, `more-tiles.tsx`, mobile `apps/mobile/src/app/(app)/index.tsx`, `packages/core` attention and capability helpers).
This is a **second pass** on the Home from `home-dashboard-claude-design-prompt.md`. Keep that prompt's principles (tiles follow capabilities, nothing shown that the person may not see, four states per tile, existing components only). This round changes what is on the page and asks for much more character in the first two sections.

---

## PROMPT

Redesign the **Home** of Athleit (youth sports team management) again, using the attached **Athleit design system** (charcoal #272A2B, electric lime #CCFF33, ice blue #E1EFF6, glass sheets, Phosphor icons, Manrope, IBM Plex Mono for numerals, light and dark). Produce high-fidelity mockups for **web (desktop 1280, tablet 834)** and **mobile (iPhone 390)**. Claude Code will implement these, so every element must map to data we already have (listed below). No new tokens and no invented metrics. If something truly needs a new variant, list it under "New variants needed" instead of inventing it silently.

The two hero sections, **Needs your attention** and **Next up**, are where this round should feel designed rather than assembled. Be inventive with layout, hierarchy, scale of type and use of lime, but stay unmistakably Athleit: calm, open, icon-led, mono for numbers, lime only for the primary action and "now". No gradients, minimal shadows, glass only where the system already uses it.

### 1. What the page contains after this round

**Keep, in this order**
1. Page header: greeting, date, contextual action (staff "New event", parents "Schedule").
2. **Needs your attention** (redesigned, section 2).
3. **Next up** (redesigned, section 3), with **Team record** beside it on web (narrow) and below it on mobile.
4. **Amount due** (family) next to or under Next up on web, where the person is a payer and not team staff.
5. **For your team** group (staff): Approvals (join requests, login claims, club link requests), Waivers and compliance, Registrations, Payments collection, Payouts status, Roster snapshot, Setup checklist, Club overview card for a club-only place. **Notification health is removed from this group.**
6. **For your family** group (guardians): Amount due, Waivers, Registrations, My children, Roster snapshot (family-only people).
7. **Documents**, as a single quiet tile at the end, with no "More" group label if it is the only tile left.

**Remove completely (do not draw them, and do not leave empty space where they were)**
- **This week / Upcoming** agenda tile.
- **Messages** tile (the 3 latest threads) on web.
- **Latest announcement** tile.
- **Notification health** (from "For your team").
- **Add to your calendar** tile.
- **Your places** (the list on mobile and the tile on web). The place switcher in the chrome is the only way to move between places.

With those gone the page is shorter, so use the room to give the first two sections presence. Show that the group sections still reflow cleanly when they hold only one or two tiles (no orphaned half-empty rows). Web: use a 12-column grid and give the main content area **generous side padding** inside the content pane to the right of the sidebar (the current padding feels tight against the sidebar; show the intended gutter in the spec).

### 2. Needs your attention: make it a designed moment

Today it is a card with a row of small chips. Replace it with something people actually want to clear. Explore **two directions** on web and **two on mobile**, label them, and recommend one.

Ideas to build from (mix, do not just copy):
- **A "triage card" with a count as its anchor.** A large mono number ("3") with a short human line ("things need you before Saturday"), and a thin segmented ring or bar whose segments are the categories (RSVP, pay, sign, approve). Segments are lime for the most urgent, neutral for the rest, with an icon and text label so meaning never depends on colour.
- **Rows that resolve in place.** Each item is a roomy row: 44px icon circle, bold title ("RSVP for Maya, Sat vs. Hawks"), muted detail, a mono **time-pressure chip** ("Due in 3 days", "Closes tonight", "Game in 2 days"), and the one action that settles it as a trailing button ("Going", "Pay $45", "Sign", "Approve"). Where the action cannot happen in place (paying, signing), the button deep-links to the exact screen. Staff items such as join requests can show Approve / Decline inline, matching the Approvals tile.
- **A "lead item" plus a quiet list.** The single most urgent item is large (lime accent, bigger type, the inline action), the rest are slim rows under it. Show how the lead is chosen (priority rule in the deliverables).
- **Mobile: a snap-scrolling stack of cards** (one per item, a peek of the next, page dots, "See all N" opening a Sheet) as one direction, and a compact vertical triage list as the other.
- A friendly **all-clear state**: a single quiet line with a check-circle ("You're all caught up"), not an empty shell. On web it may collapse to a slim bar. Draw it.

Rules: max 4 items visible, then "+N more" opening a Sheet with all of them. Items come only from the existing attention kinds: RSVP needed, game result to enter, payment due, waiver to sign or expired, registration step, join requests, player login claims, club link requests, registrations to decide, payouts needing action, setup steps. Dual-role people (Admin + Parent) get items from both, merged by urgency, with a small place tag ("U12 Falcons", "Household") on each row so it is clear where it comes from.

### 3. Next up: make it the star of the page

Today it is a card with text on the left and a small map tile on the right. Redesign it as the **game-day card**. **On web, the map must be wide**, a real part of the composition (roughly half of the card at 1280, with a floating glass pill carrying the place name and "Open in Maps"), not a thumbnail.

Ideas to build from:
- **Time-aware headline.** A large mono countdown or state as the focal point: "Sat 10:00 AM" with a live relative line ("in 2 days", "in 38 min"), switching to **Live now** (lime dot) during the event and **Final · W 3-2** afterwards with an "Enter result" action for staff when none is entered. Use the existing 64px date block as an anchor.
- **Opponent and context row**: home/away badge, opponent, field name, "Arrive 9:30 (30 min early for warm-up)", written as a human sentence, with icon-led facts in a tidy fact grid.
- **RSVP as the centerpiece for parents.** Per child, big thumb-friendly **Going** (lime) and **Can't go** pills with the child's avatar and name, plus the quiet Maybe. Two-child households stack cleanly. Announced as "Maya: Going".
- **RSVP counts for staff as a proportional bar**: Going / Can't go / Maybe / No reply in mono with a thin stacked bar, and a "Nudge" action for No reply and a "Set RSVP for a player" shortcut.
- **Event states drawn properly**: **cancelled** (struck through title, reason in a `badSoft` notice), **updated** (revision banner in `warnSoft`, "Time moved from 9:00 to 10:00"), **practice** (no opponent, no result), **no map** (an address-less event, where the card re-balances without an empty hole), and **nothing scheduled** (an inviting empty state; staff "Add an event", parents "Open schedule").
- Mobile: the map becomes a full-bleed strip at the top of the card (about 120px) with the glass place pill over it, the big time and countdown below, then the RSVP pills pinned at the bottom of the card where the thumb lands.

Team record sits beside it on web (narrow, mono W-L-T, last result chip, season label) and below it on mobile, exactly as today; give it a bit more polish but it stays compact.

### 4. Data available (do not go beyond this)

| Element | Source |
|---|---|
| Attention items | `buildAttentionItems` / `deriveAttention` (kinds listed above) |
| Next up, RSVP, counts | `getNextUp`, `event_rsvp_summary`, `set_rsvp`; fields: title, starts_at, ends_at, timezone, location name / address / lat / lng, home_away, opponent, arrive_early_minutes, cancelled reason, revision, children[] with status, going / not_going / no_reply counts |
| Team record, last result | `team_record`, `game_results`, sport config labels |
| Amount due | `household_payments`, `payer_checkout_quote` |
| Collection, payouts | `event_collection_summary`, `connected_account_status` |
| Approvals | `get_join_requests`, `get_player_login_claims`, `get_link_requests` |
| Waivers, registrations | `waiver_compliance`, `list_my_registrations`, `registration_capacity_summary` |
| Roster, children, documents, setup | `get_team_roster`, household children, `list_documents`, derived setup steps |

Privacy rules from round 1 still apply (parents see RSVP counts not names; limited roster; payment names staff-only; waiver status only; no medical answers on Home; players 13+ only; a parent with a team role but no child on the roster does not see the schedule).

### 5. Scenarios to draw (web and mobile, light; dark for the two marked D)

- **A. Parent, two children, busy week** (D): 4 attention items (RSVP for both kids, jersey fee $45, expired waiver), Next up with per-child RSVP, Amount due, no team group.
- **B. Team admin who is also a parent** (D): attention with merged items and place tags (3 join requests, payouts need info, own child RSVP), game-day card with RSVP counts bar, then "For your team" and "For your family" groups. Prove the shorter page is calmer.
- **C. Coach on game day**: attention shows "Enter result" as the lead item, Next up in **Live now**, then a finished game state.
- **D. Parent, all caught up**: attention all-clear, Next up with Going already chosen.
- **E. States sheet**: Next up cancelled, updated, no map, nothing scheduled; attention empty, loading skeleton, error with retry.
- **F. Tablet 834** of persona B proving the reflow.

Use realistic content: U12 Falcons, Maya and Eli, Riverside Park, vs. Hawks, Jersey fee $45, Fall 2026 season.

### 6. Deliverables
1. Artboards for the scenarios above, web and mobile, plus the two recommended hero directions marked clearly with a one-line rationale each.
2. The **priority rule** for Needs your attention (order, who becomes the lead item, how time-pressure chips are worded) and how dual roles merge.
3. A **visibility matrix** for the remaining tiles (rows = tiles, columns = Parent, Player 13+, Coach, Manager, Team admin, Club admin).
4. **New variants needed** (if any) and an **accessibility note** for the two hero sections (status never by colour alone, 44px targets, spoken RSVP and countdown labels, reduce-transparency fallback for the glass map pill, keyboard order on the triage rows).
5. Annotate each element with its data source from the table so implementation is a straight wire-up.

Constraints: no invented metrics (no attendance percentages, weather, lineups, leaderboards), no new tokens, no hardcoded values, mono for money, counts, scores and countdowns, lime reserved for the primary action and "now".

---

## Notes for the hand-off to Claude Code (not part of the prompt)
- Delete from `home-dashboard.tsx`: `WeekTile`, `MessagesCard`, `AnnouncementTile`, `NotificationHealthTile`, `CalendarTile`, `PlacesTile`, and on mobile the `YOUR PLACES` list plus `WeekTile`, `AnnouncementTile`, `NotificationHealthTile` in `(app)/index.tsx`. The empty "More" group should collapse to Documents only. Remove the now-unused tile ids from `homeTileIds` and their tests.
- Attention strip: `AttentionStrip` (web and mobile) and `NextUpHero` / `NextUpCard` are the rewrite targets. In-place actions reuse `set_rsvp` and the approval functions already used by `ApprovalsTile`.
- Per `docs/design-system.md`, new components or variants go into the design system first, then `tokens.contract.json`, then code.
