# Claude Code prompt: Family page / screen (web and mobile) and the family code

Paste into Claude Code at the repo root. Read first, plan, then build. Proceed without waiting for approval unless you hit a real contradiction.

Implement this design in this codebase:
@https://claude.ai/code/artifact/a63c1d24-9cd0-46a8-8fb0-8bc72851bebc

Read the design's files from that link. Match how it looks, using this codebase's own components and conventions.

## Design source

The design file is a Claude Design artifact containing many screens. **Only the Family files apply here.** Ignore Home, Team, Pay, Account, Documents, Waivers, Registrations and the rest. The artifact also holds `project/FamilyMobile.dc.html` and `FamilyMobileView.dc.html`, which are **Waivers and Documents mobile** boards despite the name. Do not use them for this work.

| Platform | Canvas (board index) | Views (the real markup) |
|---|---|---|
| Web | `project/Family.dc.html` | `project/FamilyWebView.dc.html` |
| Mobile | `project/FamilyScreenMobile.dc.html` | `project/FamilyScreenMobileView.dc.html` |
| Rationale, visibility, new data, accessibility, data source per element | `project/FamilyRulesView.dc.html` (screen `rules`, board Y0) | |

Web screens (`FamilyWebView`, 1280 desktop, 834 tablet): `scenA` (dark, two guardians, two children), `scenB` (light, single guardian, one child, Code tab), `scenC` (dark, pending requests and approve confirm), `kids4` (four children, three guardians), `noKids`, `noFamily`, `tablet`, the join dialog set (`joinEmpty`, `join_empty`, `join_filled`, `join_invalid`, `join_expired`, `join_already`, `join_many`, `join_sent`), and states (`childrenLoading`, `childrenError`, `guardiansLoading`, `guardians3`, `inviteCreateError`, `linkCreated`, `codeRotated`, `codeRotateError`, `rotateConfirm`).

Mobile screens (`FamilyScreenMobileView`, 390): `scenA`, `scenA2` (invite card, Link tab), `scenB`, `scenB2` (Code tab, nothing pending), `scenC`, `Csheet` (approve confirm), `kids4`, `noKids`, `noFamily`, the join sheet set (`join_empty`, `join_filled`, `join_invalid`, `join_expired`, `join_already`, `join_many`, `join_sent`), and states (`childrenLoading`, `childrenError`, `guardiansLoading`, `inviteCreateError`, `linkCreated`, `codeRotated`, `rotateConfirm`).

Read the rationale view first: it states which elements depend on data that does not exist yet (tagged NEW), and the accessibility rules (the code aria-label spells characters out, Link | Code is a tablist with arrow keys, confirm sheets are alert dialogs with focus on the title, then the primary action, and focus returning to the trigger). Treat the board markup as the visual reference for layout, spacing, copy and states, not as code to paste. Use our components, tokens and conventions. Where a board value is hardcoded, map it to the nearest token.

## 0. Read first, then write a plan

Read before planning:
- Web: `apps/web/src/app/(app)/family/page.tsx`, `apps/web/src/components/app/invite-panel.tsx`, `apps/web/src/app/(app)/join/page.tsx`, `apps/web/src/components/team/overview.tsx` (the team code UI), `apps/web/src/components/team/people.tsx` (join request approvals), `apps/web/src/app/invite/[token]`.
- Mobile: `apps/mobile/src/app/(app)/family/index.tsx`, `apps/mobile/src/app/(app)/join.tsx`, `apps/mobile/src/components/team/overview-tab.tsx`, `people-tab.tsx`.
- Core and db: `packages/core/src/capabilities.ts` (`family.manage`, `family.claimReview`), `schemas/teams.ts` (`joinCodeSchema`, `requestToJoinSchema`), `packages/db/src/api.ts` (`listChildren`, `getPlayerLoginClaims`, `createHouseholdInvite`, `listInvites`, `revokeInvite`, `requestToJoin`, join request functions).
- Database: `supabase/migrations/20260102000100_teams_and_memberships.sql` (teams `join_code`), `20260102000300_households_and_players.sql` (households, `household_members`, RLS), `20260102000600_join_requests.sql` (`request_to_join`, `decide_join_request`), `20260102000900_phase1a_gaps.sql` (`create_household_invite`, `accept_invite`, `rotate_team_join_code`), plus the pgTAP tests `fn_rotate_team_join_code`, `fn_decide_join_request`, `join_requests_rls` in `supabase/tests/database/`.
- Docs: `docs/permissions.md`, `docs/design-system.md`, `docs/design-system-additions.md`, `docs/registration-privacy.md`.

