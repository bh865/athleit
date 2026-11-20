# Claude Code prompt: Messages (web and mobile, mobile first)

Paste into Claude Code at the repo root. Read first, plan, then build. Proceed without waiting for approval unless you hit a real contradiction.

Implement this design in this codebase:
@https://claude.ai/code/artifact/a63c1d24-9cd0-46a8-8fb0-8bc72851bebc

Read the design's files from that link. Match how it looks, using this codebase's own components and conventions.

## Design source

The design file is one Claude Design artifact holding many screens. **Only the Messages files apply here.** Ignore Home, Family, Roster, Schedule, Team, Pay, Account, Documents, Waivers, Registrations and the rest.

| Platform | Canvas (board index) | Views (the real markup) |
|---|---|---|
| Mobile (priority) | `project/MessagesScreen.dc.html` | `project/MessagesMobileView.dc.html` |
| Web | `project/Messages.dc.html` | `project/MessagesWebView.dc.html` |
| Rationale, row priority, row model, visibility matrix, rules explainer, accessibility, data source per element | `project/MessagesRulesView.dc.html` (screen `rules`, board R0) | |

Read the rationale view first. Its matrices render correctly (unlike the Roster one), but where it disagrees with the code or this prompt, section 2 and the list of deviations in section 3 win.

**Mobile screens** (`MessagesMobileView`, 390; most light, `inbox` and `convMain` also dark):
- Inbox (A): `inbox`, `inboxSwipeL` (Mute and Archive), `inboxSwipeR` (Mark read), `inboxLongPress` (Pin is New data), `inboxRowStates` (unread, failed, draft, muted), `inboxUnread`, `inboxAnn`, `inboxTeam`, `inboxArchived`, `inboxSearch`, `inboxOneTeam` (no team chips).
- Compose (B): `cEmpty` (rules line, staff rows), `cSearch` (same person on two teams), `cSelect`, `cNoOne`, `cGroup`, `cGroupMinor` (Create disabled), `cAnn`, `cPlayer`.
- Conversation (C): `convMain`, `convScrolledNew` (jump to latest), `convActions` (received), `convActionsOwn`, `convActionsStaff`, `convKeyboard` (reply bar, 3 attachments, draft saved), `convAttach`, `convViewer`, `convGroup`, `convRetry`, `convEmpty`, `convDeleted`, `convOlder` (joined late).
- Announcements (D): `annParent`, `annStaff`.
- Info (E, E2): `infoDirect`, `infoMute`, `infoGroup`, `infoGroupStaff`, `infoAnn`.
- Staff (F): `staffInbox` (read counts), `staffReadBy`, `staffHidden`.
- Player 13 to 17 (G): `playerInbox`, `playerNotAllowed`, `playerConv`, `playerGroup`.
- States (H): `sLoading`, `sError`, `sEmptyParent`, `sEmptyStaff`, `sNoResults`, `sOffline`, `sClub`, `convOffline`, `convRate`, `convArchived`, `convReadOnly`.

**Web screens** (`MessagesWebView`): `w3pane` (1440, dark: inbox, conversation, info), `wTwo` (1280, info closed), `wGroup`, `wInboxHover` (nothing selected, hover actions), `wAnnParent`, `wAnnStaff`, `wStaffReceipts`, `wDrop` (drag and drop), `wCompose` (dialog), `wShortcuts`, `wTablet` (834) and `wTabletInfo` (info as overlay, dark), and the states `wLoading`, `wError`, `wEmpty`, `wNoResults`, `wOffline`, `wClub`. At 1280 the info panel opens over the conversation; at 1440 it is the third pane.

Treat the board markup as the visual reference for layout, spacing, copy and states, not as code to paste. Use our components, tokens and conventions. Where a board value is hardcoded, map it to the nearest token. The boards use sample teams (Falcons, Cubs, Comets) and people; do not ship any of that content.

## 0. Read first, then write a plan

