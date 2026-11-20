# Claude Design prompt: Family page / screen (web and mobile)

Paste into Claude Design with the **Athleit design system** attached (the glass shells W2 for web and M2 for mobile). Grounded in the repo as of 2026-11-19
(`apps/web/src/app/(app)/family/page.tsx`, `apps/mobile/src/app/(app)/family/index.tsx`, `components/app/invite-panel.tsx`, the Join a team form in `(app)/join`, the team join code UI in `components/team/overview.tsx`, `packages/core` capabilities `family.manage` and `family.claimReview`, `docs/permissions.md`).
Same principles as the Home prompts: existing components only, every element maps to data we have, four states per section, no invented metrics.

---

## PROMPT

Redesign the **Family** page (web) and **Family** screen (mobile) of Athleit (youth sports team management), using the attached **Athleit design system** (charcoal #272A2B, electric lime #CCFF33, ice blue #E1EFF6, glass sheets, Phosphor icons, Manrope, IBM Plex Mono for codes and numerals, light and dark). Produce high-fidelity mockups for **web (desktop 1280, tablet 834)** and **mobile (iPhone 390)**. Claude Code will implement these, so every element must map to the data listed below. No new tokens, no invented metrics. If something needs a new variant or new data, list it under "New variants needed" or "New data needed" instead of inventing it silently.

### 1. What this page is for

The Family page is the household's **people page**: who the children are, and who the guardians are. It answers "who is in my family, and who can manage it?" Nothing else.

**The page contains, in this order**
1. **Page header**: household name (for example "The Hayes family"), a quiet subtitle, and the primary action **Add a child**.
2. **Children**: the heart of the page. A card per child (not a thin list row), described in section 2.
3. **Login requests** (only when a child's own-login claim is pending): Approve / Decline in place. Keep as today, restyled to match the page.
4. **Guardians**: who can manage this family, described in section 3.
5. **Invite another guardian**: described in section 4, with two ways in: a **link** and a **family code**.
6. **Have a family code?**: for a person who wants to join someone else's family with a code, section 5.

The "Children under 13 never have their own login" notice stays, but as a quiet inline note or info row inside the Children section, not a banner above everything.

**Remove completely (do not draw them, and do not leave space where they were)**
- **Next up** card (schedule). Schedule lives on Home and Schedule.
- **Amount due** card (payments). Payments live on Home and Payments.
- No RSVPs, games, times, locations, fees, balances, receipts or waivers anywhere on this page. A child card may show **team names** (membership), but never schedule or money.

### 2. Children, with content

Each child gets a **profile card** with real content, not a name and a chevron:
- Avatar (photo when `photo_path` exists, initials otherwise), full name, age ("9 years old"), taken from date of birth.
- **Team chips**, one per team the child is on, with team name and sport icon (for example "U12 Falcons", Soccer). When there are none: "Not on a team yet" with a quiet **Join a team** link to the existing Join a team flow, with this child preselected.
- A login badge with icon and text: **Has login** (success) for a child with their own login, **No login (under 13)** (neutral) for a child under 13. Nothing for a 13+ child with no login yet, except a quiet "Can have their own login" hint if it fits.
- Whole card opens the child's detail screen. A visible chevron or "View" affordance, 44px target.

Layout. Web: a responsive card grid (two across at 1280, one or two at 834) so two or three children look intentional, and a single child does not leave a hole. Mobile: a vertical stack of cards, **Add a child** as the last dashed "add" card and also in the header. Show households with **1 child, 2 children and 4 children**, and a child with two teams (chips wrap cleanly).

**Empty state** (no children yet): warm and inviting, "Add your first child. You don't need to join a team first.", with **Add a child** as the primary action, and the guardians and invite sections still visible below.

### 3. Guardians, with content

Show every guardian in this household as a row or card:
- Avatar, display name, a **You** badge on the signed-in person, and the relationship label (Guardian).
- "Guardian since Mar 2025" (from the date they joined), muted.
- A short, calm line in the section header: "Guardians can see and manage all of your children."
- Show a household with **one guardian** (just you; the section nudges toward inviting a second), **two guardians**, and **three guardians**.
- Do **not** show guardian emails or phone numbers on this page. Name only.
- Removing a guardian is **not** in scope unless it exists already. Do not draw a remove action. If you think one is needed, list it under "New variants needed".

### 4. Invite another guardian: link and code

A guardian can see and manage every child, so this section must feel trustworthy and deliberate. Put both ways in **one card with a segmented control** (**Link** | **Code**), so the page does not grow two cards:

**Link** (exists today)
- Options: expires in days (1 to 90), number of uses (1 to 1000), defaults 7 days and 1 use.
- **Create invite link** produces the link, shown once with a **Copy link** button and a **QR code**.
- Existing invites list: label, "0/1 used · expires Dec 3", status badge (Active, Used up, Expired, Revoked) and **Revoke** for active ones.

**Code** (new, modelled on the **team join code**)
- The family has one **family code**: 10 letters and numbers, shown large in **IBM Plex Mono** with **Copy** and **Share** actions, exactly like the team code in team settings.
- A **Generate new code** action, behind a confirm Sheet: "The old code stops working. People who already joined keep their access."
- Copy under it, plainly: "Someone who enters this code sends a request. They get no access until you approve." A code never grants access by itself, the same as a team code.
- **Guardian requests** list directly beneath the code (only when there are any): requester name, "wants to join the Hayes family", a short optional message, and **Approve / Decline** inline, in the same pattern as Login requests and as join requests for teams. Because approving gives access to every child, the Approve action opens a quick confirm ("Give Jordan access to Maya and Eli?") before it completes.
- States: no pending requests, one request, several requests, code just rotated (success toast), and rotate error.

Both tabs end with the same quiet reminder: "Only invite someone you trust."

### 5. Have a family code? (joining someone else's family)

For a person who has been given a code by another guardian, mirroring **Join a team**:
- A single entry row near the bottom of the page, "Have a family code? **Join a family**", that opens a **Sheet** on mobile and a dialog or inline panel on web.
- Fields: **Family code** (mono, auto-uppercase, 10 characters, with the same validation message style as the team code), optional **message** (max 500 characters). Primary button **Send request**.
- Result states: **Request sent** ("A guardian in that family will review it. You'll see the family here once they approve."), invalid code, expired or rotated code, already a guardian of that family, and too many attempts.
- Also draw this for a **person who has no family yet** (no household): the page shows an inviting empty state with two paths, **Add a child** (creates the household) and **Join a family with a code**.

### 6. Data available (do not go beyond this)

| Element | Source |
|---|---|
| Household name, context | `contexts` entry of kind `family` |
| Children list | `listChildren`: id, first and last name, date of birth, `profile_id`, `photo_path`, `team_players[]` with team id, name, sport, season label |
| Age, login badge | `ageOn`, `canHaveOwnLogin`, `profile_id` |
| Login requests | `getPlayerLoginClaims`, `decidePlayerLoginClaim`, capability `family.claimReview` |
| Invite link, list, revoke | `createHouseholdInvite`, `listInvites`, `revokeInvite` |
| Guardians | `household_members` (profile id, relationship, `created_at`), readable by guardians of the household; display name from `profiles.display_name` |

**New data needed** (flag these, do not hide them): (1) a read that returns guardian display names and joined dates for the household; (2) a **household join code** and rotate action (does not exist today; teams have `join_code` and `rotate_team_join_code`); (3) **guardian join requests** to submit, list and decide (teams have `requestToJoin` and `get_join_requests`; households do not). Design as if they will exist, and mark each element that depends on them.

Privacy rules still apply: guardians only see their own household; no guardian contact details on this page; medical, payment and waiver data never appear here; players 13+ may have their own login but cannot manage guardians.

### 7. Scenarios to draw (web and mobile, light; dark for the two marked D)

- **A. Two guardians, two children** (D): the standard page, one child on two teams, guardians list, invite card on the Link tab.
- **B. Single guardian, one child, nothing pending**: the page nudges gently toward inviting a second guardian; Code tab shown.
- **C. Pending requests** (D): one login request and two guardian requests with Approve / Decline, and the approve confirm Sheet open.
- **D. No children yet**, and **no family at all** (join with a code or add a child).
- **E. Join with a family code**: entry Sheet empty, filled, error, and Request sent.
- **F. States sheet**: children loading skeleton, children error with retry, guardians loading, invite create error, code rotate confirm, link created (shown once with QR), and the revoked or expired invite rows.
- **G. Tablet 834** of scenario A.

Use realistic content: The Hayes family, Maya (9) and Eli (6), U12 Falcons and Spring Rec League, guardians Blake and Jordan, code in the form `K7M2QX9RTA`.

### 8. Deliverables
1. Artboards for the scenarios above, web and mobile.
2. A one-paragraph rationale for how the Children cards and the Link | Code switch were chosen.
3. A **visibility note**: who sees which section (guardian, child with own login 13+, someone with no family).
4. **New variants needed** (if any) and **New data needed** as listed in section 6.
5. An **accessibility note**: status never by color alone, 44px targets, the code announced character by character for screen readers, the confirm Sheet focus order, and the segmented control keyboard behavior.
6. Annotate each element with its data source from the table so implementation is a straight wire-up.

Constraints: no schedule, payments or waiver content, no invented metrics, no new tokens, no hardcoded values, mono for codes, ages and counts, lime reserved for the primary action only.

---

## Notes for the hand-off to Claude Code (not part of the prompt)
- Remove `NextUpCard` and `DueCard` from `family/page.tsx` and `NextUpCard` from the mobile `family/index.tsx`.
- The code feature needs backend that does not exist: a household join code column, a rotate function, and a request / decide flow, ideally mirroring `join_code`, `rotate_team_join_code`, `request_to_join` and `decide_join_request`. Guardian requests must be approved by an existing guardian, because a guardian can manage all children. Put it behind a proper migration, RLS and pgTAP tests like the team equivalents. Note `accept_invite(token)` handles household links today.
- Guardian list needs a small read that returns display names for household members, since `profiles` is not otherwise readable.
- `InvitePanel` is shared (web and mobile); add the Code tab as a new variant, not a fork.
- Per `docs/design-system.md`, new components or variants go into the design system first, then `tokens.contract.json`, then code.
