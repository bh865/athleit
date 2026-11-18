# Design-system additions

Screens and components the app needs that the design system (System, Web, Mobile, Logo) does not show yet. Each was composed
from existing tokens and components with no new visual language. Add them to the design system when you next update it
(then update `tokens.contract.json` if any value changes; see [design-system.md](design-system.md)).

Screenshots: web light/dark in [`docs/design-audit/after/`](design-audit/after/); authenticated screens are captured by
`apps/web/e2e/visual-app.spec.ts` in CI.

## Screens with no system equivalent

| Screen (web / mobile)                                            | Composed from                                                                          | New component or variant                                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Sign in, sign up                                                 | Logo lockup, Card, TextField, Button (primary, secondary), divider                     | Text divider ("or") between button groups; provider buttons use secondary + brand icons |
| Context switcher (sidebar on web, top of every screen on mobile) | Surface-alt trigger, Glass sheet popover (web) / Sheet (mobile), list rows             | Trigger field styled like TextField; "Add a role" label row                             |
| Home onboarding ("Welcome", choose a role)                       | Card, Button stack                                                                     | none                                                                                    |
| Create team, create club, join with code, add child form         | Card, TextField (mono for codes), Select, chips on mobile, Button                      | `Select` (native select styled like TextField); mobile `Choice` (chip radio group)      |
| Family: children list, login requests                            | ListGroup, ListRow, Avatar, Badge status, Button                                       | none                                                                                    |
| Child detail with photo                                          | Card, Avatar photo, file picker link, Badge                                            | Photo tile (radius 16, 96px) beside an "add/change photo" text action                   |
| Team sections (roster, requests, invites, members, settings)     | Chips as section tabs (selected = "sent" fill), ListGroup, Card                        | Chip row used for navigation (web: links; mobile: radio chips)                          |
| Roster row with player panel                                     | ListRow button with Avatar, mono jersey number, status Badge; Card panel under the row | Expand-in-place player panel (system shows a side panel)                                |
| Invite link panel (QR, code, copy/share)                         | Card, mono Text, Button; QR tile                                                       | QR tile: always dark-on-white (`qrSurface`, `qrInk` tokens) so it scans in both themes  |
| Invite landing and claim screens                                 | Card, Button, Notice                                                                   | none                                                                                    |
| Club page (team requests, teams)                                 | Card, ListRow, Button                                                                  | none                                                                                    |

## New components and variants introduced

- **Notice / FormMessage** (inline message): `surfaceAlt`, `okSoft` or `badSoft` tinted rounded box (radius 16) with caption text. Used for form feedback and short explanations. Soft tints are derived tokens (`okSoft`, `warnSoft`, `badSoft`), 8% (light) or 14% (dark) alpha.
- **Badge** (status): a dot + label for `success/warning/danger`, a quiet pill for `neutral`, and a lime mono pill for `count`.
- **Sidebar collapse** on narrow web widths: the 248 glass sidebar becomes a stacked glass block above the content below 900px.
- **More sheet** (mobile): the tab bar's fifth slot opens a glass sheet with the theme control and Sign out, since there is no Settings screen yet.
- **Theme control** (`ThemeToggle`): a segmented control (lime selected pill) for Light / Dark / System.
- **Backdrop** (mobile) and **body background** (web): the blob recipe from the system, applied to the app background.

## Messaging (Phase 3, web and mobile)

Composed from existing tokens and components. New component tokens (`componentTokens.bubble.maxWidthWeb/Mobile` and `componentTokens.chat.*`: list width 340, header 76/112, composer 56/52, send button 40, thread avatar 44/52, reaction chip 24, typing dot 8, unread dot 10) and icons (`paperclip`, `arrow-up`, `arrow-down`, `megaphone`, `info`, `thumbs-up`, `heart`, `smiley`, `confetti`, `hands-clapping`, `star`, `arrow-bend-up-left`, `flag`, `file-pdf`, `bell-slash`, `eye-slash`, `prohibit`, `trash`, `pencil`, `shield-check`) were added through the token layers and the Icon wrappers.

