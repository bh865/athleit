# Notifications

How a message or schedule change becomes a push, an email and an in-app alert, and what you need to
turn each channel on. Rules about **who** is notified are in [messaging-safety.md](messaging-safety.md).

## Pipeline

```
messages insert ──trigger──▶ private.notify_new_message ──▶ private.enqueue_notification
                                  (not the sender, not muted, preferences, quiet hours, dedupe)
                                                │
                                   notification_outbox rows (in_app, push, email)
                                                │  statement-level trigger
                                                ▼
                       private.kick_delivery ── pg_net ──▶ Edge Function deliver-notifications
                                                ▲                  │ claim_notifications (SKIP LOCKED, 5 min lease)
              pg_cron "notification-sweep" every minute             ▼
              (pending, failed with elapsed backoff, expired lease)  Expo push · Web Push (VAPID) · Resend email
```

- **In-app** rows are written already `sent` (one per message) and feed the alerts list and the live toasts over Realtime.
- **Push** rows are created only for users who have an active device and the preference on. **Email** rows only when the
  user has **no** active push device. Quiet hours set `deliver_after`; nothing is dropped.
- **Delivery** is at-least-once and per-row: `sent`, `skipped` (no device, device open on that thread, channel not
  configured) or `failed` with exponential backoff (30 s, 2 min, 8 min, 30 min) up to 5 attempts. Dead Expo tokens and
  expired web subscriptions (404/410) are revoked. A worker that dies leaves a lease that expires; the row is re-claimed
  and the crash counts as an attempt.
- **Active thread** suppression: an open conversation reports itself every 15 s (`set_active_thread`); the worker skips
  push to that device while the report is under 30 s old, and the app suppresses its own foreground banner for it.
- **Lock screen content**: title (thread title or sender) plus "New message". Message text is included only if the
  recipient turned previews on **and** the thread has no minor participant. The in-app feed never stores text.
- **Logging**: the function logs counts and error codes only. Never payload bodies, tokens or addresses.
- **Observability**: team admins call `get_notification_failures(team_id)` (failed and skipped rows with the error code,
  no bodies). In SQL: `select status, last_error, count(*) from notification_outbox where channel in ('push','email') group by 1, 2;`

## Schedule notifications

Schedule changes use the same pipeline (category `schedule`); the rules and batching are in [scheduling.md](scheduling.md#notifications-part-c).
The push body comes from `payload.body` ("12 practices added"); rows without one fall back to the change label.

## Billing notifications

Category `billing` (default on for push and email; the preference row is shown to team admins only). Recipients are **all current admins of the team**; coaches and managers receive **only** the "some team actions are paused" notice, worded "ask a team admin" with no amounts. Every notice is keyed in `team_billing_notices` (once per team and key) and in the outbox dedupe key, so webhook retries and sweep re-runs never repeat one. Admin deep link `/teams/<id>/billing`; staff link `/teams/<id>`. The full list and when each is sent is in [billing.md](billing.md#notices).

## Support notifications

Category `support`: a reply from Athleit Support, and the "We got your request" confirmation. The in-app row and the push follow the person's `support` push preference (the row is always written); the email is transactional and is never silenced by a preference. Signed-out requesters have no profile, so their emails go through `support_email_queue` and `send-support-emails` instead of the outbox. Deep link: `/help/requests/SUP-######`. See [support.md](support.md).

## Deep links

Notification data carries a path (`/messages/<thread>` or `/events/<event>`). Web: the service worker focuses or opens
that URL; a signed-out visitor is sent to `/sign-in?next=<path>` and returns after signing in. Mobile: the tap handler
(also on cold start) pushes the same path with expo-router.

## What I need from you (credentials checkpoint)

Everything below runs today against mocks and the real Expo endpoint with fake tokens. To receive real notifications:

| Channel                       | Create                                                                                                                                                                                                                                                                                                                                                                             | Where it goes                                                                                                                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Expo / iOS / Android push** | An Expo account and an EAS project (`pnpm dlx eas-cli init` in `apps/mobile`); add the project id to `app.json` under `expo.extra.eas.projectId`. iOS: an Apple Developer account; `eas credentials` creates the APNs key for you. Android: a Firebase project with FCM; upload the FCM service-account key with `eas credentials`. A real device is required (not the simulator). | The project id is not secret (committed in `app.json`). APNs and FCM keys stay in EAS. Optional: an Expo access token as the Edge Function secret `EXPO_ACCESS_TOKEN` (higher limits).                 |
| **Web push**                  | Generate keys: `npx @pushforge/builder vapid`.                                                                                                                                                                                                                                                                                                                                     | Public key: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in `apps/web/.env.local` and your host's env. Private JWK: Edge Function secret `VAPID_PRIVATE_JWK` (JSON), plus `VAPID_SUBJECT` (`mailto:you@yourdomain`). |
| **Email**                     | A [Resend](https://resend.com) account, a verified sending domain, and an API key.                                                                                                                                                                                                                                                                                                 | Edge Function secrets `RESEND_API_KEY`, `EMAIL_FROM` (for example `Athleit <notify@yourdomain>`), `APP_URL` (the web app's origin).                                                                    |

Set Edge Function secrets in the dashboard (Edge Functions, `deliver-notifications`, Secrets) or with
`supabase secrets set NAME=value`. Never put them in a file in this repo.

**Why Resend:** one HTTPS call per email (no SMTP, runs in an Edge Function with `fetch`), a free tier that covers a dev
project, and domain verification (SPF/DKIM) guides in the dashboard. Any provider with a REST API can replace
`resendTransport` in `supabase/functions/_shared/transports.ts` without touching the rest.

## Operating notes

- Redeploy after changing the function: `pnpm supabase functions deploy deliver-notifications --use-api` (then `--remote --yes`).
- The function URL and the public anon key it is called with are stored in Vault (`notify_function_url`,
  `notify_anon_key`). If they are missing, kicks are a no-op and rows wait; the sweep delivers them once the secrets exist.
- A row with no configured channel is marked `skipped (channel_not_configured)` rather than failed, so adding credentials
  later affects only new notifications.
- Delivery is at-least-once: a crash between sending and recording can send one notification twice (Web Push and Expo both
  collapse by tag/thread on the device).
