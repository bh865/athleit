# Claude Design prompt: Messages (web and mobile, mobile first)

Paste into Claude Design with the **Athleit design system** attached (glass shells W2 for web and M2 for mobile). Grounded in the repo as of 2026-11-20
(`apps/web/src/components/messages/*`, `apps/web/src/app/(app)/messages`, `apps/mobile/src/components/messages/*`, `apps/mobile/src/app/(app)/messages`,
`packages/core/src/messaging.ts`, `packages/core/src/places.ts`, `packages/core/src/context.ts`, `docs/messaging-safety.md`, `docs/permissions.md`,
`supabase/migrations/2026010300*` and `2026010600*`).
Same principles as the Home, Family, Roster and Schedule prompts: existing components only, every element maps to data we have, four states per section, no invented metrics.
**Priority: mobile first.** The mobile Messages experience must feel as familiar and effortless as iMessage, WhatsApp and the other messaging apps people use all day. Web matters too, but is designed second, as the same product on a wide screen.

---

## Answers to the structural questions (these shape the whole design)

**Can one person be on more than one team?** Yes, with no limit. Each membership is its own row (one per team and role). A coach of one team can be a parent on another. A guardian is **automatically** made a parent on every team their child is rostered on, including a second guardian who joins the household later. Roles in one team are merged into one place ("Admin · Parent").

**More than one family (household)?** The database allows it (a person can belong to any number of households), but the app only offers "Add a family" when you have none, so most people have **one household**. A second one happens by being invited or joining with a family code (split households, a grandparent). Design for one household in the common case and make sure two or more still work. The family is not a messaging space: **messages belong to teams, not households.**

**More than one club?** Yes (a person can hold roles in several clubs, and a club has several teams). But **there is no club-level messaging at all**: every thread belongs to exactly one team, and a club admin who is not on that team cannot read its threads. Do not design club conversations. A pure club admin sees an honest empty state.

**What follows from this.**
- A parent with a child on the U12 Falcons and another on the U8 Cubs, plus a coach role on a third team, can have conversations in **three different teams**.
- Today the Messages area shows **one team at a time** (the active place), and silently falls back to the first team when you are in a family or club place. The unread badge counts every team, so a parent sees "3 unread" and finds nothing until they switch teams. **This is the opposite of how WhatsApp or iMessage work. The redesign must be one inbox across every team you are in, with the team shown as a label, not a wall.**
- The same coach can be on two of your teams. That is **two separate direct threads** (threads are per team), so each thread must say which team it belongs to.

---

## Audit: what we have today

**Where it lives.** Web: sidebar "Messages" with a live unread badge, `/messages` (list column 340px beside the open conversation, one pane at a time on narrow screens), `/messages/<id>`, `/messages/new`. Mobile: Messages tab, a list screen, a full-screen conversation, a New message screen. Notifications and push open the conversation.

**Thread types**
- **Announcement**: one-way. The audience is every active member of the team (no participant list, evaluated live). Only staff post; everyone else reads, reacts, reports and mutes.
- **Group**: staff create it and choose the participants. Participants post unless read-only. Team admins can read groups for moderation.
- **Direct (1:1)**: any team member can start one with the allowed people. A pair reuses its existing thread.

**List today.** Title "Messages" and a lime plus (mobile) or a lime "New message" button (web). Rows: a 52px round icon by type (announcement lime megaphone, group, direct), bold title, one-line preview ("Removed by staff", "Message deleted", "No messages yet"), member count for groups and announcements, short time top right, an unread count dot. **No search, no filters, no pinned or archived sections, no swipe actions, no team label, no avatars for people (icons only), no "typing" or "you:" prefix in previews, no unread section.** An empty list says "No messages yet".

**Conversation today.** A glass header bar (back, title, "24 members" or "Announcements", a bell-slash button that mutes for **8 hours only**), day separators ("Today", "Yesterday"), bubbles grouped into runs (a run breaks after 5 minutes or a new day), sender name on the first received bubble of a run, time and delivery status ("Sending", "Failed", "Delivered", "Read") under the last own bubble, an "edited" mark, "Removed by staff" and "Message deleted" placeholders, **reactions** (six fixed: thumbs up, heart, laugh, celebrate, clap, wow), **reply-to** quoting, **attachments** (up to 5 per message, JPEG, PNG, WebP, GIF and PDF, 10 MB each), a typing indicator, a "new messages" pill when scrolled up, a long-press or tap **actions sheet** (react, reply, edit and delete own, report, hide for staff), **staff see read counts**, an offline **outbox** that retries with backoff and optimistic sends, an "archived" notice, a rate limit of 30 messages a minute, and a 4000 character limit. The composer: text, an image attach button, a reply bar, send.

