# Mobile manual test steps (iOS Simulator / device)

Automated web coverage lives in `apps/web/e2e`. These steps cover the same flows on mobile.
Prerequisites: `apps/mobile/.env.local` has the project URL and publishable key; run
`pnpm dev:mobile` and press `i`. Use throwaway accounts (`you+parent@example.test`) on a dev project.
For links, set `EXPO_PUBLIC_WEB_ORIGIN` (default `https://athleit.app`); shared links open on that host.

1. **Sign up** as a parent. You land on "Welcome" with four choices.
2. **Add a child with no team**: _Add my child_ → name, DOB `2016-04-02` → _Add child_. The family
   screen lists the child as "Not on a team yet" and "No login (under 13)". The context switcher now shows "… family".
3. **Photo (optional)**: open the child → _Add a photo_ → pick an image. It appears; replacing it works.
4. **Second session** (another simulator/device or web): sign up as a coach → _Create a team_ (pick a sport chip,
   enter a season) → you land on the team. _Settings_ shows the 10-character team code.
5. **Invite a coach**: _Invites_ → role _Coach_ → _Create invite link_. A QR code, **Share…** (opens the share sheet)
   and **Copy link** appear. _Revoke_ marks it revoked.
6. **Accept in a third session**: open `athleit://invite/<token>` (e.g. `xcrun simctl openurl booted athleit://invite/<token>`).
   Signed out you see "You've been invited" → _Create an account_ → after sign-up the invite landing resumes
   ("Join … as coach") → _Accept invite_. The switcher lists the team. Re-opening the link shows "already been used".
7. **Join with the code**: as the parent, _Join a team_ → enter the code, pick the child → _Send request_.
   Opening the team afterwards still says you can't access it (a request grants nothing).
8. **Approve**: as the coach, _Requests_ → _Approve_. As staff, _Roster_ shows the _Add an approved child_ card →
   set a jersey number and position → _Add to roster_. Tapping the player shows DOB and guardian contacts.
   Giving another active player the same number shows "That jersey number is already taken".
9. **Limited view**: as the parent, open the team: only `#7 Ava · Forward` (no last name, no contacts, no Members/Requests tabs).
10. **Switch contexts**: open the switcher: choose "Coach, …" / "Parent, family"; relaunch the app: the last one is restored.
11. **Club link**: as an admin of a new club (_Create a club_), and a team admin: _Settings → Ask to join this club_ with the
    club's web address; the club admin sees it under _Team requests_ and approves. The team now shows "part of a club";
    the club admin opens the team read-only.
12. **13+ login**: parent adds a child born before 2013, saves "their own login email"; the teen signs up with that email and
    opens `athleit://claim/<childId>` → _Link my login_ → "You're linked". A different email creates a request the guardian approves
    under _Login requests_.
13. **Accessibility pass**: VoiceOver reads field labels and errors; all buttons are at least 44pt; with _Reduce Transparency_
    on, bars and sheets are solid; Dynamic Type at the largest size does not clip forms.

Universal/app links need credentials not in this repo: the Apple team ID in `apps/web/public/.well-known/apple-app-site-association`,
the release signing SHA-256 in `assetlinks.json`, and a deployed web host matching `associatedDomains` in `apps/mobile/app.json`.
