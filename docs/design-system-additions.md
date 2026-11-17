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

## Still not in the system, and not built

Schedule, Event detail and RSVP, Alerts, Messages, Pay and the related states. They are Phase 3+; their components (Sheet, Toast,
ListRow, Chip, EmptyState and friends) already exist and are in the gallery.
