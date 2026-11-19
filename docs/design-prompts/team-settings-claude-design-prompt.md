# Claude Design prompt: Team Settings hub (web and mobile)

Paste into Claude Design with the **Athleit design system** attached. Grounded in the repo as of 2026-11-18
(`apps/web/src/app/(app)/teams/[id]/layout.tsx`, `.../settings/page.tsx`, `apps/mobile/src/app/(app)/teams/[id].tsx`, `packages/core/src/capabilities.ts`, `docs/permissions.md`).

---

## PROMPT

Design a **Team Settings** section for Athleit (youth sports team management) using the attached **Athleit design system** (charcoal / lime / ice, glass sheets, mono numerals, light and dark). Produce high-fidelity mockups for **web (desktop 1280, tablet 834)** and **mobile (iPhone 390)**. Claude Code will implement these afterwards, so only use data and features that exist (listed below) and only existing components and tokens.

### 1. The problem
Team staff used to reach their management areas straight from Home through buttons: Payments, Requests, Staff, and so on. The recent Home redesign removed those buttons, and the destinations still exist but are now hard to find:
- Web: a horizontal tab strip on the team page (Overview, Schedule, Payments, Registrations, Waivers, Documents, Requests, Invites, Members, Settings). Seven or eight tabs in a row, "Settings" is only team name, sport, season, join code and club link.
- Mobile: a segmented control on the team screen with the same sections, and mobile has no clear route to Payments management from there.
Staff need one obvious place to manage the team. Treat this as an **information-architecture and navigation redesign**, not just a form page.

### 2. Concept
A **Team Settings hub** that is the home for everything staff manage, grouped by job, gated by capability, with live status badges so it also answers "what needs my attention here?".

Groups and items (each item shows only if the person has the capability; a group with no visible items disappears):

1. **Team** (`team.view` / `team.edit`): Team details (name, sport, season label), Team join code (view / rotate, `team.rotateCode`), Club link (request link by club web address, pending request, unlink, `team.requestClubLink` / `team.unlinkClub`).
2. **People** (`members.view`, `invites.*`, `joinRequests.decide`): Members (staff roles, manage `members.manage`), Invites (family invite link / QR; staff invites are link-only, `invites.createStaff`), Join requests (approve / decline, with a count badge), Player login claims for 13+ (guardian review `family.claimReview`).
3. **Money** (`payments.view`, `payments.manage`, `payments.setup`, `payments.refund`): Payment requests and collection (outstanding / collected, who has not paid for staff, send reminders), Payouts setup (Stripe Connect states: not started, in review, needs info, ready, disconnected), Fee handling (team chooses to absorb or pass on the Stripe fee), Refunds (admin only), Subscription / plan (flat monthly fee, trial status).
4. **Registration and compliance** (`registration.view`, `registration.manage`, `documents.view`): Registrations (events, capacity, waitlist, place accepted players), Waivers and compliance (status only, never signed text or medical answers), Documents (upload, staff-only flag).
5. **Preferences** (everyone with team access): Notifications for this team, Calendar feed (copy link, reset, off).

Items with a count or status show it as a badge or mono value (for example Join requests 3, Payments $240 outstanding, Payouts "Needs info", Waivers 2 missing).

### 3. Navigation (design these, show the recommended one prominently)
**Web.** Recommended: a **Team settings** entry in the sidebar when a team is the active place (gear icon), opening a page with a **left secondary nav** (the five groups above) and a content pane. Landing view is an **overview grid** of the groups as cards with badges, so it replaces the lost Home buttons. Keep the existing top-level team tabs for daily work (Overview, Schedule, Roster) and **move the management tabs into this hub**; show the reduced tab strip. On tablet the secondary nav collapses to a top segmented control or drawer.
**Mobile.** Recommended: a **Settings entry** reachable from the team screen header (gear) and from the Home place card, opening a **grouped list** (ListGroup with Phosphor icons, badges, chevrons) that pushes to detail screens. Replace the overloaded segmented control. Detail screens use the standard back header; destructive and confirm actions use Sheets.
Offer one alternative for each platform in a small "options considered" frame (for example web: settings as a right-hand sliding panel; mobile: bottom tab "Manage") with two lines on why the recommendation is better. Do not spend more than one artboard on alternatives.