**New message today.** A card: Direct | Group | Announcement segmented (group and announcement for staff only), a title field for group and announcement, and **a wrapped bag of chips** (name · role) to pick people, one for direct, many for group. It is scoped to the **single active team**. Parents see only the team's staff; a 13 to 17 player sees staff and their own guardians; staff see every active member. Errors come from the database in plain words.

**Problems the redesign should solve (mobile first)**
1. **One team at a time.** No unified inbox; you must switch places to see other teams' conversations, and the global unread badge does not tell you where the unread is.
2. **Unfamiliar structure.** The list has no avatars, no search, no sections, no swipe actions, no "you:" or sender-name previews, and it is not obvious who a thread is with or which team it belongs to.
3. **Starting a conversation is a form**, not a search-and-tap. Picking people from a chip cloud does not scale past a small team.
4. **Conversation chrome is thin**: the header cannot be tapped for info (members, team, mute options, files), mute is a fixed 8 hours with no options and no way to see or undo it, there is no jump-to-unread or "new messages" divider, no media viewer, no way to see all photos and files, no copy.
5. **Composer is minimal**: one image button, no camera, no file (PDF) button on mobile as a first-class action, no draft saving, no clear attachment preview and no retry state per attachment.
6. **Rules are invisible.** Parents hit database errors when something is not allowed. The UI should explain who you can message and why ("Parents can message the coaches and managers of a team"; "Messages about a player go to their parent"), before the error.
7. **Announcements and conversations look the same**, though one is a broadcast you cannot reply to. Parents need to see at a glance what is important.
8. **Web is a two-column list plus pane with little else**: no search, no info panel, no keyboard shortcuts, no unread jump.

**Existing data (do not go beyond this)**

| Element | Source |
|---|---|
| Thread list, per team | `get_thread_list(team_id)`: type, title, last message (body, sender name, deleted, hidden, time), unread count, member count, other person's name (direct), muted_until, archived_at |
| Unread across every team | `get_unread_total()` (excludes muted threads) |
| Teams the person is in, roles, staff or not | contexts from `team_memberships` (`teamForScreen`, `isTeamStaff`) |
| Who you may message in a team | `get_messageable_people(team_id)`: name, role, is_minor |
| Create thread | `create_thread` (direct, group, announcement; staff for the last two) |
| Messages, reactions, attachments, reads | message tables and `get_thread_members`; reads for staff; typing via Realtime |
| Send, edit, delete own, hide (staff), report, react, mute, archive, mark read | `send_message`, `edit_message`, `delete_message`, `hide_message`, `report_message`, `toggle_reaction`, `set_thread_mute`, `set_thread_archived`, `mark_thread_read` |
| Safety rules and error mapping | `docs/messaging-safety.md`, `friendlyError` |
| Push, quiet hours, previews off by default, minors never carry text | notifications (unchanged) |

**Rules that stay exactly as they are** (database-enforced; the UI explains them, never loosens them): children under 13 have no login (guardians message as themselves); a direct thread with a minor is only with that minor's guardian; a group with a minor needs two staff adults or one staff adult plus a guardian; players 13 to 17 can post only in groups staff create and open direct threads only with their own guardian; only staff create groups and announcements and post in announcements; non-staff see only messages from when they joined; staff can hide messages and see read counts and reports; parents never get a list of other families; notification previews are off by default and never carry text for threads that include a minor. Do not show payments, schedule or roster content inside Messages, only links out where a message already contains one.

---

## PROMPT