Read before planning:
- Web: `apps/web/src/app/(app)/messages/` (`layout.tsx`, `page.tsx`, `[threadId]`, `new`) and everything in `apps/web/src/components/messages/` (`messages-shell`, `thread-list`, `conversation`, `bubble`, `composer`, `new-message`, `use-thread.ts` and their CSS modules), the sidebar unread badge (`components/app/sidebar.tsx`), the Home Messages tile (`components/home/more-tiles.tsx`), and every link to `/messages` or `/messages/new` in the app (grep; they must keep working, and preselect the team or person where they do today).
- Mobile: `apps/mobile/src/app/(app)/messages/` (`index.tsx`, `[threadId].tsx`, `new.tsx`), everything in `apps/mobile/src/components/messages/` (`thread-list`, `conversation`, `bubble`, `composer`, `new-message`, `use-thread.ts`), `lib/push.ts` (`setOpenThread`, `reportOpenThread`), the tab bar badge, the Home tile, and `package.json` (see the dependency check in section 6).
- Core and db: `packages/core/src/messaging.ts` (runs, day labels, delivery status, merge, previews, unread, outbox backoff), `places.ts` (`teamForScreen`, `isTeamStaff`), `context.ts`, `capabilities.ts`, `schemas/messaging.ts` (`createThreadSchema`), `constants.ts` (`REACTIONS`, attachment limits), `errors.ts` (`friendlyError`), and `packages/db/src/api.ts` (`getThreadList`, `getMessageablePeople`, `createThread`, `getUnreadTotal`, `subscribeToNotifications`, `setThreadMute`, `toggleReaction`, `reportMessage` and the rest of the messaging wrappers).
- Database: `supabase/migrations/20260103000000` to `20260103000300` (threads, participants, messages, thread and message functions), `20260106000000` (`get_thread_list`, `get_unread_total`), `20260106000100` and `20260106000200` (`get_messageable_people`), `20260106000500`, and the messaging pgTAP tests in `supabase/tests/database/` (`fn_get_thread_list`, `fn_set_thread_mute`, `fn_set_thread_archived`, `fn_create_thread`, `fn_get_messageable_people`, `threads_rls`, `messages_rls`, `thread_participants_rls`, and the rest).
- Docs: `docs/messaging-safety.md` (the rules; every rule the UI explains comes from here), `docs/permissions.md`, `docs/notifications.md`, `docs/design-system.md`, `docs/design-system-additions.md`, `docs/design-audit.md`, `docs/context-switcher-proposal.md`.
- Tests: `apps/web/e2e/messaging.spec.ts`, `apps/web/e2e/visual-app.spec.ts`, `apps/web/visual/`, and any mobile manual-test notes (`docs/mobile-manual-tests.md`).

The plan must list: files to delete, files to rewrite, new shared logic in `packages/core`, the **backend additions in section 3** with the exact function, column and test shapes, the native dependency decision (section 6), which design details have no existing component, anything in the design that cannot be wired to data we have, and the order of work (section 8).

## 1. What changes, in one paragraph

Messages stops being "the active team's threads" and becomes **one inbox across every team the person is in**. Today `teamForScreen` picks a single team and silently falls back to the first team, `get_thread_list` takes one team id, and the unread badge counts every team, so a parent with children on two teams sees "3 unread" and finds nothing. After this work the active place no longer affects Messages at all: the team is a quiet chip and a filter. The inbox gets avatars, "You:" and sender previews, search, filter chips, swipe and hover actions, pin, per-person archive and drafts; compose becomes search-and-tap grouped by team; the conversation gets a tappable header with an Info page (members, mute durations, shared media), a media viewer, a new-messages divider, a jump-to-latest button, a camera and PDF attach sheet with per-file progress, and plain-language explanations in place of disabled controls; announcements render as cards. Web gets the same product as a three-pane layout with keyboard shortcuts, drag and drop and paste. The safety rules do not change.

## 2. Who sees what

Visibility keeps coming from `capabilitiesForPlace`, `isTeamStaff` and the database, never from the active place. The board's matrix is a **check**; if it disagrees with the code, keep the code's behavior and list each difference in the PR. Known matrix items to confirm against the code, and how to resolve them:

| Feature | Staff | Parent | Player 13 to 17 | Club admin |
|---|---|---|---|---|
| Unified inbox, avatars, previews | ✓ | ✓ | ✓ | Empty state ("Messages live inside each team") |
| Search | ✓ | ✓ | ✓ | – |
| Filter chips: Unread, Announcements, Archived | ✓ | ✓ | search only (no chips) | – |
| Team chips and team filter | ✓ if 2+ teams | ✓ if 2+ teams | hidden | – |
| New direct message | any allowed person | staff only | own guardian only | – |
| New group, New announcement | ✓ | – | – | – |
| Post in announcement | ✓ | – | – | – |
| React to an announcement | – | ✓ | ✓ | – |
| Read counts and read-by sheet | ✓ | – | – | – |
| Hide a message, reports queue | ✓ | – | – | – |
| Mute, pin, archive for myself | ✓ | ✓ | ✓ | – |
| Members on groups | ✓ | if member | if member | – |
| Members on announcements | count only | count only | count only | – |
| Add or remove group members | group owner (or team admin) | – | – | – |
| Report a message | ✓ | ✓ | ✓ | – |
| Attachments (5, 10 MB, JPEG PNG WebP GIF PDF) | ✓ | ✓ | ✓ | – |

