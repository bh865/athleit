# Claude Design prompt: Schedule and all its features (web and mobile)

Paste into Claude Design with the **Athleit design system** attached (glass shells W2 for web and M2 for mobile). Grounded in the repo as of 2026-11-20
(`apps/web/src/components/schedule/*`, `apps/web/src/app/(app)/schedule`, `apps/web/src/app/(app)/events`, `apps/mobile/src/app/(app)/schedule.tsx`, `apps/mobile/src/app/(app)/events/[id].tsx`, `apps/mobile/src/components/schedule/*`, `docs/scheduling.md`, `docs/permissions.md`, `docs/design-system-additions.md`, `packages/core` scheduling helpers).
Same principles as the Home, Family and Roster prompts: existing components only, every element maps to data we have, four states per section, no invented metrics. The Home round 2 **Next up / game-day card** already defines how an event looks when it is the star of a page; this Schedule must feel like the same family (time-aware state, per-child RSVP, counts bar, cancelled and updated notices), not a second system.

---

## Audit: what we have today

**Where it lives.** Web: sidebar "Schedule" (`/schedule`, only when the person has a team or family place); an event opens as a **400px glass drawer** on the Schedule (`?event=<id>`) and as a full page at `/events/<id>` (the deep-link target of notifications). Mobile: Schedule screen, plus the event screen at `/events/<id>`. A family place shows the **household schedule** (one entry per event, with one RSVP per child across all their teams); a team place shows the **team schedule** with management for staff; a club place shows only "Open a team to see its schedule" because club admins read each linked team separately. A parent with a team role but no child on the roster sees nothing (database rule). The same web component is also reused embedded inside a team page.

