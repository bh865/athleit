# Context switcher: proposal

Status: **proposal, not implemented.** Waiting for approval (see "Questions").

## 1. How it works today

**Model** (`packages/core/src/context.ts`). `buildContexts()` makes one `AppContext` per **role**:

- one `family` context per household (`key = family:<householdId>`, role `guardian`),
- one `team` context per team membership row (`key = team:<teamId>:<role>`),
- one `club` context per club membership row (`key = club:<clubId>:<role>`).

A user who is Admin and Parent of the same team has **two** team contexts for it, plus the family context: the three rows in the
reported switcher. `capabilitiesFor(ctx)` maps `kind:role` to capabilities (`capabilities.ts`, mirror of `docs/permissions.md`).
`capabilitiesForPlace(contexts, kind, id)` already unions the capabilities of all roles in one place; most _detail_ pages
(`teams/[id]`, `clubs/[id]`, team payments) already use it, because they are addressed by URL, not by the active context.

**Active context.** `AppProvider` (web `components/app/app-provider.tsx`, mobile `lib/app-provider.tsx`) loads contexts, stores the
last-used key (`localStorage["athleit.context"]` on web, `kv` on mobile), and `pickContext()` falls back to the first context
(families first) when the key no longer exists. `setActive(key)` is called by the switcher, by create team/club/child flows and by
invite acceptance (`family:<id>` or `<kind>:<id>:<role>`).

**Navigation.** `contextPath(ctx)`: family → `/family`, team → `/teams/<id>`, club → `/clubs/<id>`. Web `/` redirects to
`contextPath(active)`; mobile Home lists places. The switcher calls `router.push(contextPath(c))`. "Add a role"
(`addRoleActions`) is only reachable from inside the switcher: Add a family (only when no household), Create a team, Create a club,
Join a team.

**Screens that depend on the _active_ context** (the risky ones):

| Screen                                                          | Web                                                                   | Mobile                                                    | Decided by                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Home                                                            | redirect to `contextPath(active)`                                     | places list                                               | active key                                                                                          |
| Schedule                                                        | `active.kind` family→household feed, team→team view, club→empty       | `active.kind === 'family'` → household else team          | **kind**                                                                                            |
| Pay                                                             | `PayView` always (parent view only; staff via `/teams/[id]/payments`) | `active.kind` team/club → **StaffScreen**, else PayScreen | **kind** (the bug behind "No payment requests yet": parent in a team context gets the staff screen) |
| Messages list / new                                             | `active.kind === 'team'` → that team; staff test uses `active.role`   | same                                                      | **kind + role**                                                                                     |
| Conversation                                                    | `contexts.find(kind team, id)` → first role found decides `isStaff`   | same                                                      | first matching role (wrong for Admin + Parent when Parent is found first)                           |
| Sidebar / tab bar                                               | items from `contexts.some(kind)`                                      | same                                                      | kind presence                                                                                       |
| Team page, members, requests, schedule tab, payments, club page | URL id + `capabilitiesForPlace`                                       | same                                                      | capabilities (good)                                                                                 |
| Family, add child                                               | `contexts.find(kind family)`                                          | same                                                      | kind presence                                                                                       |
| Notifications, settings                                         | user-scoped                                                           | user-scoped                                               | none                                                                                                |

Everything keyed on `active.kind`/`active.role` breaks for dual-role users; everything keyed on `capabilitiesForPlace` works.

## 2. What comparable products do

I searched current help centers; not everything was findable (SportsEngine, GameChanger, Slack, Linear and Notion help pages did not
come back; their behaviour below is stated only where a source supports it).

