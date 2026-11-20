# Path inventory (coverage matrix)

Derived from the code on `buildout` (6fbdfe4): web routes under `apps/web/src/app`, mobile routes under `apps/mobile/src/app`, `docs/permissions.md`, Edge Functions and the docs listed in the README. Status values: `not run`, `pass`, `fixed`, `open defect`, `blocked`, `not testable (why)`.
Columns: W = web, M = mobile (iOS sim), S = covered by an existing spec (name), - = not applicable.

Base check: every listed feature is merged on buildout (Phase 4 payments, Phase 5 registration/forms/waivers, split payments, team subscription/billing, admin portal, support center, schedule/messages/roster redesigns, UI polish). Not yet checked: shared PageHeader (spec `page-headers.spec.ts` exists), new context switcher (`context-switcher.tsx` exists on mobile).

| # | Path (user goal) | Personas | W | M | Existing spec |
|---|---|---|---|---|---|
| 1 | Sign up (email/password) | new user | not run | not run | account, onboarding |
| 2 | Sign in, wrong password, sign out | any | not run | not run | onboarding |
| 3 | Forgot / reset password, check-email, expired link | any | not run | not run | onboarding |
| 4 | OAuth buttons | any | not testable (needs real provider) | not testable | - |
| 5 | Invite by link/code, expired/invalid invite | new, invitee | not run | not run | onboarding, phase1 |
| 6 | Join requests: create, pending, cancel, approve, decline | parent, coach | not run | not run | phase1 |
| 7 | Onboarding: parent/player/coach/club/code | new | not run | not run | onboarding |
| 8 | Returning hub, context switcher, add-a-role | any | not run | not run | home |
| 9 | Household: add/edit child, child login, guardians, birthdays | parent | not run | not run | family |
| 10 | Player claim (`/claim/[id]`) | player | not run | not run | clubs-and-logins |
| 11 | Create team, settings, sport, season | coach | not run | not run | team-details |
| 12 | Create club, affiliation, link requests | club admin | not run | not run | clubs-and-logins |
| 13 | Staff management and roles | admin | not run | - | phase1 |
| 14 | Roster: staff vs parent/player view, add/edit/remove | staff, parent | not run | not run | team-details |
| 15 | Schedule: event, game, practice, series, edit one/all, cancel, results, iCal | staff | not run | not run | scheduling |
| 16 | RSVP yes/no/maybe | parent, player | not run | not run | scheduling |
| 17 | Messaging: thread, reply, announcements, realtime, unread, mute/leave, youth-safety | staff, parent | not run | not run | messaging |
| 18 | Notifications list, preferences, quiet hours | any | not run | not run | account |
| 19 | Push delivery | any | not testable (real APNs) | not testable | - |
| 20 | Payments: Connect onboarding (test), create/publish request, per-family | staff | not run | not run | payments |
| 21 | Parent pay: success / declined / 3DS, receipts | parent | not run | not run | payments, pay-views |
| 22 | Fees absorb vs pass-on, refunds, collection view, offline payments | staff | not run | - | payments |
| 23 | Split payments / installment plans | staff, parent | not run | not run | payment-plans |
| 24 | Registration: builder, public page signed out, captcha, capacity/waitlist | staff, visitor | not run | not run | registration, registration-public |
| 25 | Forms, waivers (sign), documents upload/access | staff, parent | not run | not run | builders, waivers-documents |
| 26 | Billing: trial, subscribe via test Checkout, portal, past-due | team admin | not run | - | billing |
| 27 | Admin portal: role matrix, MFA, actions, audit; non-admin gets not-found | platform admin | not run | - | admin |
| 28 | Support center: Help, contact, requests, tokens; admin Support module | any, admin | not run | not run | help, support |
| 29 | Account: profile, password, avatar, delete account, sign out everywhere | any | not run | not run | account |
| 30 | Authorization negatives (cross-team/household/thread/payment/doc URLs and RPC) | A vs B | not run | - | - (new) |
| 31 | Cross-platform: action on web visible on mobile and back | any | not run | not run | - (new) |
| 32 | Appearance: light/dark, 360/768/1280, dynamic type, reduce motion, keyboard-only, axe | any | not run | not run | visual-app, page-headers |
| 33 | Production build starts and serves | - | fixed (D-001) | - | all |

## Personas (seed script `scripts/e2e/seed-personas.mjs`, planned)
new user; signed-out visitor; expired invite; parent (1 child / 2 children on 2 teams / household without team); player with login; coach/admin/manager; staff+parent on same team; staff on two teams; club admin + club team; team without club; platform admin; non-admin.