### 4. Personas and scenarios (web and mobile, light mode; dark for the two marked D)
- **A. Team admin** (D): sees all five groups, with badges (3 join requests, $240 outstanding, payouts needs info, 2 waivers missing). Show the hub landing and the group navigation.
- **B. Manager**: no refunds, no member management, no staff invites, no payouts setup; can manage registrations, documents, payment requests. Show how restricted items are **hidden**, not disabled, except payouts which show read-only status.
- **C. Coach**: People limited to family invites and join requests (if allowed), Money shows collection status read-only, no Members, no Team details editing. Show the short list.
- **D. Team admin who is also a parent** (D): the hub stays about the team; show a small link "Your family settings" that goes to Family, without mixing the two.
- **E. Club admin, club-only place**: a **Club settings** variant using the same pattern: club details, team link requests (approve / decline), club-issued payments and payouts, club registrations, documents, club invites. Show the hub only; aggregates for linked teams' own registrations, no linked-team payment events.
- **F. New team, nothing set up**: hub with a **setup progress** card at the top (payouts, invite families, publish registration, add a waiver) and quiet empty states per item.
- **G. Pending and error states**: club link pending approval, payouts disconnected (badWarn Notice), email not verified banner (hard gates on taking payments, inviting people, roster placement).

### 5. Detail screens to mock (web and mobile)
Keep the content equal to what exists today and apply the new frame:
1. **Team details** and **Join code** (code in mono, Generate new code with confirm Sheet; copy that a code never grants access by itself).
2. **Club link** (empty, request form, pending, linked with Unlink confirm).
3. **Join requests** (list with Approve / Decline inline, empty state).
4. **Payments** for staff (collection summary, request list with status pills, New request, Send reminders, payouts notice).
5. **Payouts setup** (the four states plus disconnected, one primary action each).
6. **Members** and **Invites** (role labels, invite link / QR / copy / share, outstanding invites).
Other items (registrations, waivers, documents, notifications, calendar feed) get **hub entries and one representative list frame**, not full redesigns; state they reuse their existing screens.

### 6. Rules
- **Capabilities, not roles**: visibility comes from `capabilitiesForPlace` (union of roles). Show the dual-role label ("Admin · Parent") where the place is named.
- Hide what the person cannot use. Never show a disabled item to teach a hierarchy, except read-only status where the data is allowed (payouts status for coaches).
- **Privacy** (database-enforced): payment names ("who has not paid") staff only; waiver tiles show status only; no medical answers, DOB or contacts in settings; staff are added by link only; the team join code only queues a request.
- Every list and card has four states (loading skeleton, empty with a next action, populated, error with retry). Draw them once on a reference sheet.
- Components: Card, ListRow / ListGroup, Badge, Chip, StatusDot, SegmentedControl, Sheet, Button, IconButton, Notice (`warnSoft` / `badSoft`), EmptyState, TextField, Select, mono numerals for money, counts and codes, Label kickers, Phosphor icons. Lime is for the primary action only. Glass only where the system uses it (sheets, sidebar, toasts). No new tokens, no hardcoded values; list anything truly new under "New variants needed".
- Do not invent features: no roles editor beyond existing roles, no custom permissions, no analytics, no billing history beyond what exists.

### 7. Deliverables
1. **Hub landing** (web 1280, tablet 834, mobile 390) for personas A, B, C, E, F.
2. **Navigation frames**: web sidebar + secondary nav, reduced team tab strip, mobile entry points and grouped list.
3. **Detail screens** from section 5, web and mobile.
4. **Reference sheet** of states (four states, pending, error, email-not-verified) and the badge rules.
5. A **capability-to-item matrix** (rows = hub items, columns = Team admin, Manager, Coach, Parent, Player 13+, Club admin) with the capability key for each row so Claude Code can wire visibility.
6. Short **accessibility note** (status not by colour alone, 44px targets, focus order for the secondary nav, reduce-transparency fallback) and **New variants needed** list.
7. Annotate each hub item with its existing route / screen (for example web `/teams/[id]/requests`, mobile `RequestsSection`) so implementation is a re-home, not a rebuild.