The plan must list: files to delete, files to rewrite, new migrations, new shared logic in `packages/core`, which design details have no existing component, and anything in the design that cannot be wired to data we have.

## 1. Scope

**Page content (web and mobile, same item model and ordering):** header (household name, Add a child), Children (profile cards), Login requests (when pending), Guardians, Invite another guardian (Link | Code), Have a family code? (join someone else's family). The under-13 notice becomes a quiet inline note inside Children.

**Remove completely:** `NextUpCard` and `DueCard` from the web Family page, `NextUpCard` from the mobile Family screen. No schedule, payment, RSVP or waiver content on this page. Child cards may show team names only. Delete imports and anything that only served them. Do not touch Home or those components elsewhere.

## 2. Backend (do this first, with tests)

The family code does not exist yet. Mirror the team flow so behavior is familiar and reviewable. One new migration (next timestamp after the latest in `supabase/migrations`), no edits to old migrations.

1. **Household code.** Add `join_code text` to `households`, unique, same 10-character `[A-Z0-9]` format and generator the teams use. Backfill existing households. New households get one on creation.
2. **`rotate_household_join_code(p_household_id)`.** Guardian only (`private.is_household_guardian`). Returns the new code, writes an audit row like `rotate_team_join_code`. Same grants pattern (revoke from public, anon, authenticated; grant to authenticated).
3. **Guardian requests.** Table `household_join_requests` (id, household_id, requester profile_id, optional message max 500, status pending / approved / declined / cancelled, decided_by, decided_at, created_at), with RLS: the requester reads their own, guardians of the household read theirs, nobody writes directly. Unique pending request per (household, requester).
4. **`request_to_join_household(p_code, p_message)`.** Any signed-in user. Uppercases and trims the code, rejects unknown, rotated, own-household and already-a-member cases with the same non-leaky error style as `request_to_join`, and rate limits attempts the way team code attempts are limited (follow `request_to_join`; if it has no limit, add a small per-user limit and say so in the PR).
5. **`decide_household_join_request(p_request_id, p_approve)`.** Guardian only. Approve inserts into `household_members` as guardian and notifies the requester through the existing notification path; decline closes it. Audit both. Idempotent on double decisions.
6. **`get_household_join_requests(p_household_id)`.** Guardian only. Returns requester display name and message, never email.
7. **`get_household_guardians(p_household_id)`.** Guardian only. Returns profile id, display name, relationship, `created_at`, and whether it is the caller. No email or phone. (`profiles` is not otherwise readable, which is why this is a function.)
8. **pgTAP tests** for each function and the RLS: guardian can, non-guardian cannot, requester cannot decide their own request, approve creates membership and a guardian then sees every child, rotate invalidates the old code, bad and used codes, duplicate pending request, rate limit.
9. Regenerate `packages/db/src/database.types.ts`, add typed wrappers to `packages/db/src/api.ts` (`rotateHouseholdJoinCode`, `requestToJoinHousehold`, `getHouseholdJoinRequests`, `decideHouseholdJoinRequest`, `getHouseholdGuardians`), and add `householdJoinCodeSchema` (reuse `joinCodeSchema` shape, message "Family codes are 10 letters and numbers") plus request schemas to `packages/core`.
10. Update `docs/permissions.md` (new rows and the function list) and `docs/registration-privacy.md` if guardian data handling is described there.

Privacy: a code never grants access by itself, only queues a request. Guardian lists show names only. A pending requester sees nothing of the household. Members cannot be removed in this change.

## 3. Page, web and mobile

Match the design boards for layout, copy and states; use existing components first.

- **Children cards:** avatar (photo from `photo_path` when present), name, age via `ageOn`, team chips from `team_players`, **Has login** or **No login (under 13)** badge via `profile_id` and `canHaveOwnLogin`, "Not on a team yet" with a Join a team link that preselects the child (`/join?player=<id>`, which already works). Whole card links to `/family/children/[id]`. Web: responsive card grid with no half-empty row for odd counts. Mobile: stacked cards, add-child card at the end. Empty state per the design.
- **Login requests:** keep behavior (`getPlayerLoginClaims`, `decidePlayerLoginClaim`, gated by `family.claimReview`), restyle only.
- **Guardians:** from `getHouseholdGuardians`: avatar, display name, **You** badge, relationship, "Guardian since" date. Loading, error with retry and the one-guardian nudge states. No remove action.
- **Invite another guardian:** extend the **shared** `InvitePanel` (web and mobile) with a `Link | Code` segmented control for household targets only; team and club invites are unchanged. The Link tab is today's behavior untouched. The Code tab shows the household code in mono with Copy and Share, a **Generate new code** action behind a confirm Sheet (copy from the design), the "code only sends a request" explanation, and the **Guardian requests** list with inline Approve / Decline. Approve opens a confirm first ("Give <name> access to <children>?") using the household's children names. Gate everything with `family.manage` and the household guardian check, same as the current invite card.
- **Have a family code?:** entry row opening a Sheet (mobile) or dialog (web) with the code field (mono, uppercase, `householdJoinCodeSchema`) and optional message, calling `requestToJoinHousehold`; states: sending, request sent, invalid, expired or rotated, already a member, too many attempts. Also render it as one of the two paths in the no-household empty state (with Add a child). Do not add a new top-level route unless the design needs one; if you do, add it to navigation tests.
- If a design detail has no existing component, build it from existing primitives, and if it truly needs a new variant add it to `packages/tokens` or the shared UI layer as `docs/design-system.md` describes and list it in `docs/design-system-additions.md`.

## 4. Conventions

Phosphor icons through our wrappers, Manrope for UI, IBM Plex Mono for codes, ages and counts, light and dark from tokens, no hardcoded colors or sizes, lime only for the primary action, glass only where the system already uses it. 44px minimum targets. Status never by color alone. Code announced character by character to screen readers. Web and mobile stay consistent in copy, ordering and states. Reuse `friendlyError`, `LoadState`, `FormMessage`, `Badge`, `Sheet`.

## 5. Verification

- `pnpm` typecheck, lint, unit tests and the database tests (pgTAP) pass.
- New Vitest coverage for the schemas and any shared view-model logic (guardian ordering with "You" first, team chip and badge rules, code formatting).
- Playwright + Axe specs for: parent with two children sees cards and no schedule or payment content; guardian creates a link (unchanged) and sees the Code tab; rotate with confirm; a second user enters the code, the first guardian sees the request and approves it, and the second user now sees the children; decline path; bad code error; no-family empty state. Update `apps/web/e2e/` helpers and visual baselines in `apps/web/visual/`, and the mobile screenshots, light and dark.
- Compare your screenshots with the design boards (`scenA`, `scenB`, `scenC`, `kids4`, `noKids`, `noFamily`, `tablet`, the join set and the states, web; `scenA` through `noFamily`, the join set and the states, mobile), light and dark as drawn, and list every visible difference you chose to leave.
- Run the code review you would want before merging and fix what it finds. Check specifically that no query path lets a non-guardian read requests or guardians, and that approving cannot be done by the requester.

## 6. Delivery

One commit per logical step (migration and tests, db wrappers and schemas, shared InvitePanel, web page, mobile screen, docs). Open a PR with: summary, migrations, new functions and their grants, files removed, design-to-component mapping, screenshots next to the design, test results, and a **list of anything you were unsure about, deferred, or that disagrees with the design**. Do not claim something works unless you ran it.

## Decisions already made

1. A family code only queues a request. An existing guardian approves. Joining is never automatic.
2. Link invites stay as they are.
3. No guardian removal, no emails or phone numbers on this page, and no schedule or payments content here.
4. The code mirrors the team join code (10 characters, rotate with confirm), and the backend mirrors the team join request flow.
