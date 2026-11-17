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

## Design system pass (simulator checklist)

Run in light, dark and with _Reduce Transparency_ on (Settings → Accessibility → Display & Text Size). Compare against
`docs/design-audit/after/` and `docs/design-system/` (Mobile.dc.html). Open the gallery with `athleit://design`
(`xcrun simctl openurl booted athleit://design`).

1. **Gallery** shows light then dark: colours, type scale, the three glass levels (bar < sheet < modal in opacity; sheet and
   modal have a soft shadow), buttons (lime pill with charcoal text in both modes), inputs (52 high, focus = 2px "sent" border),
   chips, status dots, avatars, list rows with 1px separators, empty/error/skeleton states and the floating tab bar.
2. **Backdrop**: soft lime and ice-blue blobs are visible behind glass in both themes. With _Reduce Transparency_ glass becomes solid with no blur.
3. **Tab bar**: floating, 68 high, active item is a lime pill with a filled icon. _More_ opens a glass sheet with the theme control and Sign out.
4. **Screens** (home, family, add a child, roster, team sections, invites, join, club): rows have 1px separators and avatars for people;
   loading shows skeleton rows; errors show an icon, message and _Try again_.
5. **Contrast on glass**: `ink` text is readable over blobs; no muted text sits on glass.
6. **Targets**: every control is at least 44pt; VoiceOver reads tab names ("Home", "Family", "More") and selected state.

## Messaging (two devices or two simulators)

Setup: two accounts on the same team (for example a coach and a parent; join the parent with a parent invite link). Sign in on device A as the coach and device B as the parent. Both apps need `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `apps/mobile/.env.local`.

1. **Thread list.** A: Messages tab, plus button, Group, name "Game day", pick the parent, Start conversation. B: Messages tab shows "Game day" with a member count; empty state "No messages yet" shows before the first thread.
2. **Live exchange.** A sends "Practice moved". B (conversation open) sees it appear with no refresh; B replies. A sees the reply. The own bubble shows "Delivered", then "Read" once B has it open.
3. **Typing and unread.** A types: B sees three dots. B goes back to the list; A sends: B's row shows the unread dot and the Messages tab shows a lime count badge. Opening the thread clears both.
4. **Scrolled up pill.** Send 40 messages from A, scroll B up, send one more: B shows the glass "New messages" pill; tapping it jumps to the newest message.
5. **Pagination.** On B scroll to the top: earlier messages load ("Loading earlier messages…") with no duplicates.
6. **Actions.** B long-presses A's message: react (chip appears on both devices), reply (quote appears in the bubble), report (sheet, "Report sent"). A long-presses B's message: "Remove for everyone"; B sees "Removed by staff".
7. **Attachments.** B taps the paperclip, picks a photo, sends: A sees the image; the file is in the private `message-attachments` bucket (not publicly reachable).
8. **Announcements.** A: Messages, plus, Announcement, title, create, post. B sees the card post with the "ANNOUNCEMENT" kicker and no composer ("Only coaches and managers can post here.").
9. **Offline queue.** On B turn on airplane mode, send two messages: they show "Sending". Force-quit and reopen the app while offline, open the thread: both are still there as "Sending". Turn airplane mode off: both deliver once, in order, with no duplicates; A receives them.
10. **Reconnect.** With B offline, A sends 3 messages. Turn B online: the missed messages appear once each.
11. **Failure.** As the parent, try to send in an archived thread (staff archive it first): the bubble shows "Failed to send", Retry and Discard.
12. **Accessibility.** VoiceOver reads a bubble as "You, 4:14 PM, read: …"; every control is at least 44pt; Reduce Motion and Reduce Transparency (glass becomes solid) are honoured.

## Notifications (real device; needs the Expo/EAS project id and credentials, see docs/notifications.md)

1. **Register.** Sign in, More, Alerts, Settings, "Turn on push on this phone", allow notifications. "Your devices" lists the phone ("this phone").
2. **Push arrives.** From a second account send a message in a shared group: a push shows the thread title and "New message" (no text unless previews are on and no minor is in the thread). Tap it with the app closed: the app opens that exact thread (signed out: sign in, then it opens).
3. **Active thread.** With the conversation open on the phone, send from the other account: no banner or push for that thread; leave the thread and send again: it arrives.
4. **Mute.** Mute the conversation (bell in its header): no push; the thread still shows unread.
5. **Quiet hours.** Set quiet hours to include now, send: nothing arrives; the notification appears when the window ends.
6. **Preferences.** Turn "Messages by push" off: no push. Turn on previews in an adult-only group: the push shows text; in a group with a player under 18 it never does.
7. **Sign out this device** (Settings or More, Sign out): the device disappears from the list and stops receiving.
8. **In-app.** With the app open on another screen, a new message shows a glass toast and a new row at the top of Alerts on a lime circle.