- **TeamSnap** ([switching profiles](https://helpme.teamsnap.com/article/492-switch-profiles-on-a-team),
  [roles from the login dashboard](https://helpme.teamsnap.com/article/831-selecting-roles-from-your-login-dashboard)): one login, a
  dashboard listing roster _profiles_ (roles) per team; switching is per-profile ("Viewing as"), i.e. role-switching inside a place. It
  mitigates the pain with a rule that **a team admin can set availability for any player**, so an admin with a second profile does
  not need to switch just to act as a parent.
- **Other sports platforms** ([Sprocket Sports multi-club](https://help.sprocketsports.com/en/articles/13863329-multi-club-users-switching-between-clubs),
  [SwimCloud team switcher](https://support.swimcloud.com/hc/en-us/articles/46284330841747-How-to-Switch-Between-Your-Teams),
  [TeamSportsAdmin user types](https://coaches-support.teamsportsadmin.com/support/solutions/articles/16000061671-as-a-coach-how-do-i-switch-user-types-within-my-account-)):
  switch the **place** in a top-corner team switcher; switching "user type" exists but is a separate, secondary control.
- **General account/workspace switchers** ([SaaS workspace-switcher patterns](https://www.saasui.design/blog/saas-workspace-organization-switcher-ux-patterns),
  [pattern library](https://pattern-playground.onrender.com/patterns/workspace), and long-standing desktop precedent such as
  [GNOME](https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/3739) / [Launchpad](https://code.edge.launchpad.net/bugs/506944) bugs):
  the switcher is **a place picker**, it stays quiet for a single place (identity shown, no "switch" affordance, no empty list), and
  "create / join another" lives at the bottom of the picker or in the account menu. Roles show as labels, not as separate entries.

Takeaways: switch places, not roles; show roles as labels; no dropdown when there is nothing to switch; "add another" must remain
reachable for single-place users; let a person who holds two roles in one place act in both without switching.

## 3. Options

### A. Keep per-role contexts, de-duplicate the display only

Group rows by place visually but keep keys and role-specific active context.

- (+) Almost no code change, keys stay valid.
- (−) Does not fix the actual bug class: screens still pick behaviour from one role. Switching "role" remains a concept users must learn.

### B. Contexts are PLACES; capabilities are the union of roles (recommended)

- A context is a **team**, a **club**, or the **household**. Key: `team:<id>`, `club:<id>`, `family:<id>`.
- `AppContext.roles: ContextRole[]` (all of the user's roles there); `capabilities` = union (`capabilitiesForPlace` generalised).
  Label: "Admin · Parent" (`rolesLabel`).
- Switcher: **0 places** → "Get started" CTA; **1 place** → static header (name, roles label, no caret, no menu); **2+** → dropdown
  of places only (single-select, role label as subtitle).
- "Add a team / club / family / Join a team" moves to the **account menu** (a footer button on web sidebar / the More sheet on mobile) and to
  the bottom of the switcher menu when it exists. It therefore exists for single-place users.
- Households: see below.
- Screens choose **sections by capability** (`payments.pay` → "My payments", `payments.view|manage` → "Team collection"; RSVP
  controls for own children via `schedule.rsvpOwn` next to staff counts).

### C. Role-agnostic "My Athleit" with no active context

Remove the active context entirely; everything is a cross-place feed (all teams on Home, one schedule, one pay list).

- (+) Fits multi-team parents best long term.
- (−) Large redesign (messages and schedule need per-team filtering, Home dashboard design is per-team); not what the design files show.

## 4. Recommendation: B

**Household / "Blake family".** It is a **place** with its own key (`family:<id>`), shown in the switcher only when the user also has a
team/club place. A parent whose child is on the team gets the family stuff _inside_ the team place as capabilities
(`schedule.rsvpOwn`, `payments.pay` via household), not by switching to the family. Concretely: the household is always reachable via
the **Family** nav item (it is user-scoped, like Alerts), so it does not need to be a switcher entry at all when the user has any
team. Rule: switcher lists teams and clubs; the family entry is listed **only when the user has no team or club** (then it is the single
place and the static header). This yields exactly one option for the reporter (Athleit FC: "Admin · Parent").

**Household but no team yet:** one place (the family) → static header, Home shows "Join a team" / child setup cards.

**Persisted key migration.** Old keys `team:<id>:<role>` / `club:<id>:<role>` map to `team:<id>` / `club:<id>` by stripping the
role segment in `pickContext`; `family:<id>` is unchanged; unknown keys fall back to the first place. No storage migration step.

**Deep links.** URLs are already place-addressed (`/teams/<id>`, `/clubs/<id>`, `/events/<id>`, `/messages/<thread>`); opening one
should set the active place to the owning team (small effect in the team layout) so the header matches the page. Invite acceptance
sets `team:<id>`.

**Per-screen behaviour (staff + parent):**

| Screen   | Behaviour                                                                                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home     | Team place: next-up with staff RSVP counts _and_ Going / Can't go for the user's own children; Payments card shows "You owe" (guardian) and collection (staff); Roster card if `roster.viewLimited`. |
| Roster   | Full view when `roster.viewFull`, otherwise limited.                                                                                                                                                 |
| Pay      | Segments **My payments** (`payments.pay`) and **Team collection** (`payments.view/manage`); a single-capability user sees one view without segments.                                                 |
| Messages | Place's threads; staff controls by `isStaff` computed from the union of roles in that place (fixes the first-role bug).                                                                              |
| Schedule | Team schedule; per-child RSVP uses household children rostered on that team; staff get manage controls by `schedule.manage`.                                                                         |

**Wireframes**

```
Single place (static)            Multiple places (dropdown)
┌──────────────────────┐         ┌──────────────────────┐
│ Athleit FC           │         │ Athleit FC         ⌃⌄│
│ Admin · Parent       │         │ Admin · Parent       │
└──────────────────────┘         ├──────────────────────┤
                                 │ ✓ Athleit FC         │
Account menu (bottom of sidebar) │   Admin · Parent     │
┌──────────────────────┐         │   River Club         │
│ Blake H.        ⌃    │         │   Admin              │
│  + Add a team        │         ├──────────────────────┤
│  + Add a club        │         │ + Add a team / club  │
│  + Join a team       │         └──────────────────────┘
│  + Add a family      │
│  Sign out            │
└──────────────────────┘
```

**Affected files:** `packages/core/src/context.ts` (+ tests), `capabilities.ts` (`capabilitiesFor(context)` uses `roles`),
web/mobile `app-provider`, both `context-switcher`s, sidebar/tab bar (account menu), `schedule`, `pay`, messages list/new/conversation,
invite acceptance, create team/club/child flows (`setActive` keys), `docs/permissions.md` notes, gallery fixtures.

**Migration plan:** (1) core: `roles`, key change, `pickContext` legacy-key mapping, tests; (2) providers; (3) switcher UI + account
menu; (4) screens by capability (the Pay/Schedule/Messages fixes already ship in this branch and stay valid); (5) e2e for
single-place, multi-place, dual-role; (6) remove dead per-role code.

**Tests:** unit — `buildContexts` merges roles, label "Admin · Parent", legacy key mapping, no household entry when a team exists,
union capabilities; component — switcher renders static header for 1 place and a menu for 2+; e2e — admin+parent on one team sees one
header with no menu, can reach "Add a team" from the account menu, Pay shows both segments; mobile manual steps.

## Questions

1. Should the household ever appear in the switcher beside teams (I recommend not: reachable via Family nav)?
2. Is "Admin · Parent" the label you want, or highest role only?
3. Do you want the "add" actions in the account menu (recommended) or a "+" button in the header?
4. Multi-team parents: is "one active team at a time" acceptable for now (Option C is the long-term direction)?