| Screen / component                                            | Composed from                                                                                                            | Notes                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Announcement post                                             | Surface card, `Label` kicker "ANNOUNCEMENT", caption author, time and (staff only) read count                            | Calm: no bubble, no composer for non-staff ("Only coaches and managers can post here.")                 |
| Reply-to quote inside a bubble                                | Left rule in `currentcolor`, caption text, two-line clamp                                                                | Quote inherits the bubble's ink so it works on both bubble fills                                        |
| Image attachment and PDF chip                                 | Radius-md image in the bubble; surface-alt chip with `file-pdf` icon                                                     | Signed URLs, 1h; images are never full-width of the thread                                              |
| New-message flow                                              | Card, `SegmentedControl` (Direct / Group / Announcement), `Chip` people picker, `TextField`, plain-language safety notes | Parents and teens only see Direct; the database still decides and its answer is shown in friendly words |
| Message actions (hover or focus on web; long-press on mobile) | Row of 44px ghost icon buttons: five reactions, reply, report or delete, and "Remove for everyone" for staff             | Revealed on hover and on keyboard focus                                                                 |
| Removed-message placeholder                                   | `surface-alt` bubble, muted italic "Removed by staff" / "Message deleted"                                                |                                                                                                         |
| Failed-send state                                             | Bubble at 60% opacity while sending; "Failed to send · Retry · Discard" in the meta line                                 |                                                                                                         |
| New-messages pill                                             | Glass sheet pill with `arrow-down`                                                                                       | Appears when messages arrive while scrolled up                                                          |
| Typing indicator                                              | Three muted dots in a `bubbleOther` bubble with the tail corner                                                          | Supabase Broadcast on a private channel                                                                 |
| Report sheet                                                  | Glass `Sheet`, `TextField`, primary Button                                                                               |                                                                                                         |

Mobile mirrors the web screens: the Messages tab (lime count badge via `TabItem.badge`), a full-screen conversation without the tab bar, long-press actions in a glass `Sheet`, and an offline send queue (Sending, then Failed with Retry and Discard).

## Notifications (Phase 3, Part C)

| Screen / component                  | Composed from                                                                                                                                                                      | Notes                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Alerts (in-app notification centre) | The system's "alerts" list: 44px icon circle, bold title, muted detail, caption time; recent items on lime circles                                                                 | "Mark all read" secondary button; Settings link top-right                                                  |
| Notification settings               | Cards with a category x channel switch grid, `TextField` times, timezone `Select` (web) or device timezone (mobile), preview switch, device list with ghost "Sign out this device" | The switch is a native checkbox styled with `bubbleOwn` (charcoal in light, lime in dark), not lime-filled |
| In-app toast                        | Existing glass sheet pill with the `bell` fill icon (neutral tone)                                                                                                                 | Not shown for the thread you are viewing                                                                   |
| Sidebar "Alerts" item               | Existing sidebar item with the `bell` icon                                                                                                                                         |                                                                                                            |

Not built yet: thread info screen (members, mute, leave), moderation review queue UI.

## Phase 2: scheduling (composed from existing tokens and components)

The system specifies Schedule (mobile list, web list with a 400 glass drawer), Event detail and the Home "Next up" card; those are
built as drawn (date block, "time · location", type chip, mono counts, 64px lime Going pill, surface-2 Can't go pill, check-circle /
x-circle / clock list). Everything below is NOT in the system yet; each is composed from existing tokens and components.

