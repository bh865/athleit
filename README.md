# Athleit

Youth sports team management, on web and mobile. This repo is **Phase 0**: the foundation
(monorepo, backend, auth, design tokens, CI). No product features yet.

- **Web:** Next.js (App Router) in `apps/web`
- **Mobile:** Expo (React Native, Expo Router) in `apps/mobile`
- **Backend:** Supabase (Postgres, Auth, Realtime, Storage, Edge Functions), run locally with the Supabase CLI
- **Shared:** Zod validation, Vitest unit tests, pgTAP database tests

## Prerequisites

| Tool                                                            | Version | Notes                                                                                       |
| --------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| Node.js                                                         | 22+     | `.nvmrc` pins 22 (`nvm use`)                                                                |
| pnpm                                                            | 9.15    | `corepack enable` picks the version from `package.json`                                     |
| Docker Desktop, OrbStack or Colima                              | recent  | **Required by `supabase start`.** Nothing in the DB flow works without a container runtime. |
| Xcode (iOS Simulator) and/or Android Studio, or the Expo Go app | -       | Only to run the mobile app                                                                  |

## First-time setup

```bash
pnpm install
pnpm db:start        # starts the local Supabase stack (first run pulls Docker images)
pnpm db:reset        # applies supabase/migrations and seed.sql
pnpm supabase status # prints the API URL and keys you need below
```

