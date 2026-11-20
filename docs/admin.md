# Admin portal (`/admin`)

The internal Athleit admin portal, on the existing web app (`apps/web/src/app/admin`). Desktop first, read-only by default; every write goes
through one confirm-with-reason sheet. The database is the authority: the UI hides things, the database enforces them.

## Roles

`platform_admins` holds three roles. A client can learn only its own (`platform_admin_role()`).

| Area                                                        | Support | Admin | Owner |
| ----------------------------------------------------------- | :-----: | :---: | :---: |
| Overview, Teams, Clubs, People, Subscriptions, Reports, Audit |    ✓    |   ✓   |   ✓   |
| Payments and fees, Connect, Disputes                         |    –    |   ✓   |   ✓   |
| Notifications, Jobs and webhooks, Settings (view)            |    –    |   ✓   |   ✓   |
| Admins                                                       |    –    |   –   |   ✓   |
| Extend trial, comp, clear comp, price/trial/grace/reminders  |    –    |   ✓   |   ✓   |
| Reveal a reported message (with a reason)                    |    –    |   ✓   |   ✓   |
| Team billing on/off, automatic tax, fee config, admins       |    –    |   –   |   ✓   |

Emails are visible to every role. Phone numbers are masked (last four digits). A non-admin, and an admin opening a page above their role,
gets the app's ordinary not-found, never "access denied".

## Access and MFA

1. Not signed in: sign in.
2. Not an admin: ordinary `notFound()` (layout, every server action, every page).
3. No verified TOTP factor: the setup screen and nothing else.
4. Enrolled but the session is `aal1`: **read-only**. Reads work; the database requires `aal2` for every write.
5. Verifying a code gives `aal2`. The UI shows **editing** for 15 minutes (`EDIT_WINDOW_MINUTES`), then returns to read-only. The window is a
   convenience; the database checks `aal2` only.
6. A write at read-only opens the step-up sheet, keeps the change, verifies, then applies it.

TOTP must be on for the project. Local: `[auth.mfa.totp]` in `supabase/config.toml` (already set). **Hosted projects: Dashboard, Authentication,
Multi-factor, turn on TOTP (enroll and verify).** `/admin/*` is served with `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store`
(`next.config.ts`). The Stripe mode badge reads the server-only `ADMIN_STRIPE_MODE` (`test` unless set to `live`).

## Creating the first owner

There is intentionally no client path to create an owner. Someone with database access runs, once (Dashboard SQL editor):

```sql
-- The person must already have an account. Use their auth user id.
insert into public.platform_admins (profile_id, role, created_by)
values ('<their user id>', 'owner', '<their user id>');
```

They then open `/admin` and enrol an authenticator. After that, owners add and remove admins in the portal (`Admins`). Local development gets a seeded
owner from `supabase/seed.sql` (`admin@athleit.local`, local only).

## Adding a module

One row in `ADMIN_MODULES` (`packages/core/src/admin.ts`): key, label, icon, route, minimum role, nav group, page type, `phone`. The navigation,
command palette, role matrix helpers and the small-screen state read it. Then add `app/admin/<route>/page.tsx` and start it with
`await getAdminContext('<min role>')`. Add the icon mapping in `components/admin/icons.ts` if it is a new one.

## Adding a setting

A setting is a database row, not UI code: insert into `platform_setting_definitions` (label, description, group, type, min, max, unit, default,
write role) and `platform_settings`. It appears in Settings automatically with its role lock and history. Changes go through `admin_set_setting`.
The billing switch (`team_subscription.enabled`) is special-cased in the UI to call `admin_enable_team_billing` / `admin_disable_team_billing`.

## Adding a chart

Server page fetches with a wrapper from `@athleit/db/admin`, then renders `<ChartCard>` (`components/admin/chart.tsx`) with `labels` and `series`.
Range, compare and density are URL state. MUI X Charts (MIT community tier only) is imported **only** in `chart-impl.tsx`, loaded with
`next/dynamic` (`ssr: false`), and only under `/admin`. Money is computed on the server; the browser only formats integer cents.

## What is audited

Every write calls `private.platform_audit` with before, after and a reason of at least 10 characters: settings, fee configuration, billing on/off,
extend trial, comp and clear comp, sport configuration, report review, **reveal of a reported message (actor, report, reason)**, admin add / role / remove,
and support notes. People searches, person views and id lookups are logged too (an email or phone search term is stored as a short hash, never in full).
`platform_audit_log` is readable only through `admin_list_audit`.

## Known limits and placeholders

- Fee changes apply immediately: `fee_config` has one active row, so a future effective date is not supported.
- Retry for failed webhooks and jobs is drawn disabled ("Retry is not available yet. It needs a retry function.").
- Disputes shows counts only; there is no per-dispute table.
- The registrations summary (`gRegs`) and the trial-pipeline chart (needs a bucketing function) are not built.
- "Late" for a job means no run within twice its interval, derived from simple cron schedules; unusual schedules are never flagged late.
- The Clear comp impact sentence is a placeholder to confirm.
