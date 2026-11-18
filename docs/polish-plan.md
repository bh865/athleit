# Polish plan: Items 3 and 4 (not started; wait for approval of the context-switcher proposal)

Both depend on the place/capability model in [context-switcher-proposal.md](context-switcher-proposal.md).

## Item 3: web Home dashboard ("1c Web Dark Home" and light counterpart)

Approach: `/` renders a dashboard instead of redirecting. Uses the shared `PageHeader` (greeting, today's date, primary action pill).

- **Next up card** (large): kicker, title, time and location (mono counts for RSVP), decorative location tile with a pin icon, no
  drive time, an "Open in Maps" link (`https://maps.apple.com/?q=` or Google, opened in a new tab), no embedded map. Staff variant: RSVP counts via
  `next_up`/`event_rsvp_summary`. Parent variant: Going / Can't go buttons (existing `RsvpControls`) plus amount due. Both capabilities: both.
- **Three cards:** Messages (recent threads, unread dot), Payments (outstanding total in mono, progress bar, collected of total),
  Roster (count, active/pending, avatar stack from `get_team_roster`).
- Capability-driven blocks (`schedule.rsvpOwn`, `payments.pay`, `payments.view`, `roster.*`); no kind checks.
- Files: `app/(app)/page.tsx`, new `components/home/*`, reuse `payments/home-cards.tsx`, `schedule/next-up-card.tsx`; gallery section; visual baselines.
- Tests: component tests per variant (staff, parent, both, no team); e2e for each; visual baselines light/dark.

## Item 4: Roster (web and mobile)

- Web `/roster` (sidebar item "Roster"), mobile Roster screen under More; both read the active place's team.
- Staff (`roster.viewFull`): full list with status, guardian contacts (`get_guardian_contacts`), jersey, position, add/edit, and the approved-child
  placement card moved from the team page. Others (`roster.viewLimited`): `get_team_roster` only (first name, jersey, position). No new data
  exposure; RLS unchanged.
- Team page becomes an overview linking to Roster.
- Files: web `app/(app)/roster/page.tsx`, `components/roster/*`, move parts of `teams/[id]/page.tsx`; mobile `app/(app)/roster.tsx`,
  `components/team/roster.tsx` reuse; sidebar/More entries.
- Tests: unit for visible-field selection by capability; e2e parent sees first name/jersey/position only, staff sees full; mobile manual steps.