Redesign **Messages** (mobile screen and web page) so it feels as natural and familiar as the messaging apps people use every day, using the attached **Athleit design system** (charcoal #272A2B, electric lime #CCFF33, ice blue #E1EFF6, glass sheets, Phosphor icons, Manrope, IBM Plex Mono for times, counts and numbers, light and dark). Produce high-fidelity mockups for **mobile (iPhone 390) first, and then web (desktop 1280 and tablet 834)**. Claude Code will implement this, so every element must map to the data above. No new tokens, no invented metrics. If something needs new data or a new variant, list it under "New data needed" or "New variants needed" instead of inventing it silently.

### 1. Principles

- **Familiar beats clever.** Use the patterns people already know from iMessage, WhatsApp, Messenger and Slack's mobile app: an inbox of conversations with avatars, a bold title with a one-line preview, a time on the right, an unread badge; swipe actions; a conversation with bubbles, a pinned composer, and a tap on the header for details. Do not invent new gestures.
- **One inbox.** Every conversation in every team the person is in, in one list, newest first. The **team** is a quiet label and a filter, never a wall. A person should never have to switch places to read or answer a message.
- **Announcements are not chats.** They are important broadcasts: visibly different, easy to find, never confused with a conversation you can reply to.
- **Calm, safe, plain.** Rules are explained before they bite. Nothing about a child is exposed beyond what already exists.
- **Fast to start.** New message is search-and-tap, like starting a chat in any app.
- Lime only for the primary action and "now" (the compose button, the send button, the unread count). Status never by colour alone.

### 2. Mobile (priority)

**Inbox (Messages tab).**
- Large title "Messages", a **compose** round lime button top right, and a **search field** pinned under the title (searches conversation names, people and the last message preview of what is already loaded; say so if full-text search needs new data).
- **Filter chips** in one scrolling row: **All**, **Unread**, **Announcements**, then one chip **per team** (only when the person is in more than one team, with the team name shortened and a sport icon), and **Archived** at the end. The active filter is clear and one tap clears it.
- **Pinned announcements strip** is optional: show the most recent unread announcement as a distinct card at the top of All (calm tinted card, megaphone, team name, title, first line), with the rest of announcements in the normal list.
- **Row** (the item model): a 52px **avatar** (a person's initials for direct threads; a group glyph with initials for groups; a megaphone tile for announcements, in the team's colour only if the design system already has one, otherwise neutral), **title** in bold (the other person's name, the group name or the announcement title), a **team chip** (small, quiet, only when the person is in more than one team), the **one-line preview** with a "You:" prefix for own messages and the sender's first name for groups ("Coach Dana: Practice moved to 6"), the **time** in mono at the right (today's time, "Yesterday", or a short date), and the **unread badge** (a lime count; a muted bell-slash when muted, a number still shown quietly). Unread rows have a bolder title and preview. Show "Removed by staff" and "Message deleted" as today, and a draft indicator ("Draft: ..." in the preview) when the user has typed something unsent.
- **Swipe actions** on a row, like Mail: swipe right to **Mark read or unread**, swipe left for **Mute** and **Archive**, with clear icons and labels, and a long-press menu with the same actions plus **Pin** (see New data) and **Open info**.
- **Sections** when useful: **Pinned** (New data), then the list. Archived has its own filter, not a section.
- **States**: loading skeleton rows, error with retry, no conversations yet (warm, explains who you can message and offers New message), no results for a search or filter, offline banner with the cached list still readable.

**Start a conversation (compose).** A bottom sheet or full-height screen opened by the compose button:
- A **"To:" search field** with live results, grouped by **team** (only one group when the person is in one team), each result a person row: avatar, name, role ("Coach", "Manager", "Parent"), and for staff the role plus a child-safe line, never contact details. Tapping a person starts or opens the existing direct thread with them (the same pair in the same team reuses the thread). If the same person is on two of your teams, they appear under each team; choosing one decides the team and the thread.
- **Staff only**: below the search, two quiet rows, **New group** and **New announcement**. **New group** is a second step: choose the team, name the group, pick people from a searchable multi-select with chips for the people already picked (a bar of avatars), and a plain-language rules line when a minor is involved ("A group with players under 18 needs two staff adults, or one staff adult and a parent"). **New announcement** asks for the team, a title, and a first message, with an "Everyone on the team will see this. Only coaches and managers can post." line.
- **Who can I message?** An info row for non-staff ("You can message your team's coaches and managers. Messages about a player go to their parent.") and a state when the list is empty ("No one to message yet").
- Errors and rules appear inline, in plain words, before sending.

**Conversation (full screen, familiar).**
- **Header**: back, a **centered avatar and name** with a second line (the team name, plus "typing…" when someone is typing, or "24 members"), tap anywhere on it to open **Info**. A trailing "more" or phone-style actions is not needed; the header tap is the entry.
- **Bubbles**: own on the right in the accent surface, received on the left with the sender's avatar on the last bubble of a run and the sender's name on the first bubble of a run in groups, grouped into runs, **day separators** ("Today", "Yesterday", dates), **time** in mono under the last bubble of a run, delivery status for own messages (Sending, Failed with a tap-to-retry, Delivered, Read), "edited", the reply quote inside the bubble, **reactions** as small chips under the bubble with counts, image attachments as rounded thumbnails in a grid (tap opens a full-screen viewer with swipe between images and a share and save action), PDFs as a file card (icon, name, size). Links are tappable. Long-press a bubble for the **actions sheet**: react (the six existing reactions in a row), Reply, Copy, Edit and Delete (own), Report (others), Hide (staff), Message info for staff (read by). Swipe a bubble to reply, like iMessage.
- **New messages divider** ("3 new messages") and a **jump to latest** button with an unread count when scrolled up.
- **Composer** pinned above the keyboard: an **attach** button opening a sheet (Camera, Photo library, File for PDF, each with the limit explained: up to 5, 10 MB each), a growing text field, a send button that is lime only when there is something to send, a **reply bar** with a close, **attachment previews** above the field with a remove button and a per-file progress and Retry, **draft saved** per conversation. When the person cannot post (an announcement they cannot reply to, an archived conversation, a read-only member), replace the composer with a calm explanation instead of a disabled box ("Only coaches and managers can post in announcements", "This conversation is archived").
- **Announcement conversations** are visually distinct: a megaphone header, the team name, "Announcement" label, messages as **cards** instead of chat bubbles, and for non-staff a quiet "Only staff can post here" in place of the composer; reactions stay.
- **Typing indicator** and **offline state**: a banner "Waiting for connection. Messages will send when you're back online", with queued messages showing a clock.
- **Empty and states**: empty conversation, loading, error with retry, the "Removed by staff" and "Message deleted" bubbles, and rate-limited ("You're sending too fast. Try again in a moment").

**Conversation info (opened from the header).**
- Header block: large avatar or glyph, name, team, type ("Direct message", "Group", "Announcement").
- **Mute**: a switch plus a duration picker (**1 hour, 8 hours, 1 week, until I turn it back on**), showing the current state, instead of the fixed 8 hours. (Duration beyond 8 hours uses the existing `muted_until` column; see New data only if a longer value is not accepted.)
- **Members** (groups and direct): searchable list with avatars and roles; for announcements show "Everyone on <team>" and the count, never a name list. For staff, the group's owner can add or remove people (existing rule), with the rules line when a minor is involved.
- **Media, files and links** tabs when there are any (from attachments already loaded).
- **Notifications explained** in one line ("You'll get a notification unless this conversation is muted or it's your quiet hours").
- **Archive** and, for staff, **Reports** link (existing).
- A quiet **Report** and **Leave** only where the existing rules allow (do not invent leaving direct threads).

### 3. Web

The same product, more room: a **three-pane layout on desktop** (inbox, conversation, optional info panel) and a **two-pane layout on tablet**, one pane at a time on narrow widths.
- **Inbox column** (340px to 400px): the same header with a **New message** primary button, the search field, filter chips, and rows identical to mobile (avatar, title, team chip, preview, time, unread badge), with hover actions (mark read, mute, archive) instead of swipes, a selected row state, and keyboard navigation (arrow keys to move, Enter to open, `/` to focus search, `c` to compose, `Esc` closes the info panel).
- **Conversation pane**: the same header (avatar, name, team, typing) with an info button, bubbles, and the composer with a larger text area, **drag-and-drop and paste for images and PDFs**, attachment previews, Enter to send and Shift+Enter for a new line (say so in a hint), hover reactions and an actions menu on each message.
- **Info panel** (right, collapsible, an overlay at 834): the same sections as mobile, plus staff **read receipts per message** and a link to the report queue.
- **Compose** as a dialog with the same search-and-tap, group and announcement steps.
- Page header keeps "Messages", with the total unread count beside the sidebar badge; the page title does not name a single team.
- Same states as mobile: loading, error, empty inbox, empty conversation, no search results, offline.

### 4. Who sees what

Draw one **visibility matrix** (rows = features, columns = Staff, Parent or guardian, Player 13 to 17, Club admin): unified inbox, search, filters, team chips, New direct message, New group, New announcement, post in announcement, reply to announcement (react only), read receipts, hide message, reports queue, mute, archive, members list on groups, members on announcements (count only), add or remove group members, report a message, attachments. Club admins who are not on a team see an honest empty state ("Messages live inside each team. Join or open a team to chat."); do not design club threads.

### 5. Scenarios to draw (mobile first, then web; light, dark for the two marked D)

- **A. Parent, two children on two teams (Falcons, Cubs), plus a third team where they are a coach** (D): the unified inbox with filter chips per team, an unread announcement card, a direct thread with Coach Dana, a group, a muted thread, a draft, "You:" previews, swipe actions open.
- **B. Compose**: search "dan", results grouped by team, the same person under two teams, the staff-only New group and New announcement rows, the rules line when the group includes a minor.
- **C. Conversation** (D): a direct thread with replies, reactions, an image grid, a PDF card, a typing indicator, a failed message with Retry, a "3 new messages" divider and the jump-to-latest button, the actions sheet, the keyboard open with an attachment preview.
- **D. Announcement conversation** as a parent (cards, no composer, reactions) and as staff (composer, post).
- **E. Conversation info** for a group (members, mute duration picker, media) and for an announcement (count only).
- **F. Staff view**: the inbox with read counts on the last staff message, hide message, reports link, a message read-by sheet.
- **G. A player 13 to 17**: inbox with only allowed threads, direct with own guardian, and the explanation when something is not allowed.
- **H. States**: loading, error with retry, no conversations yet (parent and staff), no results, offline with queued messages, rate-limited, archived conversation, a thread where you cannot post, a club admin with no teams.
- **I. Web**: three-pane desktop (A and C combined, dark), tablet 834 with the info panel as an overlay, compose dialog, keyboard shortcuts hint.

Use realistic content: U12 Falcons (Maya), U8 Cubs (Eli), a third team where the person is assistant coach, Coach Dana, Manager Pat, announcements ("Practice moved to 6:00 PM", "Picture day Saturday"), a group "Falcons carpool", a photo of a field, a PDF "Tournament schedule".

### 6. Deliverables

1. Artboards for the scenarios above, mobile first, then web, with the **row model** (what shows for each audience and state, and the priority when several apply: unread, mute, draft, failed, archived).
2. The **visibility matrix** (section 4) and a **rules explainer** board showing every moment the app explains a rule before the database enforces it.
3. **New variants needed** (conversation row with team chip, swipe actions, filter chips, compose result row, announcement card, attachment preview strip, jump-to-latest pill, new-messages divider, info panel, mute duration picker) and **New data needed** (below).
4. An **accessibility note**: 44px targets, VoiceOver and TalkBack labels for rows (name, team, preview, time, unread count) and bubbles (sender, time, status), live-region updates for new messages and typing, reduce-transparency fallback for glass bars and sheets, status never by colour alone, focus order and return focus to the opening row, keyboard operation on web.
5. Annotate each element with its data source from the audit table so implementation is a straight wire-up.

**Likely New data** (draw it, tag it, keep it out of the first build if it is not cheap): (1) a **single cross-team inbox read** (today `get_thread_list` takes one team; the first build can call it once per team and merge, a new function is cleaner); (2) **pin a conversation** per person; (3) **per-person drafts** synced across devices (local only is fine for the first build); (4) **search inside messages** (today only names and the loaded previews); (5) **mute durations beyond 8 hours**, if `set_thread_mute` rejects them; (6) a **media and files tab** read for a thread.

Constraints: no payments, schedule or roster content inside Messages, no invented metrics (no "online" status, no last seen, no read receipts for non-staff beyond what exists), no new tokens, no hardcoded values, mono for times and counts, lime reserved for the primary action, the unread count and "now", every rule that exists in the database explained in plain words and never loosened.

---

## Notes for the hand-off to Claude Code (not part of the prompt)
- The biggest structural change is **unifying the inbox across teams**. Today `teamForScreen` picks one team and falls back to the first, and `get_thread_list(team_id)` is per team; the first build can fan out one call per team and merge, and a `get_inbox()` function is the clean follow-up (New data 1).
- Conversation logic already lives in `packages/core/src/messaging.ts` (runs, day labels, delivery status, merge, previews, unread); new shared logic (filters, search, row labels with "You:", draft previews, team chips, compose results grouped by team) goes there with unit tests.
- Keep the safety rules in the database; the new rules explainer copy comes from `docs/messaging-safety.md`.
- Test ids to keep or update: `thread-row` and the messaging specs in `apps/web/e2e/` and the visual gallery; Realtime subscriptions in `use-thread.ts` stay.
- Per `docs/design-system.md`, new components go into the design system first, then `tokens.contract.json`, then code.
