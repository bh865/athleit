# Design audit (Stage 1)

Branch `design-system-conformance`, cut from `origin/buildout` (635b35d). No product code was changed in this stage.

- **Source of truth:** the Athleit design system artifact (`System`, `Web`, `Mobile`, `Logo` pages). A copy is saved in [`docs/design-system/`](design-system/) so the repo carries it.
- **Method:** read every design file; read all of `packages/tokens`, every shared UI component and every screen in `apps/web` and `apps/mobile`; scanned the code for design-value leaks (counts below come from a script over `apps/*/src`, excluding tests and e2e); captured "before" screenshots of the public web pages in light and dark.
- **Not done in Stage 1:** authenticated web screens and the mobile app were not screenshotted. Authenticated screens need a signed-in hosted-Dev user, and no iOS build exists on this machine yet. Both are covered by the Stage 4 visual tests and the simulator checklist.

## 1. Headline

The code is disciplined about _where_ values come from. Hex, px and font leaks are small (section 4). The gap is that **the token data itself and the component shapes are an older design than the current system.**

1. Almost every token value that matters differs from the system: dark background, dark surface, text-muted, status colours, glass blur, saturation and tints. There are no backdrop blobs, no `line`, no "sent" tokens, no glass shadows, and the type scale is different.
2. Shared components use the wrong shape language. Buttons and inputs use a 16px radius where the system uses pills and radius 18. The active tab and the selected chip use a different style, and lists are bordered cards instead of 1px-separated rows.
3. The app has **no sidebar, no floating tab bar and no logo**. Navigation is a top glass bar on web and plain stacks on mobile.
4. Most system screens (Schedule, Event, Messages, Pay, Alerts) are not in Phases 0 to 2, so there is nothing to conform for them. Section 3 maps what exists.

## 2. Token diff (`packages/tokens` vs system)

Legend: **diff** = value differs; **missing** = no token exists.

### Colour, light

| Role                    | System                            | Repo                                                                | Status                                                                                                   |
| ----------------------- | --------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| background              | `#F3F8FB`                         | `#F3F8FB`                                                           | match                                                                                                    |
| surface                 | `#FFFFFF`                         | `#FFFFFF`                                                           | match                                                                                                    |
| surface-2               | `#EAF3F8`                         | `surfaceMuted` = `#E1EFF6` (ice)                                    | **diff** (repo uses brand ice; system surface-2 is a lighter tint)                                       |
| ink                     | `#272A2B`                         | `#272A2B`                                                           | match                                                                                                    |
| muted                   | `#586266`                         | `#4A5558`                                                           | **diff**                                                                                                 |
| line                    | `rgba(39,42,43,.08)`              | `border` = `#CBDAE2` (opaque)                                       | **diff**                                                                                                 |
| sent / sentInk          | `#272A2B` / `#F3F7F9`             | none                                                                | **missing**                                                                                              |
| ok / warn / bad         | `#1F7A3E` / `#9A6200` / `#B3261E` | success `#17653A`, warning `#7A4800`, danger `#B3261E` (+ bg/solid) | **diff** (ok, warn). bad matches. The repo adds `bg`, `solid`, `onSolid` that the system does not define |
| focus ring              | not specified                     | charcoal (light), lime (dark)                                       | system silent; see Decisions                                                                             |
| brand charcoal/lime/ice | `#272A2B` / `#CCFF33` / `#E1EFF6` | same                                                                | match                                                                                                    |

### Colour, dark

| Role            | System                            | Repo                              | Status              |
| --------------- | --------------------------------- | --------------------------------- | ------------------- |
| background      | `#17191A`                         | `#1B1E1F`                         | **diff**            |
| surface         | `#242728`                         | `#272A2B`                         | **diff**            |
| surface-2       | `#2F3334`                         | `#333738`                         | **diff**            |
| ink             | `#F3F7F9`                         | `#F3F7F9`                         | match               |
| muted           | `#A9B3B8`                         | `#A9B6BB`                         | **diff** (3 digits) |
| line            | `rgba(255,255,255,.08)`           | `#3F4446`                         | **diff**            |
| sent / sentInk  | `#CCFF33` / `#272A2B`             | none                              | **missing**         |
| ok / warn / bad | `#8FE3A8` / `#FFD27A` / `#FF9A8A` | `#6FD392` / `#F4B84A` / `#FF8F86` | **diff**            |

