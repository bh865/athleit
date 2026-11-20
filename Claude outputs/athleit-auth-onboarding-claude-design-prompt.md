# Claude Design prompt: Sign in, create account, and first-run onboarding (web and mobile)

Paste into Claude Design with the **Athleit design system** attached (glass shells W2 for web and M2 for mobile). Grounded in the repo as of 2026-11-20
(`apps/web/src/app/(auth)/*`, `apps/web/src/components/auth/*`, `apps/web/src/app/auth/callback`, `apps/web/src/lib/supabase/proxy.ts`, `apps/web/src/app/invite/[token]`, `apps/web/src/app/claim/[playerId]`, `apps/web/src/app/(app)/page.tsx`, `apps/web/src/app/(app)/join`, `family/children/new`, `teams/new`, `clubs/new`, `apps/mobile/src/app/sign-in.tsx`, `sign-up.tsx`, `_layout.tsx`, `apps/mobile/src/components/auth/auth-form.tsx`, `apps/mobile/src/lib/auth.tsx`, `apps/mobile/src/app/(app)/index.tsx`, `packages/core/src/schemas/auth.ts`, `packages/core/src/context.ts`, `supabase/config.toml`, `docs/permissions.md`).
Same principles as the Home, Family, Roster, Schedule and Messages prompts: existing components only, every element maps to data and functions we have, four states per screen, no invented metrics. **Priority: mobile first.** The first minute in the app decides whether a parent or coach stays, so this must feel as smooth and familiar as signing up for any app they already love.

---

## Audit: what we have today

### Sign in and create account

**Web.** Routes `/sign-in` and `/sign-up` share one layout: the lockup logo above a single card. Sign in: heading "Sign in", fields Email and Password, a lime "Sign in" button, an "or" divider, two secondary buttons "Continue with Google" and "Continue with Apple", and "New here? Create an account". Create account: heading "Create your account", fields **Your name**, Email, Password (hint "At least 8 characters"), a "Create account" button, the same social buttons, and "Already have an account? Sign in". The `next` link target (an invite or a deep link) is carried between the two pages so the person returns where they were going. Errors from the sign-in action are **the raw backend message** (for example "Invalid login credentials"), shown as a red line under the fields; field errors come from `signInSchema` and `signUpSchema` (email format, name required, password 8 to a maximum length).

**Mobile.** `sign-in` is the app's anchor screen (signed-out visitors land directly on it), and `sign-up` is a second screen. Same card layout, the same fields and the same social buttons ("Continue with Google" opens the browser for OAuth and returns through a deep link; "Continue with Apple" does the same, not the native Apple sheet). A signed-out deep link to an invite or claim page stores a pending target and resumes it after sign-in.

**What is missing or weak (the redesign should solve these)**
1. **No "Forgot password?"** anywhere. There is no reset request, no reset email screen and no "set a new password" screen. A parent who forgets a password is locked out unless they signed in with Google or Apple.
2. **Email confirmation is a single line** ("Check your email to confirm your account, then sign in.") under the form, easy to miss, with the email not shown, no Resend, no "open your mail app", no "wrong email, change it", and no clear way back after the link is tapped. (Local development auto-confirms; hosted projects do not, so most real users meet this screen.)
3. **Password fields are bare**: no show or hide, no strength guidance while typing (the app already has `passwordStrength` for the account settings screen), no caps lock hint. Only "At least 8 characters" is said.
4. **Errors are raw** and inconsistent (backend text on a failed sign-in, nothing special for "this email already exists", "too many attempts", "no connection", or "you signed up with Google, use that").
5. **Social buttons sit below an "or" divider**, so the common one-tap path (Apple on iPhone, Google on Android and web) is the least prominent. They always render (the code notes the providers need real credentials in the backend config, so a button can fail where one is not set up), and a cancelled social sign-in just returns to the form with no message.
6. **No consent or age line.** Nothing links Terms or Privacy at sign-up, and nothing says who may create an account (children under 13 never have a login; parents manage them; players 13 and older can sign in themselves).
7. **No context when arriving from a link.** Someone who taps an invite ("Join U12 Falcons as a parent") sees a generic Sign in page with no hint of why, and the invite page itself only appears after sign-in. Same for a player's claim link.
8. **Mobile is a form in a card**, not a welcome: no brand moment or first impression, a vertically centred form that has not been checked against the on-screen keyboard (confirm on a device), and no biometric re-entry for returning users.
9. **No session-ended state** ("You were signed out. Sign in to continue") and no offline or server-error state.

