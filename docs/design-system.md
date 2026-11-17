# Design system in code

The design system lives in the Athleit design system artifact; a copy of its files is in [`docs/design-system/`](design-system/).
This page explains how its values reach the code, and how to change them.

**Rule:** never hardcode design values. Use semantic tokens and the shared components. Design changes start in the design system,
then the token contract, then the token data.

## How tokens flow

```
packages/tokens
  src/primitives.ts      LAYER 1  raw palette, spacing/radius steps, font families, icon sizes   (names say what, never where)
  src/semantic.ts        LAYER 2  semantic names (background, surface, ink, accent, bubbleOwn, ok, ...) + light/dark maps -> primitives
  src/glass.ts                    structured glass: per level tint/border/highlight, blur, saturation, shadow, fallback; backdrop blobs
  src/components.ts      LAYER 3  component knobs (button height, input radius, avatar sizes, tab bar, list row, ...)
  src/typography.ts               type scale (display, title, heading, body, caption, label, mono, monoLg)
  src/themes.ts                   resolves a theme definition into the flat `Theme` the apps use; registry (`registerTheme`)
  tokens.contract.json            EXACT design-system values, light and dark: the sync point
        |
        +--> scripts/build-css.ts  ->  theme.css  (web: CSS variables, [data-theme], OS fallback, reduced transparency)
        +--> typed `Theme` object  ->  mobile (useTheme().theme.color.ink, theme.glass.sheet, ...)
        +--> `SemanticColorName`   ->  shared type for both platforms
```

- **Components use only semantic tokens** (`var(--color-ink)`, `theme.color.ink`), component tokens (`var(--size-button-height)`,
  `componentTokens.button.height`) and the `space`/`radius` steps. They never use primitives or literals.
- Primitives are not exported from the package entry; `@athleit/tokens/primitives` is for the tokens package itself and lint blocks it elsewhere.
- Generated files (`theme.css`, `CONTRAST.md`) come from `pnpm --filter @athleit/tokens build:css`; a unit test fails if they are stale.

## Shared building blocks (web and mobile)

| Piece                                                                                                                                                         | Web (`apps/web/src/components/ui`)      | Mobile (`apps/mobile/src/components/ui`) | Shared (`packages/ui-core`)                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| Theme provider + hook (the only place theme choice is made)                                                                                                   | `theme-provider.tsx`, `theme-script.ts` | `theme.tsx`                              | `ThemeMode`, theme registry (tokens)               |
| Icon wrapper (the only Phosphor import)                                                                                                                       | `icon.tsx`                              | `icon.tsx`                               | `IconName` list (both maps must cover it)          |
| Typography (fonts loaded once)                                                                                                                                | `text.tsx`, `app/layout.tsx`            | `text.tsx`, `lib/fonts.ts`               | variants live in tokens                            |
| Logo (mark, lockup, app icon)                                                                                                                                 | `logo.tsx`                              | `logo.tsx`                               |                                                    |
| Glass (the only blur)                                                                                                                                         | `glass.tsx` (backdrop-filter)           | `glass.tsx` (expo-blur)                  |                                                    |
| Button, IconButton, TextField, Select, Chip, Badge, StatusDot, Avatar, ListRow, Card, SegmentedControl, Sheet, Toast, EmptyState, ErrorState, LoadingSkeleton | same names                              | same names                               | variants, status mapping, initials, avatar palette |
| Sidebar (web) / TabBar (mobile)                                                                                                                               | `components/app/sidebar.tsx`            | `components/ui/tab-bar.tsx`              |                                                    |
| Backdrop blobs                                                                                                                                                | `body` background in `globals.css`      | `backdrop.tsx`                           |                                                    |

Reduced transparency: web sets `[data-reduce-transparency]` (OS media query or the in-app toggle) which swaps every glass tint for the solid
`surface` and removes blur and shadow; mobile's `Glass` renders the solid fallback with a visible edge. Neither needs per-component code.

## Guardrails

CI (`pnpm lint`) fails on:

| Rule                                                                                                           | Enforced by                                                                         |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Hex / rgb / hsl literals outside `packages/tokens`                                                             | ESLint `no-restricted-syntax`, Stylelint `color-no-hex`, `function-disallowed-list` |
| Raw numbers for radius, padding, margin, gap, font size/weight, line height, letter spacing, shadow, elevation | ESLint (`packages/config/eslint/design.mjs`)                                        |
| Raw `px` / `rem` for the same properties in CSS                                                                | Stylelint `declaration-property-unit-disallowed-list`                               |
| Literal font families                                                                                          | ESLint, Stylelint (`font-family` must be a `var()`)                                 |
| Direct imports of `@phosphor-icons/*` or `phosphor-react-native`                                               | ESLint `no-restricted-imports` (allowed only in `icon.tsx`)                         |
| `expo-blur`, `backdrop-filter`, `backdropFilter` outside Glass                                                 | ESLint, Stylelint (allowed only in `glass.tsx` / `glass.module.css`)                |
| Primitive tokens in components                                                                                 | ESLint `no-restricted-imports` (`@athleit/tokens/primitives`)                       |

Documented exception (needs a reason, shows up in review and in `rg design-exception`):

```ts
// eslint-disable-next-line no-restricted-syntax -- design-exception: <why this literal is correct>
```

```css
/* stylelint-disable-next-line <rule> -- design-exception: <why> */
```

Other guards: `tokens.contract.json` equality test, WCAG contrast pairs (`CONTRAST.md`), `visual` Playwright project, `e2e/visual-app.spec.ts`.

## Common tasks

### Change a token value

1. Change the design system first (artifact and the copy in `docs/design-system/`).
2. Update `packages/tokens/tokens.contract.json` to the new value.
3. Update the token data (`primitives.ts`, or the theme map in `semantic.ts` / `glass.ts` / `components.ts`).
4. `pnpm --filter @athleit/tokens build:css` and `pnpm --filter @athleit/tokens test`. The contract test must pass; fix any contrast failure it reports.
5. `pnpm --filter @athleit/web visual:update`, review every changed image, commit them.

### Add a semantic token

Add its name to `semanticColorNames`, a value to **both** theme maps, the contract entry, and (if text sits on it) a contrast pair in `contrast-pairs.ts`. TypeScript forces every theme to define it.

### Add a theme

Add a `ThemeDefinition` to `themeDefinitions` (or call `registerTheme('club-x', def)` at runtime for data-driven themes), plus a contract entry if it is part of the design system.
The generator emits `[data-theme="club-x"]` and `[data-theme-scope="club-x"]` blocks; `ThemeMode` is any registered name. No component changes.
Per-club theming is **not built**; this is the extension point.

### Add a component

1. Put variants, names and pure helpers in `packages/ui-core`.
2. Add component knobs (if any) to `components.ts` and the contract.
3. Build the web file (CSS Module using only `var(--…)`) and the mobile file (using `useTheme()` + tokens). Keep both thin.
4. Export from each `ui/index.ts`, add it to both galleries, regenerate visual baselines.

### Add an icon

Add the name to `iconNames` (ui-core), then to the `icons` map in both `icon.tsx` files (the type forces both).

## Sync routine when the design system changes

1. Download the new artifact files into `docs/design-system/` and diff against git.
2. Update `tokens.contract.json` for every changed value.
3. Update token data until `pnpm --filter @athleit/tokens test` passes.
4. Run `pnpm lint typecheck test`, then `pnpm --filter @athleit/web visual`.
5. `visual:update`, review the image diff, and walk the mobile checklist in `docs/mobile-manual-tests.md`.
6. Note new screens or components in `docs/design-system-additions.md`.

## Re-theme in an hour (verified)

Verified on a scratch branch by changing the accent from lime to orange and reverting:

1. In `packages/tokens/src/primitives.ts` change `lime: '#CCFF33'` and `limePressed: '#B7E62E'` (two values).
2. `pnpm --filter @athleit/tokens build:css` (regenerates `theme.css`; 10 variables changed, none left with the old value).
3. Run the web app (or `pnpm --filter @athleit/web build`). Result: primary buttons, active sidebar item, count badges, avatar slot 1, the logo in dark mode,
   the app icon tile, the backdrop blob and the dark focus ring all switched. Mobile reads the same data through `useTheme()`, so it follows without edits.
   Evidence: [`docs/design-audit/after/retheme-walkthrough-orange-dark.png`](design-audit/after/retheme-walkthrough-orange-dark.png).
4. `git grep -ni ccff33 -- apps packages` outside the tokens package, contract and design-system copy finds nothing, so nothing was left behind.
5. The contract test **failed** (7 tests), which is the intended signal that the change must be made in the design system and `tokens.contract.json` first.
   Do that, rerun the tests, then update visual baselines.

A new palette, fonts (`fontFamily` + the loaders in `app/layout.tsx` and `lib/fonts.ts`), radii (`radius`), glass recipe (`glass.ts`) or a data-driven brand theme
(`registerTheme`) follow the same path: edit token data, regenerate, run tests, update baselines.