The repo also carries a **dark-mode accent-ink and light-mode accent-ink** (`#445F00` olive) to put accent-coloured text on light surfaces. The system never uses lime as text; it uses "sent" instead. `accentInk` can probably be replaced by `sent` (see Decisions).

### Glass

| Item                          | System (light / dark)                                                   | Repo                                         | Status                                      |
| ----------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| Bar tint                      | `rgba(255,255,255,.55)` / `rgba(44,48,50,.55)`                          | `.72` white / `#1B1E1F` at `.72`             | **diff**                                    |
| Sheet tint                    | `.74` white / `rgba(40,44,46,.72)`                                      | `.82` white / charcoal `.8`                  | **diff**                                    |
| Modal tint                    | `.84` white / `rgba(36,40,42,.84)`                                      | `.9` white / charcoal `.88`                  | **diff**                                    |
| Blur (bar / sheet / modal)    | 24 / 40 / 60 px                                                         | 20 / 32 / 48 px                              | **diff**                                    |
| Saturation                    | 180%                                                                    | 160%                                         | **diff**                                    |
| Border                        | white `.9` / white `.14`                                                | `.7`/`.8`/`.9` light, `.14`/`.16`/`.18` dark | **diff** (single value per theme in system) |
| Inner top highlight           | white `.95` / `.16`                                                     | none                                         | **missing**                                 |
| Shadow                        | bar none; sheet `0 12 40 / 8%`; modal `0 20 60 / 14%`                   | none                                         | **missing**                                 |
| Reduced-transparency fallback | solid surface                                                           | solid surface, blur off                      | match (web + mobile)                        |
| Backdrop blobs                | lime `.42`/`.13`, ice `#CFE5F1`/`rgba(110,160,190,.22)` over background | none (smoke page paints ad hoc discs)        | **missing**                                 |

### Type

| Item                  | System                                                                                                                | Repo                                                                       | Status                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Families              | Manrope, IBM Plex Mono                                                                                                | same                                                                       | match                                                                                                                 |
| Scale                 | Display 44/800, Title 32/800, Heading 20/700, Body 16/500, Caption 13/600, Label 12/700 uppercase +.08em, Mono 28/500 | `xs`…`4xl` pixel ladder (12/14/16/18/20/24/30/36), weights 400 to 700 only | **diff**: different names, different sizes (no 13, 32 or 44), no 800 weight, no letter-spacing tokens, no label style |
| Fonts loaded (mobile) | Manrope 400 to 800, Plex Mono 400 to 600                                                                              | Manrope 400/500/600/700, Plex Mono 400/500                                 | **diff**: 800 and Plex Mono 600 missing                                                                               |

### Spacing, radii, sizes

| Item         | System                                                                                   | Repo                                                                                 | Status                                                                       |
| ------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Spacing      | 4, 8, 12, 16, 24, 32, 48                                                                 | 0, 2, 4, 8, 12, 16, **20**, 24, 32, **40**, 48, **64**                               | superset. `5`, `10`, `16` (20/40/64) are not in the system; see Decisions    |
| Radii        | 12, 16, 20, 28, pill                                                                     | 16, 20, **24**, 28, full                                                             | **diff**: 12 missing; 24 not in the system's list (but cards are "24 to 28") |
| Button       | pill, 48 to 64 high                                                                      | 48 high, radius 16                                                                   | **diff**                                                                     |
| Input        | 52 to 56 high, radius 18, surface-2 fill, focused = 2px `sent` border, no resting border | 48 high, radius 16, surface fill, 1px `borderStrong` at rest, 3px focus-ring outline | **diff**                                                                     |
| List row     | 64 to 68 high, 1px separators                                                            | 56 high, bordered card per row                                                       | **diff**                                                                     |
| Card         | surface, 1px line, radius 24 to 28                                                       | surface, 1px border, radius 24                                                       | near match (border colour differs)                                           |
| Tab bar      | 68 high, radius 34, lime pill for active                                                 | none                                                                                 | **missing**                                                                  |
| Sidebar      | 248 wide, radius 28, lime pill active                                                    | none (top glass bar)                                                                 | **missing**                                                                  |
| Icon weights | regular / fill when active, 22 to 24px                                                   | regular only, mixed sizes                                                            | **diff**                                                                     |

### Structure (not value) gaps in the token package