Privacy and safety are unchanged and database-enforced; the UI only explains them. Keep every rule in `docs/messaging-safety.md`: children under 13 have no login; a direct thread with a minor is only with that minor's guardian; a group with a minor needs two staff adults or one staff adult plus a guardian; players 13 to 17 post only in groups staff create and open direct threads only with their own guardian; only staff create groups and announcements and post in announcements; non-staff see messages only from when they joined; staff see read counts and reports; parents never get a list of other families; notification previews are off by default and never carry text for threads with a minor. **Do not loosen anything and do not add a client read that bypasses these functions.** No profile photos (initials only), no "online" or "last seen", no read receipts for non-staff beyond what exists.

## 3. Backend additions (the only backend work) and deviations

Everything else wires to existing reads and writes. These are new. Write each as a migration with pgTAP tests in the existing style, RLS on, SECURITY DEFINER only where the neighbouring functions are, `search_path` pinned, grants as in the neighbouring migrations, and a test for each role (staff, parent, player 13 to 17, a removed member, a stranger).

**3a. `get_inbox`: one read across every team.** Returns what `get_thread_list` returns plus `team_id`, `team_name`, `sport`, `other_profile_id` (direct threads, so compose can show "Open" for an existing thread), `pinned_at` and `archived_for_me` (3b), and for **staff of that team only** `last_read_count` and `last_read_total` for the caller's own newest message (null for everyone else and when the newest message is not the caller's). Paginate (`p_limit`, default 50, and a keyset cursor on `last_message_at` and id) and order pinned first, then newest. **Reuse the same visibility logic as `get_thread_list`** (`can_read_thread`, `can_read_message`, join-time visibility, unread excluding own messages); do not copy the SQL into a second implementation that can drift: factor a private helper both call, or make `get_thread_list` call the shared one. **Parity test:** for each role, `get_inbox` returns exactly the union of `get_thread_list` over the caller's teams. Keep `get_unread_total` unchanged and keep `get_thread_list` (other callers use it). Do not fan out one call per team from the clients.

