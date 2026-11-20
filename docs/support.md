# Support center

Public help articles at `/help`, a contact form that creates tickets, "Your requests" for signed-in people, a native mobile Help hub, and a Support module in the admin portal (`/admin/support`). Articles live in the repository: see [help-content.md](help-content.md).

## Data model (migrations `20260422000000` to `20260422000500`)

| Table                                                                    | What                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `support_requests`                                                       | One ticket. `ref` is `SUP-######` from a sequence (never reused). Type, status, priority, requester (profile or email), team or club, diagnostics (allowed keys only), tags, held, merged_into, feedback_status, spam, first_reply_at, solved_at, satisfaction. |
| `support_messages`                                                       | Plain text. `internal` is a staff note (never shown to the requester). `redacted_at` replaces the text.                                                                                                                                                         |
| `support_attachments`                                                    | Metadata for files in the private `support-attachments` bucket (`<request_id>/<uuid>/<name>`).                                                                                                                                                                  |
| `support_events`                                                         | The ticket activity timeline (assign, status, priority, tag, merge, redact, ...).                                                                                                                                                                               |
| `support_canned_replies`, `support_access_tokens`, `support_email_queue` | Canned replies; sha256 of emailed access tokens (never the token); emails waiting for signed-out requesters.                                                                                                                                                    |
| `help_article_feedback`, `help_search_misses`, `help_article_status`     | Helpful votes, no-result searches (counts by day, no person), and the weekly stale flags written by the docs pipeline.                                                                                                                                          |

`anon` has no table access. Signed-in requesters read their own requests, non-internal messages and attachments through row level security and write only through functions. Staff never read the tables directly.

## Roles and what is audited

| Work                                                                                                        | Minimum role           | MFA and reason                            | Where recorded                                 |
| ----------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------- | ---------------------------------------------- |
| Read, reply, internal note, assign, status, priority, tags, link article, release a hold                    | `support`              | none                                      | `support_events` on the ticket                 |
| Merge, mark spam, redact a message, delete an attachment, export, change idea status, manage canned replies | `admin`                | MFA (aal2) and a reason of 10+ characters | `platform_audit_log` (and the ticket's events) |
| Support settings (public tickets switch, contact email, retention)                                          | `owner` (some `admin`) | MFA and a reason                          | settings history and the audit log             |

Redact replaces the text with "[removed by Athleit Support]" and keeps who and why. The removed text is not kept anywhere.

## Ticket lifecycle

`new` to `open` (assigned or replied) to `waiting_on_requester` (a staff reply) to `solved` to `closed`.

- The first public staff reply sets `first_reply_at` once. A staff reply sets `waiting_on_requester` unless staff pick another status.
- A requester reply on a waiting, open or solved (inside the reopen window) ticket sets `open`.
- `support-sweep` (hourly) marks a waiting ticket solved after `support.auto_solve_days`, and closes a solved ticket after `support.reopen_days`.
- A closed ticket cannot be replied to. A merge closes the source and links it to the target.
- Satisfaction (yes or no) is set only by the requester on a solved ticket.

## Spam, privacy and abuse controls

- Signed-out tickets are created only by the `submit-support-request` Edge Function: Turnstile (fails closed), per-IP and per-email rate limits, and the `support.public_tickets_enabled` switch (off by default). The response is the same whether or not the email has an account.
- Hold for review: the thresholds are constants in `supabase/functions/_shared/support/rules.ts` (new email with a link, more than 3 requests in 24 hours, the same text repeated, many links, blocked words). A held ticket gets no confirmation email until staff release it.
- Diagnostics are limited to app version, platform, OS, browser, route, role and time. Never message text, registration answers or card data. Support staff see only what the requester wrote and attached.
- Signed-out requesters use an emailed link (`/help/r/<token>`): 30 day expiry, extended on use, only the hash stored, never indexed, no referrer.
- Ticket text is rendered as plain text with safe links, never as HTML.

## Attachments (no malware scan)

There is no malware scanner in this stack. Mitigations: a tight allow list (JPEG, PNG, WebP, GIF, PDF only), a 10 MB bucket limit, a check of the real file type from its first bytes in `finalize-support-attachments` (a file that fails is deleted), download-only signed URLs for staff (60 seconds), and no inline rendering in the admin portal. Add a scanning step before widening the allow list.

## Retention and account deletion

- Deleting an account anonymizes that person's tickets (requester, email and name cleared) and deletes their attachments immediately (`delete-account`).
- `private.support_retention_sweep()` deletes attachments and anonymizes requesters `support.retention_months` (default 24, Placeholder) after a ticket closes. It is **not scheduled** until the business confirms the period: schedule it with `cron.schedule` when ready.

## Turning public tickets off

Set `support.public_tickets_enabled` to false in Admin, Settings, Support. Signed-in requests keep working. Do not turn it on in production until the Turnstile keys (`CAPTCHA_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) and the Resend sender (`RESEND_API_KEY`, `EMAIL_FROM`) are confirmed.

## Configuration checklist (hosted project)

Secrets: `CAPTCHA_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `ALLOWED_ORIGINS`, `RECONCILE_SECRET` (shared with billing), `DOCS_STATUS_SECRET`. Vault: `support_emails_function_url` (the `send-support-emails` URL; `reconcile_secret` is reused). GitHub: `DOCS_STATUS_URL`, `DOCS_STATUS_SECRET`, optional `ANTHROPIC_API_KEY`. Web: `NEXT_PUBLIC_APP_URL`, optional `NEXT_PUBLIC_REPO_URL`. Mobile: `EXPO_PUBLIC_WEB_ORIGIN`.

## Placeholders to confirm with the business

First reply target (24 hours), contact email and hours, auto-solve days (7), reopen window (14), attachment size and count (10 MB, 3), hold thresholds, retention (24 months), the "billing not live" wording, the satisfaction question wording, and whether to enable the Claude drafting job.
