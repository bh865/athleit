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

## Messaging (Phase 3, web slice built; mobile slice pending)

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

Not built yet: thread info screen (members, mute, leave), moderation review queue UI, notification preferences, device list and in-app notification centre (Part C), and all mobile screens.

## Still not in the system, and not built

Schedule, Event detail and RSVP, Alerts, Messages, Pay and the related states. They are Phase 3+; their components (Sheet, Toast,
ListRow, Chip, EmptyState and friends) already exist and are in the gallery.