Then create the two env files (see [Environment variables](#environment-variables)):

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env.local
# paste the API URL and Publishable key from `pnpm supabase status` into both files
```

Run everything:

```bash
pnpm dev             # web on http://localhost:3000, Expo dev server for mobile
```

`pnpm dev` runs both through Turborepo's TUI. Expo's interactive menu (press `i` for iOS, `a` for Android) works best in its own terminal: `pnpm dev:mobile`. Web alone: `pnpm dev:web`.

Sign up on either app with email and password. Local Supabase auto-confirms, so you land on **Home** showing your profile display name. Auth emails (if you turn confirmations on) appear in Mailpit at http://127.0.0.1:54324.

### Design gallery

Both apps have a dev-only design gallery that mirrors the design system (colours, type, spacing, radii, the three glass levels, every component and state) in light and dark, plus a "Reduce transparency" toggle. It is the visual-regression target:

- Web: http://localhost:3000/dev/design (hidden in production builds unless `NEXT_PUBLIC_DESIGN_GALLERY=1`)
- Mobile: link at the bottom of the sign-in screen (dev builds), or open `athleit://design`

## Daily commands

| Command                        | What it does                                                              |
| ------------------------------ | ------------------------------------------------------------------------- |
| `pnpm dev`                     | Run web and mobile dev servers                                            |
| `pnpm build`                   | Build everything that has a build (web)                                   |
| `pnpm lint`                    | ESLint across the workspace                                               |
| `pnpm typecheck`               | `tsc --noEmit` across the workspace                                       |
| `pnpm test`                    | Vitest unit tests (`core`, `tokens`)                                      |
| `pnpm e2e`                     | Playwright end-to-end tests (web) against the project in `.env.local`     |
| `pnpm format` / `format:check` | Prettier write / check                                                    |
| `pnpm db:types`                | Regenerate `packages/db/src/database.types.ts` from the local DB          |
| `pnpm db:test`                 | RLS-test guard, then pgTAP tests against the linked project (rolled back) |
| `pnpm db:push:dry` / `db:push` | Show / apply pending migrations to the linked project                     |
| `pnpm supabase <args>`         | Run the pinned Supabase CLI, e.g. `pnpm supabase migration new add_teams` |

## Repo map

```
apps/
  web/        Next.js 16 App Router. proxy.ts refreshes the Supabase session; src/components/ui = primitives
  mobile/     Expo SDK 58 + Expo Router. src/components/ui = primitives; metro.config.js
packages/
  tokens/     Design tokens: TS object (React Native) + generated theme.css (web) + CONTRAST.md
  db/         Generated DB types and typed Supabase client factories (web server/browser, mobile)
  core/       Zod schemas, constants, env parsing, small utilities
  config/     Shared tsconfig, ESLint and Prettier configs
supabase/     config.toml, migrations/, seed.sql, tests/database (pgTAP). See supabase/README.md
scripts/      db-types.sh, check-rls-tests.sh
.github/workflows/ci.yml
```

Workspace packages ship TypeScript (and CSS) **source**, with no build step. Web compiles them via `transpilePackages`; Metro compiles them natively.

## Using a hosted Supabase project instead of Docker

The Supabase CLI 3.x targets the **local** stack unless you pass `--remote`. If you can't or don't want to run Docker, develop against a hosted **dev** project:

```bash
pnpm supabase login
pnpm supabase link --project-ref <ref>
pnpm db:push:remote      # apply supabase/migrations
pnpm db:types:remote     # regenerate packages/db/src/database.types.ts
pnpm db:test:remote      # pgTAP via scripts/db-test-remote.sh (always rolls back)
```

In the dashboard: turn off Auth → Email → "Confirm email" (otherwise sign-up returns no session), and add `http://localhost:3000/**`, `athleit://**` and `exp://**` under Auth → URL Configuration (see "Password reset and confirmation links" below for the production origins). Use the project URL (`https://<ref>.supabase.co`) and publishable key in both `.env.local` files. Only point this at a disposable dev project; CI still tests against a throwaway local stack.

## Environment variables

Env vars are validated with Zod at startup (`apps/web/src/env.ts`, `apps/mobile/src/env.ts`); a missing or malformed value fails immediately with the variable name. `.env*` files are git-ignored except `.env.example`. Never commit secrets.

| App    | Variable                        | Where it comes from                                                                                           |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| web    | `NEXT_PUBLIC_SUPABASE_URL`      | `pnpm supabase status` → **API URL** (`http://127.0.0.1:54321`)                                               |
| web    | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `pnpm supabase status` → **Publishable key** (`sb_publishable_...`)                                           |
| mobile | `EXPO_PUBLIC_SUPABASE_URL`      | same API URL; on a physical phone use your computer's LAN IP, on the Android emulator `http://10.0.2.2:54321` |
| mobile | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | same Publishable key                                                                                          |

Optional sign-in variables (all public; unset means off):

| App    | Variable                                 | Effect                                                                                                         |
| ------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| web    | `NEXT_PUBLIC_AUTH_GOOGLE` / `_APPLE`     | `true` shows that provider's button. Leave unset until the provider is enabled in the Supabase project.        |
| mobile | `EXPO_PUBLIC_AUTH_GOOGLE` / `_APPLE`     | Same. Apple is listed first on iOS and Google first on Android; with neither set, email is the primary button. |
| web    | `NEXT_PUBLIC_TERMS_URL` / `_PRIVACY_URL` | "Terms" and "Privacy Policy" in the consent line (and the account page) link here. Unset renders plain text.   |
| mobile | `EXPO_PUBLIC_TERMS_URL` / `_PRIVACY_URL` | Same for the mobile consent line.                                                                              |

The legacy `anon` JWT from `supabase status` also works in these variables. Both are _public_ values (shipped to browsers/apps; Row Level Security is what protects data). The `service_role`/secret key must never go in an app env file. Restart the dev server after changing env files (Expo inlines `EXPO_PUBLIC_*` at bundle time).

## Google and Apple sign-in

The code and UI are wired in both apps, and `supabase/config.toml` has **disabled placeholder** blocks (`[auth.external.google]`, `[auth.external.apple]`). They need real credentials, which you supply later:

1. Put secrets in `supabase/.env` (git-ignored): `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET`.
2. Fill in each `client_id` in `config.toml` and set `enabled = true`.
3. `pnpm db:stop && pnpm db:start`.

4. Set `NEXT_PUBLIC_AUTH_GOOGLE=true` / `EXPO_PUBLIC_AUTH_GOOGLE=true` (and `_APPLE`) for the builds that should show the button. **A provider's button never appears without its flag**, so a build can't offer a sign-in the project can't complete.

Email/password is the verified path. Google and Apple sign-in have not been exercised end to end.

## Password reset and confirmation links

Reset and email-confirmation links return through `/auth/callback` on web and `athleit://auth/reset` / `athleit://auth/callback` on mobile. For each hosted project, add these under Auth → URL Configuration (they are already in `supabase/config.toml` for the local stack):

- **Site URL**: the production web origin.
- **Redirect URLs**: `https://<web origin>/**` (web), `athleit://**` (mobile), `exp://**` (Expo dev) and `https://athleit.app/**` (universal links).

The reset email's link is single use and expires after an hour; an expired or reused link lands on "This link has expired". The app's reset link uses the `athleit://` scheme on both platforms, and web reset and sign-in links finish in the browser that started them (the PKCE verifier lives there), so `/auth/*` is deliberately **not** a universal link. 

### Universal links (invite, claim and registration links open the app)

The web app serves `/.well-known/apple-app-site-association` for iOS (`apps/web/src/app/.well-known/apple-app-site-association/route.ts`), claiming `/invite/*`, `/claim/*` and `/r/*` for `<APPLE_TEAM_ID>.com.athleit.app`; Android claims the same paths with the intent filters in `app.json`. Set `APPLE_TEAM_ID` (your 10 character Apple Developer Team ID) and `ANDROID_CERT_SHA256` (the signing certificate fingerprint, comma separated for several; Play Console > App signing) where the web app runs, both server only. `/.well-known/assetlinks.json` is served the same way for Android's `autoVerify` filters. With either unset its file answers 404 instead of serving a placeholder (an earlier static copy of both files with `TEAMID` and `REPLACE_WITH_...` placeholders was removed: it answered 200 with ids that can never verify). Check with `curl -i https://athleit.app/.well-known/apple-app-site-association` (status 200, `application/json`, no redirect).

Password changes need the current password, enforced by the server (`require_current_password = true` in `supabase/config.toml`; reset-link sessions are exempt). A hosted project must turn on the same setting (Auth → Sign In / Providers → Email → "Require current password when updating"), otherwise any open session could change the password through the API. Resend of a confirmation email has a 60 second cooldown in the apps; `[auth.email] max_frequency` is the server's own limit.

Local config has `enable_confirmations = false`, so the "Check your email" screen never appears against the local stack. Test it against a hosted project, or by mocking a `signUp` response with no session.

## Testing

- **Unit (Vitest):** `pnpm test`. Includes the WCAG AA contrast assertions for every token pair.
- **Database (pgTAP):** `pnpm db:test`. See [supabase/README.md](supabase/README.md) for how to write an RLS test for a new table.

### End-to-end tests

`pnpm e2e` builds the web app, starts it, and runs `apps/web/e2e` with several isolated browser sessions against the project in
`apps/web/.env.local` (use a **dev or test project only**). Tests create `e2e-*@example.test` users. Set
`E2E_SUPABASE_SERVICE_ROLE_KEY` in your shell (never in a file that ships) and the run deletes them afterwards; without it,
run `bash scripts/e2e-cleanup.sh`. Mobile flows: [docs/mobile-manual-tests.md](docs/mobile-manual-tests.md).

## Branching and CI

- All work happens on short-lived working branches cut from **`dev`** (e.g. `feat/teams-roster`) and is merged back into `dev`.
- **CI runs only when a branch is merged into `dev`** (a push to `dev`). Feature-branch pushes, pull requests and `main` do not trigger it, so run `pnpm lint && pnpm typecheck && pnpm test` locally before merging.
- `main` is the release branch: it only receives merges from `dev` once CI there is green.

## Conventions

1. **Membership-based permissions.** Access is granted through membership rows (`team_memberships`, `club_memberships`, `household_members`), never through owner columns or client-side checks. Every RLS policy calls the `private.*` helper functions. The role/capability table in [docs/permissions.md](docs/permissions.md) is the source of truth.
2. **No table ships without RLS tests.** Every table in `public` has RLS enabled and a `supabase/tests/database/<table>_rls.test.sql` proving who can and cannot read/write each row. `pnpm db:test` and CI fail otherwise.
3. **Vertical-slice delivery.** A feature ships on web **and** mobile together (schema + RLS + tests + both UIs), not layer by layer or platform by platform.
4. **Stripe webhooks are the source of truth for payments.** Never mark anything paid because a client says so or a redirect returned. Payment state changes only from verified Stripe webhook events handled server-side (idempotently); the UI reads that state.

5. **Never hardcode design values; use semantic tokens and shared components.** Design changes start in the design system, then the token contract (`packages/tokens/tokens.contract.json`). See [docs/design-system.md](docs/design-system.md). Lint (ESLint + Stylelint) fails CI on colour literals, raw px/radius/spacing/font values, direct Phosphor or blur imports.

## Decisions

Choices made in Phase 0 where a version, compatibility or tooling decision was needed:

- **Versions:** Next.js 16.4, Expo SDK 58 (React Native 0.88), React 19.3.0 (exact: the version Expo and Next both pin), Zod 4, Vitest 5, Turborepo 2. Expo-managed native packages use the SDK's `~` ranges from `expo install`.
- **TypeScript 6.0 (not 7):** TypeScript 7 is the newest release, but Expo's template pins `~6.0` and `typescript-eslint` support is the constraint, so the whole repo stays on `~6.0.3`.
- **ESLint 9 (not 10):** `eslint-config-next` 16 and `eslint-plugin-react-hooks` are validated against 9.
- **`proxy.ts`, not `middleware.ts`:** Next 16 renamed the middleware convention. `src/proxy.ts` refreshes the Supabase session with `@supabase/ssr` and gates routes.
- **`getClaims()` in the proxy:** validates the JWT locally and refreshes it as needed; Server Components call `getUser()` for an authoritative check.
- **Metro:** Expo SDK 52+ configures monorepos automatically and SDK 54+ supports pnpm's default isolated `node_modules`, so `metro.config.js` is just `getDefaultConfig(__dirname)`. No `node-linker=hoisted`, no manual `watchFolders`. CI bundles the app to catch regressions.
- **No Tailwind / UI library:** primitives are plain CSS Modules on the token CSS variables (web) and `StyleSheet`-style objects on the token TS object (mobile).
- **Mobile OAuth is browser-based (PKCE)** via `expo-web-browser` for both Google and Apple: one code path, no native modules. Native Sign in with Apple / Google Sign-In (ID-token flow) is the likely follow-up; Apple review expects Sign in with Apple when other social logins exist.
- **Session storage:** `expo-secure-store` through a small chunking adapter (`packages/core/src/chunked-storage.ts`, unit-tested) because a Supabase session exceeds SecureStore's ~2 KB value guidance.
- **Glass on Android:** `expo-blur` only blurs a designated target view there, so content behind glass is wrapped in `GlassBackdrop`; without it Android renders the tint only. iOS "Reduce Transparency" is honored automatically; Android has no such setting, so the in-app override (`useTheme().setReduceTransparencyOverride`, shown in the gallery) is the fallback for low-end devices.
- **Profiles are least-privilege on top of RLS:** `anon` has no grants; `authenticated` can `select` and can `update` only `display_name` and `avatar_url`. Signup profile creation is a `SECURITY DEFINER` trigger.
- **Local auth:** email confirmations off, minimum password 8 characters (`supabase/config.toml`).
- **`db:types`:** `packages/db/src/database.types.ts` is generated (`pnpm db:types`), written to a temp file first so a failed run never truncates it. The local and hosted generators format output differently, so CI does not diff it: regenerate from the hosted dev project (`pnpm db:types:remote`) after every migration and commit the result.
- **Theme tokens:** `packages/tokens/theme.css` and `CONTRAST.md` are generated by `pnpm --filter @athleit/tokens build:css`; a test fails if they drift from the TS tokens.
