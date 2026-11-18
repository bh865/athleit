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

## Scheduling (Phase 2)

Not yet run on a simulator in this branch (the iOS bundle compiles with `expo export`); run these before release.

1. **Staff create.** As a coach, open Schedule, tap New event, add a Game (title, today's date, a start time later today, an opponent, "New place…" for the location). It appears under Upcoming. Add a weekly practice on two weekdays with 6 events; the toast says "6 practices added".
2. **Parent RSVP per child.** Sign in as a parent with two children on one team. Home shows "Next up" with child chips; choose a child, tap Going, see "Name: Going". Switch chip, tap Can't go. Open the event from the card and confirm both statuses.
3. **Offline / failure.** Turn on airplane mode and tap Going; the choice reverts with an error and Retry. Turn it off and tap Retry.
4. **Counts live.** Keep the coach's event detail open on a second device; a parent's RSVP changes the counts and the player list without a refresh.
5. **Privacy.** A second family's event screen shows counts only, no names.
6. **Cancel.** Coach opens a series event, Cancel event, picks "This and following", enters a reason. Parents still see the events, struck through, with the reason; Going and Can't go are gone.
7. **Result.** After a game starts, coach taps Enter result: final score, then "By half/quarter/inning/set". A tie is refused for basketball and volleyball.
8. **Time zones.** Set the phone to a different zone than the team's; the event shows the team's time with "Your time: …".
9. **Accessibility.** VoiceOver reads each event card (type, title, date, place, cancelled), the RSVP status line, and the counts. Reduce Motion and Reduce Transparency on: sheets and the tab bar stay legible. Tap targets are 44pt or larger.
10. **Calendar link.** More > Schedule > Calendar link: create, copy, reset, turn off.

## Schedule notifications and the calendar feed (Phase 2, Part C)

Needs a real device with push set up ([notifications.md](notifications.md)); not run on a device in this branch.

1. **Batched.** As a coach, add a weekly practice with 6 events. A parent's phone receives ONE push, "6 practices added", and tapping it opens the first practice (also from a cold start and when signed out: sign in, land on the event).
2. **The editor and muted users.** The coach's own phone gets nothing. A parent who turned off Schedule in Alerts settings gets no push.
3. **Time change.** Move one practice by an hour: "Time changed: …". Rename another: no push at all. Change a whole series to 6:00 PM: one push, "6 practices rescheduled".
4. **Cancel.** Cancel one occurrence with a reason: "Cancelled: <reason>". The event stays on the schedule, struck through.
5. **Result.** Enter a result: "Final score 3–2" to families and staff.
6. **Reminder.** Leave a child without an RSVP for an event that starts in under 24 hours; within 15 minutes the guardian gets "RSVP needed: …", once. Answer, and no further reminder.
7. **Calendar.** More > Calendar link: create, copy, paste into iOS Settings > Calendar > Accounts > Add Subscribed Calendar (or Google Calendar > From URL). Events appear at the right local time; cancel one and it shows as cancelled after the next refresh; reset the link and the old subscription stops updating.

## Payments: PaymentSheet and Apple Pay (Phase 4)

Needs an EAS **development build** on a real device (PaymentSheet does not run in Expo Go) and Stripe TEST keys: `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
in `apps/mobile/.env.local`, the `stripe-webhook` function deployed with its Connect endpoint registered, and a team whose test Stripe account has
finished onboarding. Apple Pay additionally needs the merchant ID `merchant.com.athleit.app` created in the Apple developer account and the Stripe
Apple Pay certificate step (the iOS simulator can show the sheet but cannot complete an Apple Pay payment).

1. **Pay list.** As a parent, Pay shows "Amount due" in large mono, one card per request, and a lime "Pay $…" pill. Deselect one request: the total follows.
2. **Review.** Tap Pay: "Confirm payment" lists each item, any Athleit charge and Service fee, and the Total. Nothing here comes from the phone: change nothing and compare with the web.
3. **Card.** Continue to payment: the PaymentSheet opens in the app's colours (try dark mode). Pay with `4242 4242 4242 4242`: "Processing", then the receipt with an `RCP-` id once the webhook lands.
4. **Close mid-payment.** Pay, then kill the app while "Processing". Reopen: the request shows paid (or unpaid if it failed); the receipt appears in Receipts and a notification arrives.
5. **Decline and 3DS.** `4000 0000 0000 9995` shows "Payment didn't go through… not charged" with Try again. `4000 0025 0000 3155` opens the bank authentication; failing it shows the same friendly state.
6. **Apple Pay / Google Pay.** On a device with a wallet card, the sheet offers it; completing it behaves like step 3.
7. **Household.** Another guardian in the same household pays first: your Pay list shows the request as paid and the retry says it can't be paid.
8. **Staff.** As a team admin: Pay tab > Payouts "Set up payouts" opens Stripe in the in-app browser and returns; "New payment request" sends to the roster; "Send reminder" works once per 24 h; a coach sees status but no setup button.
9. **Accessibility.** VoiceOver reads "Jersey fee, $45.00, due Nov 30, Unpaid" on each request and "45 dollars" for amounts; tap targets are 44pt or larger.

## Date and time pickers (polish)

1. **Child date of birth.** Family > Add a child: the Date of birth field shows a calendar icon and "Select a date". Tap it: a glass sheet slides up. Tap the "Month Year" title, choose a year (newest first), a month, then a day: the sheet closes and the field reads like "Apr 2, 2016". Future days are muted and do nothing.
2. **Edit child.** The field shows the saved date; open it: that day is filled lime and today is ringed.
3. **Event date and times.** Schedule > New event: Date opens the calendar; Starts and Ends open hour / minute / AM-PM columns and need "Done" (Cancel keeps the old value). The zone note under them is unchanged.
4. **Due date.** Pay (staff) > New payment request: Due date refuses days before today.
5. **Quiet hours.** Notification settings: From and Until use the time sheet; Save quiet hours stores the 24-hour value.
6. **Accessibility.** VoiceOver: each day reads "Monday, November 30, 2026" (plus ", today" / selected / dimmed); the header reads "November 2026, choose month and year"; day targets are 44pt or larger.
7. **Reduce Transparency / dark mode.** Turn on Settings > Accessibility > Display > Reduce Transparency: the sheet becomes solid and stays readable. Repeat in dark mode.
8. **Backdrop blobs.** Home in dark mode: the green and blue corner glows are faint (about 13% and 22% at their centres), not solid colour.

## Pay views by capability (polish)

Run each with the team as the last-used place (switch to the team, close and reopen the app).

1. **Parent only** (member of a team as Parent, has a household with a rostered child): Pay shows the child's requests, "Amount due", Pay and Receipts. No "Team collection" segment, never "No payment requests yet" when requests exist.
2. **Staff only** (team admin or coach, no household): Pay shows payouts, "New payment request" and collection. No "My payments" segment.
3. **Staff and parent**: Pay shows two segments, "My payments" and "Team collection"; it opens on the one matching the active place.
4. **Messages as a parent** with the family active: the team's conversations still show (the first team is used).
5. **Dual-role Messages**: an Admin who is also a Parent sees the staff-only controls (announcements, hide message) in the team's threads.

## Places, switcher and Roster (polish, Item 1/4)

1. **One place.** A user who is Admin and Parent of a single team sees one pill, "Athleit FC / Admin · Parent", with no caret; tapping it does nothing.
2. **Two places.** Join or create a second team: the pill gets a caret and opens a "Switch team" sheet listing teams and clubs (not the household).
3. **Add.** More lists Add a team / Create a club / Join a team (and Add a family without a household) even with a single place.
4. **Old saved place.** Update from a build that stored `team:<id>:<role>`: the app opens the same team (no reset to the first place).
5. **Roster.** More > Roster opens the active team's roster. Staff: statuses, guardian contacts, add and edit. Parent or player: first name, jersey number and position only. The team screen's Overview tab links to it.