- Two layers only (raw data + a flat `ThemeColors` object). No **primitive vs semantic vs component** split. Brand hexes are repeated inside both theme objects.
- Glass is split across `glassMaterials` (blur, saturation) and `glassThemes` (tint, border). There is no `shadow`, `highlight` or per-level fallback field.
- `theme.css` is generated and tested for freshness. There is **no contract file** pinning the design-system values, so nothing detects the drift above. (The existing contrast tests only check legibility.)
- CSS output exposes `--color-*`; the mobile side imports TypeScript objects. Both come from the same data, which is good. There is no shared semantic-name type.

## 3. Screens vs system

"Before" images for public pages are in [`docs/design-audit/before/`](design-audit/before/). A screenshot cell reading "needs auth" means the screen sits behind sign-in and will be captured by the Stage 4 visual tests.

| App screen (web / mobile)                               | System counterpart                        | Verdict                  | Main drift                                                                                                                                                                                             | Screenshot                              |
| ------------------------------------------------------- | ----------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Sign in, sign up (web / mobile)                         | none                                      | **no system equivalent** | Compose from system parts. Wordmark is plain text; no logo mark.                                                                                                                                       | `before/web-sign-in-*`, `web-sign-up-*` |
| Home (`/`, `(app)/index`)                               | Home                                      | drifts                   | System Home has "Next up" card, stats, quick actions. App Home is a list of contexts.                                                                                                                  | needs auth                              |
| App chrome (web `Shell`, mobile stack)                  | Sidebar (web) / floating Tab bar (mobile) | **drifts / missing**     | Top glass bar with switcher, theme toggle and sign out. No sidebar, no tab bar.                                                                                                                        | needs auth                              |
| Context switcher                                        | none (closest: chips + popover sheet)     | no system equivalent     | Uses bordered select; should be a glass Sheet popover with list rows.                                                                                                                                  | needs auth                              |
| Create team, create club                                | Add a child (form pattern)                | drifts                   | Input and button shapes; no system form layout beyond Add a child.                                                                                                                                     | needs auth                              |
| Team overview, members, requests, invites, settings     | Roster (list + detail)                    | drifts                   | Section tabs use bottom-border tabs; system uses chips or segmented control. Rows are bordered cards.                                                                                                  | needs auth                              |
| Roster (players list)                                   | Roster                                    | drifts                   | No avatars, no status dots, no detail panel; rows are cards.                                                                                                                                           | needs auth                              |
| Household / Family (`/family`)                          | Family                                    | drifts                   | System shows child cards with avatar, age, team chips. App shows list rows without avatars.                                                                                                            | needs auth                              |
| Add a child (`/family/children/new`)                    | Add a child                               | drifts                   | Input shape and focus state; button shape.                                                                                                                                                             | needs auth                              |
| Child detail + photo (`/family/children/[id]`)          | none                                      | no system equivalent     | Photo upload. Uses an emoji glyph as an icon (see leaks).                                                                                                                                              | needs auth                              |
| Join (code entry), Invite `[token]`, Claim `[playerId]` | none                                      | no system equivalent     | Mono input exists in the system ("codes"). Page layout does not.                                                                                                                                       | needs auth                              |
| Invite panel (QR, code, link)                           | none                                      | no system equivalent     | White QR tile has a hard-coded `#fff` (it must stay white for scanning; see Decisions).                                                                                                                | needs auth                              |
| Club page                                               | none                                      | no system equivalent     |                                                                                                                                                                                                        | needs auth                              |
| Empty / loading / error (`LoadState`, mobile `Notice`)  | Empty, Loading, Error states              | **drifts**               | Loading is the text "Loading…" (system: skeleton rows). Empty is a tinted text box (system: 88px circle icon, title, line, one action). Error is a red box (system: icon, plain message, "Try again"). | needs auth                              |
| Toasts / form messages                                  | Toast (glass sheet pill, fill icon)       | drifts                   | Inline tinted notices only; no toast component exists.                                                                                                                                                 | needs auth                              |
| Smoke screens (`/smoke`, `athleit://smoke`)             | System page                               | drifts                   | Dev-only. Replace with the Stage 4 gallery.                                                                                                                                                            | `before/web-smoke-*`                    |
| Schedule, Event detail + RSVP, Alerts, Messages, Pay    | Schedule, Event, Alerts, Messages, Pay    | **not built yet**        | Phase 3+ per the brief. Nothing to conform; the gallery will carry the components they need.                                                                                                           | n/a                                     |

