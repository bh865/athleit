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

### Smoke-test screens

Both apps have a design smoke test that renders every primitive (Button, TextField, Card, GlassBar, glass bar/sheet/modal, status colours, Manrope/IBM Plex Mono) over a vivid backdrop with a Light/Dark/System switch and a "Reduce transparency" toggle:

- Web: http://localhost:3000/smoke
- Mobile: link at the bottom of the sign-in screen (dev builds), or open `athleit://smoke`

## Daily commands

| Command                        | What it does                                                              |
| ------------------------------ | ------------------------------------------------------------------------- |
| `pnpm dev`                     | Run web and mobile dev servers                                            |
| `pnpm build`                   | Build everything that has a build (web)                                   |
| `pnpm lint`                    | ESLint across the workspace                                               |
| `pnpm typecheck`               | `tsc --noEmit` across the workspace                                       |
| `pnpm test`                    | Vitest unit tests (`core`, `tokens`)                                      |
| `pnpm format` / `format:check` | Prettier write / check                                                    |
| `pnpm db:start` / `db:stop`    | Start / stop the local Supabase stack                                     |
| `pnpm db:reset`                | Re-create the local DB from migrations + `seed.sql`                       |
| `pnpm db:types`                | Regenerate `packages/db/src/database.types.ts` from the local DB          |
| `pnpm db:test`                 | RLS-test guard, then pgTAP tests (`supabase test db`)                     |
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

In the dashboard: turn off Auth → Email → "Confirm email" (otherwise sign-up returns no session), and add `http://localhost:3000/**`, `athleit://**` and `exp://**` under Auth → URL Configuration. Use the project URL (`https://<ref>.supabase.co`) and publishable key in both `.env.local` files. Only point this at a disposable dev project; CI still tests against a throwaway local stack.

## Environment variables

Env vars are validated with Zod at startup (`apps/web/src/env.ts`, `apps/mobile/src/env.ts`); a missing or malformed value fails immediately with the variable name. `.env*` files are git-ignored except `.env.example`. Never commit secrets.

| App    | Variable                        | Where it comes from                                                                                           |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| web    | `NEXT_PUBLIC_SUPABASE_URL`      | `pnpm supabase status` → **API URL** (`http://127.0.0.1:54321`)                                               |
| web    | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `pnpm supabase status` → **Publishable key** (`sb_publishable_...`)                                           |
| mobile | `EXPO_PUBLIC_SUPABASE_URL`      | same API URL; on a physical phone use your computer's LAN IP, on the Android emulator `http://10.0.2.2:54321` |
| mobile | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | same Publishable key                                                                                          |

The legacy `anon` JWT from `supabase status` also works in these variables. Both are _public_ values (shipped to browsers/apps; Row Level Security is what protects data). The `service_role`/secret key must never go in an app env file. Restart the dev server after changing env files (Expo inlines `EXPO_PUBLIC_*` at bundle time).

## Google and Apple sign-in

The code and UI are wired in both apps, and `supabase/config.toml` has **disabled placeholder** blocks (`[auth.external.google]`, `[auth.external.apple]`). They need real credentials, which you supply later:

1. Put secrets in `supabase/.env` (git-ignored): `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET`.
2. Fill in each `client_id` in `config.toml` and set `enabled = true`.
3. `pnpm db:stop && pnpm db:start`.

Until then the buttons show Supabase's "provider is not enabled" error. Email/password is the verified path.

## Testing

- **Unit (Vitest):** `pnpm test`. Includes the WCAG AA contrast assertions for every token pair.
- **Database (pgTAP):** `pnpm db:test`. See [supabase/README.md](supabase/README.md) for how to write an RLS test for a new table.

## Branching and CI

- All work happens on short-lived working branches cut from **`dev`** (e.g. `feat/teams-roster`) and is merged back into `dev`.
- **CI runs only when a branch is merged into `dev`** (a push to `dev`). Feature-branch pushes, pull requests and `main` do not trigger it, so run `pnpm lint && pnpm typecheck && pnpm test` locally before merging.
- `main` is the release branch: it only receives merges from `dev` once CI there is green.

## Conventions

1. **Membership-based permissions (Phase 1).** Access is granted through membership rows (a user's role in a club/team), never through ad-hoc per-table owner columns or client-side checks. Phase 1 introduces the membership tables and a single set of helper functions that every RLS policy calls. Until then `profiles` is own-row only.
2. **No table ships without RLS tests.** Every table in `public` has RLS enabled and a `supabase/tests/database/<table>_rls.test.sql` proving who can and cannot read/write each row. `pnpm db:test` and CI fail otherwise.
3. **Vertical-slice delivery.** A feature ships on web **and** mobile together (schema + RLS + tests + both UIs), not layer by layer or platform by platform.
4. **Stripe webhooks are the source of truth for payments.** Never mark anything paid because a client says so or a redirect returned. Payment state changes only from verified Stripe webhook events handled server-side (idempotently); the UI reads that state.

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
- **Glass on Android:** `expo-blur` only blurs a designated target view there, so content behind glass is wrapped in `GlassBackdrop`; without it Android renders the tint only. iOS "Reduce Transparency" is honored automatically; Android has no such setting, so the in-app override (smoke screen toggle, `useTheme().setReduceTransparencyOverride`) is the fallback for low-end devices.
- **Profiles are least-privilege on top of RLS:** `anon` has no grants; `authenticated` can `select` and can `update` only `display_name` and `avatar_url`. Signup profile creation is a `SECURITY DEFINER` trigger.
- **Local auth:** email confirmations off, minimum password 8 characters (`supabase/config.toml`).
- **`db:types`:** `packages/db/src/database.types.ts` is generated (`pnpm db:types`), written to a temp file first so a failed run never truncates it. CI fails if it is stale.
- **Theme tokens:** `packages/tokens/theme.css` and `CONTRAST.md` are generated by `pnpm --filter @athleit/tokens build:css`; a test fails if they drift from the TS tokens.