| Screen / component                                                  | Composed from                                                                                                               | Notes                                                                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Month grid (web)                                                    | Surface cells, `radius.md`, lime "today" pill, surface-alt event chips                                                      | New `MonthGrid`; up to 3 events per day then "+N more"; cancelled events struck through                               |
| Week view (web)                                                     | Day headings + the Schedule rows                                                                                            | Month/Week segmented control as drawn; prev/next/Today controls are IconButton + ghost Button                         |
| New / edit event sheet                                              | Sheet, SegmentedControl (type, repeat, ends, home/away), TextField, Select, Chip (weekdays, "save for next time"), TextArea | **New `TextArea`** primitive (web), styled like TextField. Mobile uses Choice chips and typed date/time fields        |
| Series scope picker                                                 | SegmentedControl ("This event / This and following / All events")                                                           | Shown only for series events, in the edit and cancel flows                                                            |
| Cancel flow                                                         | Sheet (modal level), TextArea, Button                                                                                       | Reason required; cancelled events stay listed, struck through, with the reason                                        |
| Game result sheet                                                   | Sheet, SegmentedControl (final / by period), TextField mono, Text                                                           | Shaped by the sport: half / quarter / period / inning / set; sets show "sets won"; ties message only where disallowed |
| Result and record display                                           | Mono chip on the row ("W 3-2"), title line in the drawer                                                                    | `team_record` is available but has no screen yet                                                                      |
| Per-child RSVP                                                      | Chips (mobile child chips) or labelled groups (web), Going / Can't go pills, quiet "Maybe" ghost button                     | A status line ("Maya: Going") is announced to screen readers                                                          |
| "Updated" / cancelled banners                                       | Notice-style box (`warnSoft`, `badSoft`)                                                                                    | Shown on the event when its revision changes or it is cancelled                                                       |
| Places and opponents manager                                        | Sheet, ListGroup, ListRow, IconButton (trash), TextField                                                                    | Saved locations and opponents per team                                                                                |
| Calendar link settings                                              | Sheet, mono token text, Button (copy / reset / turn off)                                                                    | Link shown once; only a hash is stored                                                                                |
| Schedule tab (mobile), Schedule nav item (web), Team "Schedule" tab | Existing TabBar / Sidebar / team tabs                                                                                       | New icons: `map-pin`, `link`, `arrow-clockwise`, `repeat`, `question`                                                 |

New component tokens (`packages/tokens/src/components.ts`, `schedule`): `dateBlockWeb` 64, `dateBlockMobile` 48, `drawerWidth` 400,
`rsvpButton` 52, `rsvpButtonLg` 64, `calendarCellMinHeight` 96, `calendarDot` 6, `avatarSmall` 32. The first four come from the
Web and Mobile Schedule screens; the calendar sizes are additions.

Gallery and baselines: three new sections ("Schedule · rows and month", "Schedule · event detail", "Schedule · flows") in light
and dark under `apps/web/visual/`. The visual project now runs in `America/New_York` so fixtures do not depend on the machine.

## Still not in the system, and not built

Alerts, Pay and the related states (Phases 4 and 5), a team record screen, and staff-set RSVPs in the UI.

## Payments (Phase 4)

The system specifies the Pay list, request detail, confirm sheet, receipt, the three states, the staff "New payment request" + collection
card and the Home payment rows; those are built as drawn (56px mono total, lime pay pill, glass confirm modal, 88px lime check circle, progress
ring with a mono percent, status dots). Everything below is NOT in the system; each is composed from existing tokens and components.