**3b. Per-person pin and archive.** Add `pinned_at` and `archived_at` to `thread_participants` (own row only; RLS and grants like `muted_until`), and `set_thread_pinned(thread_id, boolean)` and `set_thread_archived_for_me(thread_id, boolean)` built exactly like `set_thread_mute`: an announcement has no participant list, so use the same upsert that creates a `read_only` participant row **that grants nothing** (assert this in a test: a non-member cannot create one, and a removed member's row gives no access). The existing `set_thread_archived` is **thread-wide and manager-only** (the owner, a team admin, or staff for announcements) and stays as it is. The board draws Archive as a swipe action for every role, so the swipe and the Info page use the **per-person** one. Rules to implement: archived-for-me is "archived until the next message" (`archived_for_me = archived_at >= last_message_at`, computed, no trigger), so a new message returns the thread to the inbox; archiving never blocks posting; a thread archived thread-wide by staff is shown in the Archived filter for everyone and replaces the composer (the `convArchived` board). The board's copy "Unarchive it from the info page to reply" shows **only to someone who can unarchive** (can manage the thread); everyone else sees "This conversation is archived." Pinned threads never exceed 5 per person; the 6th returns a friendly error.

**3c. `search_messages(p_query, p_limit)`.** Searches message bodies across every thread the caller can read, **through the same `can_read_message` visibility** (join-time rule included), excluding hidden and deleted messages and attachments' filenames, minimum 2 characters, wildcard characters escaped, default and maximum limit 30, newest first. Returns thread id, message id, team id and name, thread title or other person's name, a short snippet around the match, sender display name and time. Check which extensions already exist; **do not add an extension or an index type without flagging it in the plan** (a plain `ilike` over the readable set is acceptable at current scale; say so). Test that a parent never matches a message from before they joined, a hidden message, another family's direct thread, or a team they left.

**3d. `get_thread_media(p_thread_id)`.** The attachments of a thread the caller can read (images and PDFs): message id, storage path, mime type, size, original name, sender display name, time; same visibility and exclusions as 3c (hidden and deleted messages' attachments never appear). Signed URLs come from the existing attachment helper. Powers the Info page's Media and Files tabs.

**3e. `get_compose_people(p_team_id)`.** Same people as `get_messageable_people`, plus `can_direct` and a reason code, so the client never re-implements "a direct thread with a minor is only with that minor's guardian" (a player 13 to 17 sees staff in the current list although creating that thread would fail). `can_direct` is computed by the same rule `create_thread` enforces (share the helper), and the UI shows non-direct people as disabled rows with the board's plain-language reason (`cPlayer`, `playerNotAllowed`), or hides them where the board does. Keep `get_messageable_people` for existing callers.

**Not built** (decide in the plan, do not build): per-person drafts synced across devices (drafts are **local only**: `localStorage` on web, the key-value store on mobile, per conversation, and never contain message content on the server), a server-side Pin sync beyond 3b, voice notes, read receipts for non-staff, link previews, polls, typing indicators for announcements. Mute needs **no backend**: `set_thread_mute` already accepts any timestamp, so build the board's durations **1 hour and 8 hours plus 1 week and "Until I turn it back on"** (a far-future timestamp, and show it as indefinite); the board draws only the first two, so note this as a small deviation.

**Deviations from the board to list in the PR:** per-person archive and the two-case archived copy (3b); the extra mute durations; compose rows disabled by `can_direct` (3e); anything where the board's copy conflicts with `docs/messaging-safety.md` (the document wins).

## 4. Data wiring and shared logic

- **Inbox:** `get_inbox` (3a), cached and reloaded on the existing realtime signal (`subscribeToNotifications`), after any send, mark-read, mute, pin or archive, and when the app returns to the foreground. The badge stays `get_unread_total`. The Messages screen **no longer depends on the active place or `teamForScreen`**; keep `teamForScreen` for other screens.
- **Row model and priority** (from the rationale view): **Failed to send** (red text and icon replace the preview), then **Unread** (bold title and preview, lime count), then **Draft** ("Draft:" prefix), then **Muted** (bell-slash, quiet count, no lime), then **Archived** (only in the Archived filter, with an archive icon). Previews: "You: ..." for own messages, the sender's first name in groups and announcements, "Removed by staff", "Message deleted", "No messages yet". Time in mono (`listTimeLabel`). Team chip only when the person is in 2+ teams and not a player 13 to 17. Avatar: initials for direct, a group glyph for groups, a megaphone tile for announcements. The most recent **unread announcement** shows as the calm card at the top of All.
- **Filters and search:** All, Unread, Announcements, one chip per team (when 2+, with the sport icon from `sport`), Archived; one tap clears. Search matches conversation names, people and previews already loaded, **plus** `search_messages` results below them once 3 characters are typed (debounced, cancelable, an inline loading row); results open the conversation at the matched message.
- **Compose:** people from `get_compose_people` for each of the person's teams (fetched in parallel, cached per team), grouped by team, results filtered by the search field; a person who is on two of your teams appears under each; an existing direct thread (matched by team and `other_profile_id` from the inbox) shows "Open" instead of starting a new one; `create_thread` reuses the pair anyway. Staff see **New group** and **New announcement** rows; group is a second step (team, name, people with a chip bar) and announcement asks for team, title and first message. The minor rules line and the disabled Create come from a core function that mirrors the database rule (two staff adults, or one staff adult plus a parent); the database stays the authority and its error is still mapped to the same friendly copy.
- **Conversation:** `use-thread` stays the data layer (messages, reactions, attachments, reads, typing, optimistic send and the offline outbox). Add: the **new-messages divider** and **jump to latest** (from the thread's last-read marker), swipe to reply, copy, the **read-by sheet** for staff, the joined-late notice (`convOlder`) for non-staff when messages before their join time are not shown (derive it from existing own-participant and thread data; if it cannot be derived cheaply, say so in the plan), a character counter from 3,800, and the rate-limit banner (`rate_limited` from `send_message`).
- **Composer:** growing text field, an attach button opening the attach sheet (Camera, Photo library, File), **per-file preview chips with progress, remove and Retry**, the limits copy (5 files, 10 MB, JPEG PNG WebP GIF PDF) enforced client-side before upload with the same limits the storage policy enforces, reply bar, the lime send button only when there is something to send, and a **local draft per conversation** that also feeds the inbox "Draft:" prefix. When the person cannot post, the composer is **replaced by the board's one-sentence explanation** (announcement for non-staff, read-only group member, archived thread-wide, club admin) rather than disabled.
- **Info (mobile page, web panel):** header block, **mute** switch with the duration picker, members (searchable on groups, count only on announcements), **Media | Files** from `get_thread_media`, the notifications line, **Archive for me** and **Pin**, and for staff and owners: add or remove people on groups (with the minor rules line), the reports link, and thread-wide archive and unarchive. No "Leave" action (not allowed by the rules).
- **Shared logic in `packages/core`, unit-tested with an injected clock:** inbox filters and search matching; row model and priority; preview text with "You:" and sender first names; team chip rules; draft preview; compose grouping by team and "Open" matching; the minor group rule; mute duration labels and computed `muted_until`; archived-for-me; new-messages divider position; the character counter threshold; joined-late rule; attachment validation. Extend `messaging.ts` rather than creating a parallel file.

## 5. Page, web and mobile

Match the design boards; use existing components first.

- **Mobile inbox:** large title, round lime compose button, pinned search field, filter chips row, the announcement card, rows with swipe right (Mark read or unread), swipe left (Mute, Archive) and a long-press menu (Pin, Mark read, Mute, Archive, Open info), pull to refresh, section header for Pinned, loading skeletons, error with retry, empty states for parent and staff, no results, offline with the cached list readable, and the club-admin empty state. Haptics only where the platform already uses them.
- **Mobile conversation:** glass header with centered avatar, name and second line (team, "typing…", or member count) that opens Info; bubbles in runs with avatar on the last bubble of a run in groups and sender name on the first, day separators, mono time under the last bubble of a run, delivery status words and icons, reply quotes, reaction chips with counts, image grid with the full-screen viewer (swipe between images, close, share, save) and PDF cards, the actions sheet (react row, Reply, Copy, Edit and Delete own, Report, Hide for staff, read-by for staff), announcement **cards** instead of bubbles, "Removed by staff" and "Message deleted" bubbles, offline banner with queued clock icons, and the composer.
- **Web:** the three-pane shell (inbox 340 to 400, conversation, collapsible info panel; two panes at 834 with the info panel as an overlay; one pane at a time on narrow widths), the same rows with **hover actions** instead of swipes, a selected state, keyboard shortcuts (arrows move, Enter opens, `/` focuses search, `c` composes, `Esc` closes info, and the board's `wShortcuts` list as a help overlay), a compose **dialog** (keep `/messages/new` working as a deep link that opens it), drag and drop and paste for images and PDFs with the drop overlay, Enter to send and Shift+Enter for a new line with the hint, hover reactions and a message menu, the info panel, and the page header "Messages" with the total unread beside the sidebar badge (the title no longer names a single team).
- **Accessibility:** rows read as name, team, unread count, preview, time; bubbles as sender, time, status; 44px targets; status never by colour alone (Failed, Sending, Delivered, Read, Draft, Muted are words and icons); polite live regions for new messages and typing, an alert for failed sends; reduce-transparency fallbacks for glass headers, tab bar and sheets; focus returns to the opening row when a sheet, info page or viewer closes.
- If a design detail has no existing component (conversation row, filter chips with sport icon, swipe actions, announcement card, compose result row, attachment strip, jump-to-latest pill, new-messages divider, info panel, mute duration picker, read-by sheet, composer replacement bar), build it from existing primitives. If it truly needs a new variant, add it to `packages/tokens` or the shared UI layer as `docs/design-system.md` describes and list it in `docs/design-system-additions.md`.

## 6. Mobile dependencies (decide in the plan, flag in the PR)

The app uses `expo-dev-client`, so any **new native module needs a new dev build**. Check what is installed and what the design needs: `expo-image-picker` is installed (library and camera via `launchCameraAsync`); `expo-clipboard` is installed (Copy); **PDF attach needs `expo-document-picker`**; image **share and save** need `expo-sharing` (and `expo-media-library` for saving to the photo library); **swipe actions** need either `react-native-gesture-handler` and Reanimated (check whether they are already installed through `expo-router` and which versions) or a hand-built `PanResponder` and `Animated` row with no native dependency. Rules: prefer the option that adds no native module; if you add any, install with `npx expo install` so versions match SDK 58, use the minimum set, request camera and photo permissions with the plain-language reasons the platform requires, and **list every native addition in the PR with the build impact**. If a native module cannot be added, deliver that feature as a clearly marked follow-up (PDF attach on mobile, save and share) and say so; do not fake it.

## 7. Conventions

Phosphor icons through our wrappers, Manrope for UI, IBM Plex Mono for times, counts and numerals, light and dark from tokens, no hardcoded colors or sizes, **lime only for the primary action, the unread count and "now"**, glass only where the system already uses it, solid fallbacks under reduce-transparency, 44px minimum targets, status never by colour alone, web and mobile consistent in copy, ordering and states. Reuse `friendlyError`, `LoadState`, `FormMessage`, `Badge`, `Avatar`, `Sheet`, `EmptyState`, `ErrorState`, `LoadingSkeleton`. Keep the realtime and push behavior (`setOpenThread`, `reportOpenThread`) and the notification deep links to `/messages/<id>` exactly as they are.

## 8. Order of work, and verification

One commit per logical step, in this order: (1) migrations 3a to 3e with pgTAP tests, regenerated database types and db wrappers; (2) shared logic in `packages/core` with unit tests; (3) mobile inbox (rows, filters, search, swipe, pin, archive, drafts); (4) mobile compose (people, group, announcement, player rules); (5) mobile conversation (header, bubbles, divider, jump, actions, viewer) and the composer with attachments; (6) mobile Info and staff tools (read-by, hidden, reports); (7) web inbox and three-pane shell; (8) web conversation, composer (drag, drop, paste), compose dialog, info panel, shortcuts; (9) docs (`docs/messaging-safety.md` gets the new functions and the per-person archive rule, `docs/permissions.md` function list, `docs/design-system-additions.md`), tests and baselines.

- `pnpm` typecheck, lint and unit tests pass; **the full pgTAP suite passes**, including the new tests for every role and the `get_inbox` parity test; the existing messaging `fn_*` and RLS tests pass untouched.
- Vitest coverage for every shared function above, with the injected clock.
- Playwright + Axe, web: update `apps/web/e2e/messaging.spec.ts` and keep the test ids `thread-row`, `unread-dot`, `message`, `message-scroller` and `attach-input` working (or update every use); a person on two teams sees both teams' conversations in one list with team chips and the team filter; unread filter; announcement card and parent react-only; compose search and open an existing thread; staff group and announcement creation; the minor group rule blocks Create with the plain message; a player 13 to 17 cannot start a direct thread with staff and sees why; pin, mute durations, archive for me and return on a new message; search across messages respects join-time and hidden messages; attachments (including drag and drop and a rejected oversize file); read-by for staff only; hide and report still work; keyboard shortcuts; the info panel; club admin empty state. Update the visual baselines in `apps/web/visual/`, light and dark as drawn.
- **Privacy verified by test, not by reading:** a parent never receives another family's thread, another team's threads they are not in, messages from before they joined, hidden or deleted bodies, or staff-only read counts; `thread_participants` pin, archive and mute rows grant no access; notifications still carry no text for threads with a minor.
- Mobile: run the app on a device or simulator and report what you ran (inbox, swipe, compose, send and receive, attach, offline queue and retry, viewer, Info). Compare your screenshots with the boards (`inbox`, `convMain` dark and light, the swipe, compose, Info, announcement and state boards on mobile; `w3pane`, `wTwo`, `wCompose`, `wTablet`, `wTabletInfo` and the state boards on web), list every visible difference you chose to leave, and do not claim anything works that you did not run.
- Run the code review you would want before merging and fix what it finds.

## 9. Delivery

Open a PR with: summary, files removed, the design-to-component mapping, the migrations and what each changes, how the inbox replaced the per-team read, every native dependency added and its build impact, screenshots next to the design, test results, and a **list of anything you were unsure about, deferred, or that disagrees with the design** (including the deviations in section 3 and any matrix differences). Do not claim something works unless you ran it.

## Decisions already made

1. One unified inbox across every team; the active place no longer scopes Messages; the team is a chip and a filter.
2. Threads stay per team; the same person on two of your teams is two separate direct threads, each labeled with its team.
3. No club-level messaging. A pure club admin sees the empty state and nothing else.
4. Backend is limited to 3a to 3e. Drafts are local only; no server-side draft sync.
5. Archive in the inbox is **per person** and returns on the next message; thread-wide archive remains a staff action that closes the conversation for posting.
6. Mute durations are 1 hour, 8 hours, 1 week and until turned back on, with no backend change.
7. Initials only for avatars; no profile photos, no "online" or "last seen", no new read receipts for non-staff.
8. Safety rules are unchanged and explained in plain words before the database enforces them; the database stays the authority.
9. Mobile is the priority: if time forces a cut, web ships second, and any native module that cannot be added becomes a marked follow-up instead of a fake.