**Web today.**
- Header "Schedule" (with the team name), a Month | Week segmented control (Week default), staff-only lime **New event**; a second row with previous, range label ("Nov 16 to 22"), next, Today, and ghost buttons **Places**, **Opponents** (staff) and **Calendar link** (everyone).
- **Week is a list, not a calendar**: only days that have events, each under a day heading, one row per event. **Month** is a Sunday-start grid with up to 3 titles per day (a coloured left border by type: game lime, practice amber, event neutral), "+N more", today in lime; picking a day lists that day below.
- **Event row**: 64px date block (weekday and day number), title, "Tue 5:30 PM · Field 3", team name (household only), a result chip ("W 3-2"), a type chip ("Practice"), a caret. Cancelled rows are struck through with the reason.
- **Event drawer or page**: kicker (type), title, an **embedded Google map**, cancelled banner or an "Updated" banner (shown only if the event changed while you had it open), a facts list (date and time range with zone, plus "your time" when the zone differs; place; virtual "Join meeting" link; "vs. Hawks (home)"; "Arrive 30 min early"), notes, the result line, RSVP **counts (Going, Can't go, No reply; Maybe is not shown)**, and then either **per-player RSVP names with icon-only status (staff)** or **Going / Can't go (big) plus a ghost Maybe, per child (parents)**. Staff actions: Enter or Edit result (once a game has started), Edit, Cancel event. Live: counts and the Updated banner follow Realtime.
- **Flows (right-hand sheets)**: New or Edit event (type, title, date, start and end, time zone, in person or virtual with meeting link, saved place or "Add a new place" with address search, opponent and home or away for games, arrive early, notes, repeat weekly on chosen weekdays ending after N events or on a date); edit and cancel ask for a **scope** (This event, This and following, All) for series; **Cancel** requires a reason families will see; **Result** is shaped by the sport (final score, by period, by inning, or sets that add up); **Places** and **Opponents** managers; **Calendar link** (create, shown once with copy, reset, turn off).

**Mobile today.**
- Large "Schedule" title, a round lime plus button for staff, an **Upcoming | Past** segmented control, a **flat list of cards** (date block, title, "time · location", result, caret; no day grouping), a ghost **Calendar link** button at the bottom. New event is a sheet (single or weekly).
- The event screen mirrors the web detail without a drawer: kicker, title, map, banners, a facts card, **mono counts**, staff names list, RSVP pills for parents, and for staff only **Enter result** and **Cancel**.

**Problems the redesign should solve**
1. **The list hides the one thing parents come for.** The data already includes each child's RSVP status (household) and the going, can't go, maybe and no-reply counts (team), but rows show neither. A parent cannot see what needs a reply without opening every event; a coach cannot see how a week is shaping up.
2. **Week is not a week.** There is no calendar grid and no sense of time of day, and web has no Past list at all (only paging back through weeks). Month is dense and truncated.
3. **No filters** for a household with several children and teams, or by type (Game, Practice, Event), and no quick "Needs reply".
4. **Mobile is a second-class citizen**: no month or week view, no day grouping, **no way to edit an event**, no Places or Opponents management, and no scope picker for series.
5. **Maybe disappears**: it can be selected, and the database counts it, but the counts show only Going, Can't go and No reply.
6. **Staff cannot act on RSVPs.** The names list is icon-only; there is no way to set a player's RSVP on their behalf (the database function `staff_set_rsvp` exists, the UI does not), and no nudge (reminders are automatic only).
7. **The detail is not time-aware** like the Home game-day card: no Live now or Final state, no countdown, no "Open in Maps" action beside the map, and no signal that an event belongs to a series.
8. **Forms are long single columns** with a type that changes what is relevant (opponent and home or away only for games), no preview of how many events a repeat will create, and the 52-occurrence cap is only reported after saving. Scope choices are not explained.
9. **Past is thin**: no record or season context, though `team_record` and results exist.
10. **Calendar link, Places and Opponents** are three separate ghost buttons with no explanation of why they matter.

**Existing data (do not go beyond this)**

| Element | Source |
|---|---|
| Team list and range | `team_schedule`, `team_schedule_range` (at most 100 days): event with location, opponent, RSVP counts and result; cancelled included |
| Household list and range | `household_schedule`, `household_schedule_range`: one row per child per event with that child's RSVP, team name |
| One event | `get_event`: type (game, practice, event), title, starts_at, ends_at, timezone, status, cancelled_reason, revision, series_id, location name, address, lat, lng, place id, location_text, virtual_url, opponent, home_away, arrive_early_minutes, game_format, notes, result, period scores, `is_staff` |
| RSVP | `set_rsvp` (guardian or 13+ own login), `staff_set_rsvp` (staff), `event_rsvp_summary` (going, not_going, maybe, no_reply), `event_rsvp_detail` (names and notes, staff only) |
| Results and record | `record_game_result`, `clear_game_result`, `team_record` (wins, losses, ties, games for the season label), sport configs (periods, ties, sets) |
| Create, edit, cancel | `create_event` (single or recurrence: weekdays, interval 1 to 4 weeks, count or until; cap 52 occurrences and 366 days), `update_event` and `cancel_event` with scope this, this_and_following, all; `delete_event` (refused if RSVPs or a result exist) |
| Places, opponents | `locations`, `opponents` (staff, saved per team), Places autocomplete (Edge Function) |
| Calendar feed | create, rotate, revoke feed token (shown once), status; feed has no RSVP data or player names |
| Time | `describeEventTime`, event time zone plus the viewer's zone; DST-safe recurrence |
| Maps | `mapsUrl()` and the embed helper |
| Capabilities | `schedule.view`, `schedule.manage`, `schedule.rsvpNames`, `schedule.rsvpOwn` |

**Privacy rules that stay exactly as they are**: parents, players and club admins see RSVP **counts only**; **names are staff-only**; a parent sees and sets RSVPs only for their own children (children under 13: guardian only; 13+ players: their own); club admins read only; RSVPs exist only for active rostered players; notifications and the calendar feed never contain a child's name; no medical data. Do not show payments, fees, balances or waivers anywhere on the Schedule.

---

## PROMPT

Redesign the **Schedule** (web page and mobile screen) and every feature around it, using the attached **Athleit design system** (charcoal #272A2B, electric lime #CCFF33, ice blue #E1EFF6, glass sheets, Phosphor icons, Manrope, IBM Plex Mono for counts, scores and countdowns, light and dark). Produce high-fidelity mockups for **web (desktop 1280, tablet 834)** and **mobile (iPhone 390)**. Claude Code will implement these, so every element must map to the data in the audit. No new tokens and no invented metrics. If something needs a new variant or new data, list it under "New variants needed" or "New data needed" instead of inventing it silently. Where the Home round 2 Next up card already solved something (live state, per-child RSVP, counts bar, cancelled and updated notices), reuse it.

### 1. What the Schedule is for

One place to answer "what is happening, where, and what do I need to do about it?". Parents need to know **what needs a reply** and **what is coming for each child**. Coaches and managers need to **see the shape of the week, spot gaps in RSVPs, and add or change events fast**. Everyone needs a reliable, time-zone-correct view they can also subscribe to. Not on this page: payments, fees, waivers, registrations, roster details, messages.

### 2. Views

**Web** (a segmented control, `Agenda | Week | Month`, with the range navigation and Today kept):
- **Agenda** (the default for parents and players): upcoming events grouped by day with sticky day headings ("Today", "Tomorrow", then dates), rich rows (section 3), with **Upcoming | Past** as a secondary toggle. Past shows the **record header** (W-L-T and the season label from `team_record`) above a results list (score chips, outcome icon and text); for a household, past events list without a record.
- **Week** (the default for staff): a **real week grid**, seven day columns with a time axis and events as blocks positioned and sized by start and end, type shown by icon plus colour, cancelled blocks struck through, an all-day or untimed lane if needed, today highlighted in lime, a compact RSVP summary on each block for staff. Overlapping events share the column. At 834 the week collapses to a three-day or scrolling-day layout; say which.
- **Month**: a calmer grid than today's: type dots or short chips with counts per day ("2 events"), today in lime, the picked day expanding in a side list or panel rather than a list far below; "+N more" opens that day.
- The **event drawer** (400px glass, right) stays the way to read an event without leaving the page; the full page `/events/<id>` shares the same content with more room (section 4).
- Header: "Schedule" with the team or family name, a primary **New event** for staff (the only lime action), and a quiet **More** menu holding **Places**, **Opponents** and **Calendar link** (with a one-line explanation of each).

**Mobile**: `Agenda | Month`. **Agenda** is the same grouped list with sticky day headers, a "Today" jump, **Upcoming | Past** toggle, and infinite scroll in the upcoming direction. **Month** is a compact grid with day dots, and tapping a day opens the day list in a bottom sheet or beneath the grid. No week grid on mobile; instead a horizontal week strip above the agenda lets people jump between days. A round **plus** (staff) stays top right; **Places**, **Opponents** and **Calendar link** move into a **More** sheet.

**Filters** (web toolbar, mobile filter sheet; households only where relevant): **Type** (Game, Practice, Event), **Child** (when the household has several), **Team** (when the children are on several), and a one-tap **Needs reply** for parents. Show active filters as removable chips with a clear "no results" state.

### 3. The event row (agenda, drawer lists, mobile)

Same item model on web and mobile. Keep the existing date block anchor. Each row shows: time range (start and end, in the event's zone, with a quiet "your time" only when it differs), title, **type icon and chip**, place, and for games "vs. Hawks · Home" with the result chip when a result exists. Then the **state that matters**:
- **Parents (household rows):** one RSVP chip per child ("Maya: Going", "Eli: No reply") with icon and text, and for events still open, **inline Going and Can't go quick actions** on the row that call the same RSVP action as the detail (announce as "Maya: Going"). A **Needs reply** emphasis (a calm tag, not lime) on rows with no reply. Show the team name when the household has more than one team.
- **Staff (team rows):** a compact **counts bar** (Going, Can't go, Maybe, No reply in mono with a thin stacked bar) so a coach sees the week at a glance.
- **Players 13+ and club admins:** their own chip (13+) or counts only (club admin, read-only).
- **Cancelled** (struck through with the reason, never colour alone), **Updated** (a quiet chip when `revision` is greater than 1, only if that can be known; see New data), **Series** (a small repeat icon when `series_id` exists), **Live now** (lime dot) when an event is in progress, **Final** when a result exists.

### 4. Event detail (drawer, page and mobile screen)

Same content everywhere; the drawer is the compact layout, the page and mobile screen get the wide layout.
1. **Header**: type kicker, title, and the **time-aware state** as the focal point: a countdown ("in 2 days", "in 38 min") before the event, **Live now** (lime dot) during it, **Final W 3-2** after a game with a result, "Ended" otherwise. Cancelled: struck title and a notice with the reason. Updated: a revision notice ("Time moved from 9:00 to 10:00" is only possible if the previous value is available; otherwise "The time or place changed").
2. **Where and when**: date and time range with zone and the viewer-local line; place with a **map** (wide on web page, a strip on mobile) and an **Open in Maps** action (`mapsUrl`); virtual link as a **Join meeting** action; opponent with home or away; arrive early as a human sentence ("Arrive 9:30, 30 minutes early"); notes; **series** indicator ("Part of a weekly practice series").
3. **RSVP, parents and 13+ players**: per child, big **Going** and **Can't go** pills, and a quiet **Maybe**, with the child's name and avatar, a status line announced for screen readers, optimistic update with Retry on failure. Two or more children stack cleanly. Disabled with an explanation once the event is cancelled or finished.
4. **RSVP, counts for everyone who may see them**: the proportional bar with **Going, Can't go, Maybe and No reply** (Maybe is added), in mono.
5. **RSVP, staff**: the player list with **names, status icon and text, and notes**, filterable by status (All, Going, Can't go, Maybe, No reply) and searchable; a **Set RSVP** action per player (uses `staff_set_rsvp`; mark "set by staff"); a **Nudge** action for No reply is drawn **only as a New data item** (no function sends an ad-hoc reminder today; reminders are automatic).
6. **Staff actions**: Enter or Edit result (games, once started), Edit, Cancel event, Delete when allowed (explain why it is blocked when RSVPs or a result exist: "Cancel instead").
7. Game result line with period scores when present.

### 5. Flows

Draw each on web (right sheet; a full dialog at 834) **and on mobile (bottom sheet)**. **Mobile gets Edit**, which it lacks today.
- **New and Edit event**: split into calm sections instead of one long column: **Basics** (type as a segmented control, title), **When** (date, start, end, time zone with the viewer-local hint), **Where** (in person or virtual, saved places as chips with an address search and a "Save this place" option, meeting link), **Game details** (shown only for games: opponent from saved opponents or add new, home or away, game format when the sport offers one), **Arrive early** and **Notes**, **Repeat** (weekly, weekday chips, ends after N or on a date) with a **live preview line** ("Creates 12 practices, Nov 18 to Feb 3") and the **cap** explained and enforced before saving (52 occurrences, 366 days). Editing a series asks the **scope** (**This event, This and following, All**) up front in a clear picker with plain-language effects; changing time, place or arrive-early shows "Families will be notified" (title and notes edits are silent), as the database defines.
- **Cancel**: reason required and shown to families, scope for series, a clear consequence line ("Families are told and the event stays on the schedule marked cancelled").
- **Enter result**: shaped by the sport (final score, or by period, inning or set), live validation (ties not allowed, sets add up), overtime periods, **Clear result**.
- **Places** and **Opponents** managers (list, add with address search, delete with the "in use" explanation).
- **Calendar link**: a short explanation of what it is, create, **shown once** with Copy and a QR or "Add to Apple or Google Calendar" guidance, Reset, Turn off, and states.

### 6. Scenarios to draw (web and mobile, light; dark for the two marked D)

- **A. Parent, two children on two teams, busy week** (D): Agenda with RSVP chips and inline quick actions, filter chips, a Needs reply row, a cancelled event, a game today (Live now).
- **B. Coach, team week**: Week grid with counts on blocks, a game and a practice series, New event, and the drawer open with the staff RSVP list, status filter and Set RSVP (D on web).
- **C. Month view** for parent and coach, with a picked day.
- **D. Event detail states** (web page and mobile): before (countdown), live, final with result, cancelled, updated, practice (no opponent), virtual, series, no map, two children RSVP, staff view.
- **E. Past and Results**: record header, results list, empty past.
- **F. Flows**: New event (game and practice), repeat preview and cap error, Edit with scope picker, Cancel, Result by sport (soccer final score, volleyball sets), Places, Opponents, Calendar link (before, shown once, active).
- **G. States**: loading, error with retry, empty week (staff and parent), no results after filtering, club place ("Open a team"), offline or failed RSVP with Retry.
- **H. Tablet 834**: Week and drawer-as-overlay.
- **I. Mobile equivalents** of A, C, D, E, F, G.

Use realistic content: U12 Falcons (Maya), U8 Cubs (Eli), Riverside Park Field 3, vs. Hawks, Tuesday and Thursday practices, Fall 2026, Saturday game, a rescheduled kickoff, a virtual coaches meeting, America/New_York with one event in another zone.

### 7. Deliverables
1. Artboards for the scenarios above, web and mobile, with the three web views (Agenda, Week, Month) and two mobile views (Agenda, Month) clearly labelled, and a one-line rationale for each default.
2. The **row model**: what shows for each audience and state, and the priority when several apply (live, cancelled, needs reply, updated).
3. A **visibility matrix**: rows = features (agenda, week, month, filters, inline RSVP, counts bar, names list, Set RSVP, Nudge, New or Edit, Cancel, Result, Delete, Places, Opponents, Calendar link), columns = Staff, Parent or guardian, Player 13+, Club admin.
4. **New variants needed** (week grid block, counts bar, RSVP chip, quick-action row, scope picker, repeat preview, filter chips) and **New data needed** (see below).
5. An **accessibility note**: status never by colour alone, 44px targets, grid and agenda keyboard navigation, spoken RSVP and countdown labels, live-region updates for RSVP and Realtime changes, focus return to the opening row, reduce-transparency fallback for the glass drawer and map pill.
6. Annotate each element with its data source from the audit table so implementation is a straight wire-up.

**Likely New data** (draw it, tag it, keep it out of the first build if it is not cheap): (1) an "Updated" signal per viewer on rows (needs a seen-revision per person); (2) the previous time in the revision notice; (3) a **Nudge** action that sends an ad-hoc RSVP reminder.

Constraints: no payments, waivers or roster content, no invented metrics (no attendance percentages, weather, lineups, travel time), no new tokens, no hardcoded values, mono for counts, scores and countdowns, lime reserved for the primary action and "now".

---

## Notes for the hand-off to Claude Code (not part of the prompt)
- Mobile today has no edit flow and no Places or Opponents managers; the design adds them, which is real work, and the edit scope picker already exists on web (`scope-picker.tsx`).
- Staff-set RSVP: `staff_set_rsvp` exists in the database but no client wrapper or UI; wire it after checking `packages/db/src/scheduling`.
- Shared logic (grouping, filters, needs-reply, counts bar, countdown and live state from the Home Next up state machine in `packages/core/src/next-up-state.ts`, repeat preview and cap) belongs in `packages/core` so web and mobile match, with injected-clock unit tests including DST.
- Keep test ids stable or update specs: `new-event`, `event-row`, `event-drawer`, `rsvp-controls`, `rsvp-counts`, `rsvp-list`, `edit-event`, `cancel-event`, `enter-result`, `confirm-cancel` in `apps/web/e2e/scheduling.spec.ts` and the visual gallery in `apps/web/src/app/dev/design/schedule-gallery.tsx` and `apps/web/visual/`.
- Per `docs/design-system.md`, new components or variants go into the design system first, then `tokens.contract.json`, then code.