| Screen / component                     | Composed from                                                                                              | Notes                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Payouts status + "Set up payouts"      | Card, Badge (neutral / warning / danger / success), Button                                                 | Four states: not started, in review, needs info, ready (+ disconnected). Opens Stripe's hosted onboarding |
| Fee policy selector + live breakdown   | SegmentedControl ("We pay the fee" / "Families pay a service fee"), line rows, mono amounts                | Breakdown uses the shared fee module; copy labels the pass-through "Service fee" (legal review pending)   |
| Audience picker                        | Select ("Everyone on the active roster" / "Selected players") + checkbox list                              | Team only; a club sends to every active player on its linked teams                                        |
| Confirm review (server-computed lines) | Sheet (modal), line rows, mono total                                                                       | Item lines, Athleit charge, service fee, total: from `payer_checkout_quote`, never from the client        |
| Stripe Payment Element / PaymentSheet  | Stripe Appearance API fed from semantic tokens (web: CSS variables; mobile: theme colours, `input` radius) | Apple Pay / Google Pay via Stripe; needs a development build on mobile                                    |
| Processing state                       | Centered heading + status text                                                                             | Shown until the webhook marks the payment paid; "taking longer" copy after ~20 s                          |
| Failure states                         | Notice (`badSoft`), warning-circle in IconCircle, "Try again"                                              | Declined, authentication failed, network lost, already paid in the household, request cancelled           |
| Multi-request checkout                 | Checkbox rows, summed mono total, one lime pay pill                                                        | Different payees or fee terms must be paid separately (server refuses mixed sets)                         |
| Payer history / receipts               | ListRow-style rows with receipt id, SegmentedControl (Due / Receipts), receipt card                        |                                                                                                           |
| Collection detail rows + actions       | Badge status, mono amounts, ghost buttons (Paid offline, Waive, Refund)                                    | Refund is admin-only; a "Disputed" danger badge appears on flagged requests                               |
| Record offline / waive / refund sheets | Sheet, Select, TextField (mono for amounts), Button                                                        | All audited server-side                                                                                   |
| Dispute notice                         | Notice (danger)                                                                                            | Staff also get a notification                                                                             |
| Club-issued view                       | Same staff screen under `/clubs/[id]/payments`                                                             | Names and totals only for events the club issued                                                          |
| CSV export                             | Secondary button with `download-simple`                                                                    | Formula-safe cells; no card data                                                                          |
| Mobile staff payments                  | Cards: payouts, new request (typed due date), collection with progress bar, remind / waive / paid-cash     | Refund, audience picker and CSV are web-only for now                                                      |

New tokens and icons: text variant `monoXl` (56 / 60, 500, -0.03em) for the Pay and receipt amounts; icons `receipt`, `bank`, `download-simple`.
Gallery and baselines: "Payments · pay and receipt", "Payments · staff", "Payments · states" in light and dark (`apps/web/visual/`).
Not built: edit-draft (drafts are created and sent in one step), a payment event detail page, a separate payer-history screen on mobile beyond Receipts.

## Polish pass (date pickers, popovers, headings)

| Piece                                                   | Composed from                                                                                                                                                                        | Notes                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Date and time pickers (web popover, mobile glass sheet) | TextField look (icon + friendly text), `Popover` (web), `Sheet` level modal (mobile), IconButton (month arrows), lime selected day, ringed today, chips-style month and year chooser | Select a day and it commits at once (no Done); time needs Done because it takes three choices. Date logic is shared in `packages/ui-core/src/dates.ts` (date-only ISO strings, never a local `Date`).                                                                                      |
| Solid popovers (`Glass solid`)                          | Glass modal shadow + `surface` fill, no blur                                                                                                                                         | **Deviation:** the design shows menus as glass. A backdrop-filter nested inside another backdrop-filter (e.g. a menu inside the glass sidebar) blurs nothing in Chromium, so sidebar labels showed through. Menus, popovers and pickers that sit over text are therefore opaque `surface`. |
| Page heading                                            | `PageHeader`: 36px/800 title, muted subtitle, actions slot at right                                                                                                                  | Used by every authenticated page. **Deviation (Messages):** the design puts the "Messages" title inside the thread-list card; the app puts the page heading above the two-column layout like every other page.                                                                             |
| Backdrop blobs on mobile                                | Same blob tokens as web                                                                                                                                                              | Rendering fix only (alpha as `stopOpacity`, farthest-corner sizing); token values unchanged.                                                                                                                                                                                               |

**Open question for the design system:** the Web design shows page titles at 36px / 800; the `title` token is 32px with a 36px line height. `PageHeader` uses the token (32/36, 800, -0.02em) so no new token was invented; if 36px is intended, change `title` in the contract.