### Onboarding: what a signed-in person with no team, club or family sees

Today, a person with no places sees **"Welcome, <name>"** and one line, "How will you use Athleit? You can add more roles any time.", then up to four stacked buttons, the first one lime:
1. **Add my child** (also creates the family),
2. **Create a team**,
3. **Create a club**,
4. **Join a team with a code**.
It is the same on web and mobile. Each button goes to a separate plain form page (Add a child: first name, last name, date of birth; Create a team: name, sport, season, optional club web address; Create a club: name and web address; Join a team: team code, which child it is for, optional message). Nothing connects these pages into a flow.

**What is missing or weak**
1. **Role jargon, not intent.** "Add my child" vs "Create a team" vs "Join a team with a code" assumes people know which one they are. A parent whose coach said "go sign up" does not know whether to add a child, join a team, or both.
2. **No explanation or order for parents.** The usual path is: add each child, then join the child's team with the coach's code (which sends a request that staff approve). The app shows these as unrelated buttons, and after adding a child it drops the person on the Family page with no "next: join their team".
3. **No place to enter a family code** here, though a second guardian joining an existing household is a common first-run (the family code lives inside Family, which a new person cannot reach).
4. **No "waiting for approval" state.** After sending a join request, the person returns to the same Welcome screen with no sign anything happened. A pending requester cannot see the team (by design), but the app can still say "Request sent, we'll tell you when it's approved".
5. **Coach and club paths end abruptly.** Creating a team lands on the team page; there is no "invite your parents" step, no share link or QR in the flow, no "add your first practice". (There is a setup checklist tile on the team Home once a team exists.)
6. **No path for a player 13 and older** (who joins by a link their parent or coach gives them) or for someone who has an invite link but opened the app first.
7. **No permission moment for notifications** at the point it makes sense (after joining a team), and no explanation of why it matters (practice moved, game day).
8. **Returning people with no place** (left a team, removed from a roster) see the same new-user Welcome.

### Entry points that must keep working
Invite link or QR (`/invite/<token>`, team, club or family), a player's claim link (`/claim/<playerId>`), a team code and a family code, a public registration link (`/r/...`, `/register/verify`) that has its own flow, OAuth callbacks (`/auth/callback`), and mobile deep links (`auth/callback`, a stored pending invite). Do not redesign registration; only make sure these arrive well.

### Existing data and functions (do not go beyond this)

| Element | Source |
|---|---|
| Sign in, create account | email and password (`signInWithPassword`, `signUp` with `display_name` read by the profile trigger), minimum 8 characters |
| Social | Google and Apple through browser OAuth and `exchangeCodeForSession` (needs provider credentials in the backend config) |
| Redirect after auth | `next` on web (same-site only); pending target stored on mobile (`PENDING_INVITE_KEY`) |
| Email confirmation | on for hosted projects, off locally; confirmation link returns through `/auth/callback` |
| Password strength | `passwordStrength` and `changePasswordSchema` in core (used in Account, Security) |
| Account has a password or only a provider | `hasPasswordMethod` |
| Places a person has | `buildContexts`: family, team, club; `addActions` (Add family only when none; Create team; Create club; Join team) |
| Add a child | `addChild` (first name, last name, date of birth; creates the household if none) |
| Create team, create club | `createTeam` (name, sport, season, optional club request), `findClub`, `createClub` |
| Join with a team code | `requestToJoin` (code, child, message; staff approve) |
| Join with a family code | `request_to_join_household`: a code never grants access; a guardian approves; outcomes `sent`, `invalid_code`, `already_member`, `too_many_attempts` |
| Invite preview and accept | `previewInvite`, `acceptInvite` (team, club or household; role shown) |
| Player login link | `claimPlayerLogin` (approved at once if the email matches, otherwise the guardian approves) |
| Team setup checklist | the existing Home setup tile |
| Push permission | `register_push_device` after the person allows notifications |

**Rules that stay exactly as they are**: a join code only sends a request, staff or a guardian approve it, and the requester sees none of the team or household until approved; children under 13 never have a login; the date of birth stays out of sign-up; no medical data; nothing about other families is ever shown. Do not show payments, fees, schedules or rosters during onboarding.

---

## PROMPT