Screens the system defines that the app lacks: Schedule, Event detail, Messages, Chat, Pay, Request, Confirm, Receipt, Alerts, "All caught up". The brief lists Schedule, Event, RSVP and Alerts among the screens to conform, but **those screens are not in Phases 0 to 2** (confirmed by listing every route). I will not invent them; see Decisions.

## 4. Design-value leak inventory

Counts of occurrences in `apps/web/src` and `apps/mobile/src` (excluding tests and e2e).

| Leak type                                                    | Total | Where (count)                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hex / rgb / hsl literal                                      |     6 | mobile `smoke.tsx` 3; mobile `invite-panel.tsx` 1; web `app.module.css` 1 (`#fff` QR tile); web `context-switcher.module.css` 1                                                                                                     |
| raw `px` in CSS                                              |    42 | `app.module.css` 13; `context-switcher.module.css` 8; `button`, `text-field`, `theme-toggle` css 4 each; `smoke.module.css` 2; 6 other files 1 each                                                                                 |
| numeric style props (radius, padding, gap, font, size, etc.) |   106 | `app.module.css` 14; mobile `smoke.tsx` 12; `smoke.module.css` 12; mobile `context-switcher.tsx` 6; web `smoke/page.tsx` 5; the rest spread over 23 files (`auth-form`, `kit`, `family/children`)                                   |
| inline `style={{…}}` objects                                 |   131 | 35 files; heaviest: mobile `smoke.tsx` 15, `kit.tsx` 14, `auth-form.tsx` 10, `team/roster.tsx` 9, `context-switcher.tsx` 8, `clubs/[id].tsx` 7                                                                                      |
| font-family literal                                          |    11 | web `globals.css` 2, `text-field.module.css` 2, one each in `app`, `context-switcher`, `button`, `theme-toggle` css; mobile `auth-form.tsx`, `text-field.tsx`, `text.tsx`                                                           |
| direct Phosphor import                                       |    10 | 10 files, one each (5 web, 5 mobile); no Icon wrapper exists                                                                                                                                                                        |
| blur / backdrop-filter outside a Glass component             |     0 | all 14 occurrences are inside `glass-bar` (web css/tsx, mobile tsx). Clean today.                                                                                                                                                   |
| theme logic outside the provider                             |     1 | web `app/layout.tsx` (`data-theme` bootstrap script); the rest sit in mobile `theme.tsx` (the provider)                                                                                                                             |
| duplicated components across platforms                       |   ~12 | Button, TextField, Card, Badge, GlassBar, ThemeToggle, ThemeProvider, LoadState/Notice, FormMessage, ListItem, Choice, Tabs, Context switcher, Invite panel: two independent implementations each. Props are similar but not shared |
| glyph-as-icon (emoji / unicode)                              |     2 | web `family/children/[id]/page.tsx`; mobile `kit.tsx`                                                                                                                                                                               |
| ad hoc shadows                                               |     0 | none today (the system's glass shadows are simply absent)                                                                                                                                                                           |

Most numeric leaks are small (`gap: 2`, `size: 20`, `minHeight: 56`) and need a component token or a spacing step, not a colour change. The six colour literals are the only ones that fail light/dark.

## 5. Light/dark, reduce-transparency, targets, focus, contrast

- **Light/dark parity:** both themes cover every semantic token; contrast is already unit-tested (see `packages/tokens/CONTRAST.md`). Parity breaks only where drift above applies. Mobile and web both support light, dark and system, and both have an in-app reduce-transparency override. The two pieces of theme logic are separate (web: inline bootstrap script + provider; mobile: provider).
- **Reduce transparency:** correct on both platforms (solid surface, no blur, visible border). It must be extended when the glass recipe gains shadow and highlight (they should drop out too).
- **Tap targets:** `minTarget` = 44 and buttons are 48, so targets pass. The system's round glass icon buttons (44 to 48) have no counterpart yet. The web theme-toggle segments are `min-height: 40px`, **below the 44px target** (polish).
- **Focus:** web uses a 3px outline in `focusRing` with a 2px offset on buttons, inputs and rows. The system specifies a 2px `sent` border on focused inputs. Keyboard focus on other controls is not specified, so I will keep the outline for non-input controls (decision 3).
- **Contrast on glass:** the repo's tests use the worst-case backdrop for glass text. The system's lower bar tint (`.55` vs `.72`) is **more transparent**, so the worst-case test must be re-run with the new tints; `muted` text on a `.55` bar will probably fail 4.5:1 over lime blobs. Primary text on glass should still pass. Details in decisions 4.
- **Muted vs `#586266` on `#F3F8FB`:** 5.85:1 on bg, 5.57:1 on surface-2 (passes). Dark `#A9B3B8` on `#17191A`: 8.26:1, on surface-2 5.98:1 (passes).
- **Lime as text:** the system never sets text in lime. The repo's dark `accentInk = lime` is allowed by the brief ("small badges") only as a fill. Replace with `sent`.

## 6. Findings by severity

### Broken

None that stops a user. (Everything renders, both themes work, tests pass.)

### Drift (does not match the system)

1. Token values (colour, glass, type, radii) differ from the system (section 2).
2. Glass lacks inner highlight, shadow and blobs. The app background is flat, so glass has nothing to refract.
3. Primary button, secondary button and input shapes (radius, height, fill, focus).
4. No sidebar (web) and no floating tab bar (mobile).
5. List rows are bordered cards, not 1px-separated rows; no avatars, status dots or caret anywhere.
6. Chips and segmented control are not implemented. Mobile `Choice` uses a lime fill with a focus-ring border where the system uses the `sent` fill. Web section tabs use an underline.
7. Empty, loading and error states do not follow the system (text only).
8. No toast component.
9. No logo anywhere (wordmark is plain text, no favicon or app-icon check was made).
10. Type scale and weights (no 800, no label style, no mono 28).

### Polish

0. Web theme-toggle segments are 40px high (target is 44).
1. Two independent implementations of every shared component.
2. 10 direct Phosphor imports; icons are always regular weight, even when selected.
3. Font families written out in 11 places.
4. 42 raw px values in web CSS, mostly small.
5. Emoji used as an icon in two places.
6. Mobile fonts lack Manrope 800 and Plex Mono 600.
7. `docs/` has no design documentation; README says nothing about design conventions.

## 7. UX observations (noted, not changed)

- On web the whole team area (members, requests, invites, settings) sits behind one tab row, and the roster and members views overlap in purpose. The system's Roster is a list with a side panel. Merging them is a product decision; I will conform the existing views and not restructure them.
- The mobile app has no persistent navigation; every context change goes through the context switcher. The system's tab bar has five slots (Home, Schedule, Messages, Pay, More), and only Home and Family/More exist today. I would ship a tab bar with the tabs that exist (see decisions).

## 8. Proposed plan for Stages 2 to 4

**Stage 2: token architecture** (one package, no UI change except values)

1. `packages/tokens/src/primitives.ts` (palette, spacing, radii, fonts, type steps), `semantic.ts` (theme maps), `components.ts`, `glass.ts` (structured, with shadow, highlight, fallback, blobs). Themes: `light`, `dark`, plus a `themes` registry that accepts more.
2. Generators: `theme.css` (variables, `[data-theme]`, system fallback, reduce-transparency), a typed RN theme object, and a `SemanticTokenName` type shared by both.
3. `tokens.contract.json` with the design-system values for both themes, and a test that generated output equals it. Keep the existing contrast test and regenerate `CONTRAST.md`.
4. Per platform: one `ThemeProvider` + `useTheme` hook (web already has one, mobile has one; consolidate theme choice there). Add `Icon`, `Text`/`Heading`/`Label`/`Mono`, `Logo` and `Glass` wrappers.

**Stage 3: conform UI**

1. A shared `packages/ui-core` for non-visual logic only (variant names, props types, avatar palette picker, status mapping). Platform packages stay thin. This is an addition, not a framework change. Web keeps CSS Modules (it is not the cause of drift); mobile keeps StyleSheet/inline styles, fed by the typed theme.
2. Build or fix, in this order: Glass, Icon, Text, Button, TextField, Chip, Badge, Avatar, StatusDot, ListRow, Card, SegmentedControl, Sheet, Toast, EmptyState, LoadingSkeleton, ErrorState, Sidebar (web), TabBar (mobile).
3. Migrate screen groups in separate commits: auth; shell and switcher; home; create team and club; family and child; team (roster, members, requests, invites, settings); join, invite, claim; club.
4. Move every leaked value (section 4) onto tokens; delete the duplicated component and dead CSS.
5. Components and screens with no system equivalent go in `docs/design-system-additions.md`.

**Stage 4: guardrails**

1. ESLint (`no-restricted-syntax`, `no-restricted-imports`, a small local rule for numeric style props) and Stylelint for web CSS: no colour literals, no raw px, no `font-family`, no Phosphor outside `Icon`, no `backdrop-filter`/`expo-blur` outside `Glass`, no primitive token imports outside the theme layer. Documented exception comment: `/* design-exception: <reason> */`. Add them to CI.
2. `/dev/design` (web, dev only) and a mobile dev screen mirroring `System.dc.html`.
3. Playwright screenshot tests for the gallery and key screens in light and dark, with seeded data. The existing e2e fixtures create users on hosted Dev; visual tests for authenticated screens reuse that and are therefore CI-only, like the e2e job. Gallery tests need no backend.
4. `docs/design-system.md`, re-theme walkthrough (verified on a scratch branch), README Conventions line.

## 9. Decisions needed from you

1. **Phases 0 to 2 do not contain Schedule, Event detail, RSVP or Alerts.** The brief lists them under "refactor every screen" and also under visual tests. Which do you want?
   - (a) Conform only what exists, and put the missing screens' components (Sheet, Toast, ListRow, Chip) in the gallery. **Recommended.**
   - (b) Build placeholder screens for them. That would add routes and product surface, against "do not change product behavior".
2. **Navigation.** Adding the system's glass sidebar (web) and floating tab bar (mobile) changes the layout the e2e specs click through. I recommend adding them, wiring only to routes that exist (Home, Family, plus Team/Club entries from the context switcher, and a "More" slot on mobile), and keeping the theme toggle and sign-out reachable. e2e selectors will be updated only where markup changed.
3. **Focus ring.** The system gives inputs a 2px `sent` border and says nothing about other controls. Keeping the 3px outline on buttons, rows and tabs is an accessibility requirement the system does not contradict. I recommend keeping it, in `sent`.
4. **Contrast on the system's glass.** Bar tint at 55% is more transparent than the current 72%. If the worst-case-backdrop test fails for `muted` text on glass I will keep the system values and apply the rule already in `CONTRAST.md` (no `muted` text on glass), rather than darken the tint. Tell me if you would prefer the opposite.
5. **Status colours.** The repo has `bg`, `solid` and `onSolid` per status; the system defines one colour each. I plan to keep the single system colour as the token and derive tinted backgrounds from it at runtime (`color-mix`), so a re-theme needs only three values. Alternative: keep four values per status.
6. **Accent ink.** The system has no equivalent of `accentInk` (olive text on light). I propose to remove it and use `sent`/ink for accent-coloured text, since lime is "never body or large area fill". This changes the colour of a few links and active tab labels.
7. **Spacing and radii.** The repo has spacing 20, 40, 64 and a radius 24 that the system's list omits (cards are "24 to 28", so 24 is plausible). I propose to keep 24 and add 12, and to drop 20/40/64 spacing only if nothing uses them (I will check in Stage 2). Confirm.
8. **QR tile.** The invite QR must stay black on white to scan, in dark mode too. It will be a documented, tokenised exception (`qrSurface`, `qrInk`) in the contract rather than a literal.
9. **Type scale rename.** Components currently say `size="2xl"` / `weight="bold"`. The system names are Display/Title/Heading/Body/Caption/Label/Mono. I propose to replace the old names everywhere (no alias layer). Say so if you want a transition period.
10. **Mobile screenshots.** No iOS build or simulator run exists yet, and no `EXPO_PUBLIC` env is set on this machine (see memory note). I will provide a simulator checklist and, if the Expo/simulator build works here in Stage 4, gallery screenshots; otherwise they go to CI or to you.
11. **Extra weights and font files.** Matching the type scale means loading Manrope 800 and Plex Mono 600 on mobile and in `next/font` on web (small bundle increase). Assumed OK.

## 10. Components and screens with no system equivalent (so far)

Sign in / sign up; context switcher; child detail with photo upload; join, invite and claim flows; invite panel (QR, code, link); club page; team members, requests, invites and settings; segmented section navigation. All will be composed from system components and listed in `docs/design-system-additions.md` after Stage 3.