Redesign the **sign-in, create-account and first-run onboarding** experience for web and mobile, using the attached **Athleit design system** (charcoal #272A2B, electric lime #CCFF33, ice blue #E1EFF6, glass sheets, Phosphor icons, Manrope, IBM Plex Mono for codes and numerals, light and dark). Produce high-fidelity mockups for **mobile (iPhone 390) first**, then **web (desktop 1280 and tablet 834)**. Claude Code will implement these, so every element must map to the functions and data above. No new tokens and no invented metrics. If something needs new data, a new backend function or a native module, list it under "New data needed" or "New variants needed" instead of inventing it silently.

### 1. Principles

- **Familiar, fast, calm.** The first screens should feel like the best consumer apps: one clear action, social sign-in prominent, short forms, no jargon, nothing the person has to read twice.
- **Ask for intent, not roles.** Onboarding asks "What brings you here?" in plain words and takes people to a short, focused path, not a menu of forms.
- **Context first.** When someone arrives from an invite, a claim link or a code, say who invited them and what they are joining before asking for anything.
- **Say what happens next.** Every step ends in a clear state: what was sent, who approves, when they will be told.
- **Trust.** Plain explanations of privacy (children's information is never shared with other families), no dark patterns, errors in friendly words.
- Lime only for the primary action and "now". Status never by colour alone. 44px targets.

### 2. Sign in and create account

**Mobile.**
- **Welcome (first launch, signed out)**: the logo moment on a calm glass-over-charcoal background (reuse existing surfaces, no new illustration assets), a one-line promise ("Your team, your family, one place."), and three buttons in this order: **Continue with Apple** (primary on iPhone) or **Continue with Google** (on Android), the other social option, and **Continue with email**. Below: "I have an invite or a code" as a quiet link that goes to the code and invite path (section 4), and Terms and Privacy links. Returning users who tap "Sign in" go straight to the email sign-in form.
- **Sign in with email**: a single screen with Email, Password (show or hide toggle, autofill and password-manager friendly, caps-lock hint), a clear **Forgot password?** link, the Sign in button, and a quiet "New here? Create an account". The keyboard never covers a field (the form scrolls and the primary button stays reachable above the keyboard). Optional returning-user shortcut: "Use Face ID" (see New data).
- **Create account**: the shortest honest form, **Your name, Email, Password** with a live strength meter and rule line (min 8 characters) and show or hide, then a single consent line ("By continuing you agree to the Terms and Privacy Policy. You must be 13 or older. Parents create accounts for children under 13."), and **Create account**. Social buttons stay above, as on Welcome.
- **Check your email** (the confirmation screen, replacing the one-line message): the email shown, an **Open mail app** button, **Resend email** with a cooldown timer, **Use a different email**, and a "Didn't get it? Check spam" hint; it updates and continues automatically when the link is tapped.
- **Forgot password** (three screens): request (email, **Send reset link**), sent (generic wording that does not reveal whether the email has an account, with Resend), and **Set a new password** (opened from the link: new password with strength and show or hide, confirm, **Update password**, then a success state that signs the person in or sends them to sign in).
- **Account exists with a different method** and **social cancelled** states: "This email is already registered. Sign in with Google" with the right button, and a quiet "Sign-in was cancelled. Try again."
- **Errors, in friendly copy** (draw a small copy table): wrong password, no such account (without confirming it), email already in use, weak password, too many attempts (with a retry time), no connection, server problem, link expired.
- **Signed out in the app**: "You were signed out. Sign in to continue" with the email prefilled where known.

**Web.** The same flows. On desktop a **two-pane layout**: a quiet brand pane (logo, the promise, three short reassurances such as "Free for families", "Your child's information is never shared with other families", "Approved by your coach") beside the form pane; on tablet and narrow widths a centred card like today. Same screens as mobile (sign in, create account, check your email, forgot, reset, social states, errors, signed out), plus a **link-arrival banner** variant (section 3).

### 3. Arriving from a link (invite, claim, registration)

A banner at the top of Sign in and Create account (web and mobile) that states the context before any form: "**Maya's coach invited you** to join **U12 Falcons** as a **parent**" (name and role from the invite preview; see New data), or "You're linking your player login", with the same two choices: **Create an account** or **I already have an account**. After auth the person goes straight to accepting; the existing landing page then confirms. If the invite is invalid or expired, show the existing plain explanation before asking for a login. A signed-in person who opens a link sees **Continue as <name>** and a quiet "Not you?".

### 4. Onboarding: the first-run flow

Replace the stacked-button Welcome with a short, friendly flow. It appears whenever a signed-in person has no family, team or club (and a calmer version for returning people with no place).

**Step 0, "What brings you here?"** (mobile: full screen with large tappable cards; web: a centred card with the same cards). One question, five choices, each with a one-line description and an icon:
1. **I'm a parent or guardian**: "Add your child and join their team."
2. **I coach or manage a team**: "Create a team and invite families."
3. **I run a club or league**: "Group teams under one club."
4. **I'm a player (13 or older)**: "Use the link from your parent or coach."
5. **I have a code or an invite**: "Join a team or family you've been invited to."
A quiet "Skip for now" is allowed only where it does not strand the person (it leads to an honest empty Home).

**Parent path** (progress dots, 3 steps): (a) **Add your child** (first name, last name, date of birth; the line "Children under 13 never have their own login. You manage everything for them."; an **Add another child** option); (b) **Is your child on a team?** with two choices, **Enter a team code** (code in mono, which child it is for, optional message to the coach) and **Not yet** ("You can join a team later from Home"); (c) **Request sent**: a calm confirmation card that explains the next step ("The team's staff will review it. You'll get a notification when they approve. Until then you can't see the team's information."), a **Done** action, and an optional **Join a family instead** link for a second guardian (a family code, with the existing outcomes: sent, invalid code, already a member, too many attempts, each with friendly copy). Children can be added in a loop; each team code request names one child.

**Coach or manager path** (4 steps): (a) **Create your team** (name, sport as a visual picker from the sport list, season label with a sensible default, optional "Is your team part of a club?" with the web address); (b) **Invite your families**: the team's invite link and code with **Copy**, **Share** and **QR**, and the sentence that explains approval ("Parents send a request; you approve each one."); (c) **Add your first practice or game** (optional, uses the same fields as the Schedule's New event, collapsed, with "Do this later"); (d) **You're set**: a short checklist handoff (Invite families, Add schedule, Add roster) that lands on Home with the existing setup tile. Any step can be skipped.

**Club path** (3 steps): (a) **Create your club** (name, web address with a live availability hint); (b) **Bring in your teams** (teams ask to join the club and you approve each; share the club's link; "Your coaches can add their team to your club using your web address"); (c) **You're set**.

**Player (13+) path**: a single screen that explains how it works ("Players 13 and older sign in themselves. Your parent or coach sends you a link."), a **Paste a link or code** field, and **Ask your parent to send a link** with a share action. After a claim: "You're linked" or "Waiting for your parent to approve", as today.

**Code or invite path**: one field for a **team code**, a **family code**, or a pasted invite link, with a plain segmented choice **Team code | Family code** (see New data for a single field), the right follow-ups for each (which child for a team code; relationship note for a family code), and the same Request-sent confirmation.

**Pending state** (shown on the empty Home and in the onboarding flow's return): a **"Waiting for approval"** card per request, with only what the requester already knows (the code they used and the date, and the child chosen), a status (Pending, Approved, Declined), and a **Cancel request** action (see New data). Approved requests lead straight to the new place. A declined request explains politely and offers to try again.

**Notifications soft-ask** (mobile first, after the first approved place, not before): a calm sheet "Get a heads-up when practice moves", three plain examples (schedule changes, messages from your coach, game day reminders), **Turn on notifications** and **Not now**; the native system prompt appears only after the first button. On web the same sheet uses the browser prompt if the product supports it today; otherwise omit it.

**Returning, no place**: "You're not on any team right now" with the same intent cards in a quieter layout and a **Rejoin or join** shortcut.

### 5. Scenarios to draw (mobile first, then web; light, with dark for the two marked D)

- **A. Sign-in family** (D): Welcome, Sign in, Create account (with the strength meter and consent line), keyboard open on each, Check your email, Forgot (request, sent, set new, success), signed out state, errors (copy table and three inline examples), social cancelled, account exists with a different method.
- **B. Link arrival**: invite banner on Create account and on Sign in for team, club and family invites; claim link; invalid and expired invite; signed-in "Continue as" variant.
- **C. Onboarding hub** (D): "What brings you here?" with the five cards, empty and returning variants.
- **D. Parent path**: add child, add another, "Is your child on a team?", enter team code (filled, invalid code, rate limited), request sent, join a family code (sent, invalid, already a member, too many attempts).
- **E. Coach path**: create team, invite families (link, code, QR, share), add first event (collapsed and expanded), you're set with the checklist.
- **F. Club path** and **Player path**.
- **G. Code or invite path** and the **Pending requests** card (pending, approved, declined, cancelled), plus the notifications soft-ask.
- **H. States**: loading, error with retry, offline, slow connection, server error, and long names.
- **I. Web**: desktop two-pane auth, tablet centred card, onboarding hub and parent path in the web layout, with focus and keyboard states.

Use realistic content: Blake Hayes as the new coach, a parent adding Maya (age 11) and Eli (age 7), U12 Falcons, Fall 2026, a team code like `K7MQ4ZR2XA` in mono, an invite from Coach Dana, a family code, a blocked "too many attempts" message with a time.

### 6. Deliverables

1. Artboards for the scenarios above, mobile first, then web, with the **flow map** (every entry point and where it goes: Welcome, link arrival, code, onboarding paths, pending, Home).
2. A **copy deck** for errors and confirmations (the table in section 2), the consent line, the "what happens next" lines, and the privacy reassurances, all in plain words.
3. A **who-sees-what table**: which onboarding path and card each audience sees (new parent, new coach, club admin, player 13+, invitee, a second guardian, returning person with no place).
4. **New variants needed** (welcome screen, social button stack, password field with strength and show or hide, resend countdown, link-arrival banner, intent card, step progress, code field in mono, request-status card, notifications soft-ask) and **New data needed** (below).
5. An **accessibility note**: autofill and password-manager attributes, labelled show or hide, error summary and field focus, 44px targets, focus order, screen-reader text for strength and progress, reduce motion, reduce-transparency fallbacks, light and dark, dynamic type on mobile, and no information by colour alone.
6. Annotate each element with its function from the audit table so implementation is a straight wire-up.

**Likely New data / backend** (draw it, tag it, keep it out of the first build if it is not cheap): (1) **password reset** (request link, set-new-password page and deep link; needs the reset redirect URLs allowed in the backend config); (2) **resend confirmation email**; (3) a read of **the person's own join requests** (status, date, the code or child, never the team's information until approved) and a **cancel request** action; (4) a **signed-out invite preview** (team or club name and role from the invite token, readable before sign-in, nothing else); (5) a **single code field** that detects a team code, a family code or a pasted link (needs a function that reports only the kind of a code without revealing names, and it must not weaken the attempt limits); (6) **native Sign in with Apple** on iPhone and a keyboard-friendly layout (a native module); (7) optional **"Use Face ID"** for returning users (a native module); (8) Terms and Privacy pages if they do not exist yet; (9) optional sign-in by emailed link or code.

Constraints: no payments, schedules, rosters or messages in onboarding; no invented metrics (no "join 10,000 families"); no new tokens; no hardcoded values; mono for codes and numerals; lime only for the primary action; no new illustration assets (use icons, glass and type); a child's date of birth is never asked at sign-up; every approval rule stays as it is and is explained in plain words.

---

## Notes for the hand-off to Claude Code (not part of the prompt)
- Password reset, resend confirmation and magic link are Supabase auth calls (`resetPasswordForEmail`, `resend`, `signInWithOtp`) plus redirect URL allow-list changes in `supabase/config.toml` and the hosted project; the mobile reset needs a deep link route like the existing `auth/callback`. None of these exist today (nothing in the code calls them).
- Social buttons render regardless of provider configuration; confirm which providers are enabled in each environment before shipping, and add a native Apple flow (`expo-apple-authentication`) for iOS. Both are native-module decisions (new dev build).
- Mobile sign-in is the Expo Router anchor and the signed-out guard lives in `app/_layout.tsx`; adding a Welcome screen means changing the anchor and keeping the stored pending-invite resume (`PENDING_INVITE_KEY`) working.
- The web guard is `lib/supabase/proxy.ts` (public paths list and `next` redirect). New public routes (forgot, reset, check email, welcome) must be added there.
- Onboarding appears at the "no active place" branch in web `(app)/page.tsx` and mobile `(app)/index.tsx`. The existing forms (`addChild`, `createTeam`, `createClub`, `requestToJoin`, `request_to_join_household`) are reused as steps; shared logic (step state, code validation, the error copy map, password strength) belongs in `packages/core` with unit tests.
- A pending requester sees nothing of the team or household by design (`docs/permissions.md`); the Pending card may show only what the requester supplied.
- Per `docs/design-system.md`, new components or variants go into the design system first, then `tokens.contract.json`, then code. Keep test ids and the auth e2e specs stable or update them.
