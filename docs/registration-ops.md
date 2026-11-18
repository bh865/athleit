# Registration operations

Everything an operator needs for Phase 5 Parts A and B: functions, secrets, scheduled jobs, how to test, and what is intentionally manual.

## Edge Functions

| Function                  | Caller                                    | Auth                                     | Purpose                                                                                                         |
| ------------------------- | ----------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `get-public-registration` | anyone (public page, mobile)              | none (optional session for members-only) | Public-safe event data by slug. Cacheable for anonymous callers (`public, max-age=60`). Rate limited 60/min/IP. |
| `submit-registration`     | anyone                                    | captcha; optional session                | The only write path. Honeypot, per-IP/email/event limits, validation against the published form.                |
| `verify-registration`     | the emailed link                          | single-use token                         | Confirms the email, returns a signing token.                                                                    |
| `sign-waiver`             | signed-in guardian or verified registrant | session or signing token                 | Append-only signature, signed-copy PDF in Storage, copy emailed.                                                |
| `claim-registration`      | signed-in user with an emailed claim link | session + single-use claim token         | Attaches an anonymous registration to the signed-in account.                                                    |
| `export-registrations`    | staff                                     | session; database decides                | CSV (formula-injection safe); sensitive columns only with the capability; audited.                              |
| `deliver-notifications`   | database (pg_net) and cron                | n/a (queue only)                         | Existing worker, now also sends registrant emails (rows with `recipient_email`).                                |

Client contract for the web and mobile apps (Part C): the verification token comes from the URL **fragment** (`#token=`) and is POSTed in the body; the
signing token returned by `verify-registration` is kept in memory / session storage and sent as `signToken`.

## Secrets (Edge Function secrets, never in the repo)

| Name                           | Needed by                 | What it is                                                                                           |
| ------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `CAPTCHA_SECRET`               | `submit-registration`     | Cloudflare Turnstile **secret key**. Unset = every submission is refused (fails closed).             |
| `RESEND_API_KEY`, `EMAIL_FROM` | all email                 | Already used by Phase 3 delivery. Verification emails and waiver copies are sent directly with them. |
| `APP_URL`                      | links in email, CORS      | The public web origin, e.g. `https://app.example.com` (no trailing slash).                           |
| `ALLOWED_ORIGINS`              | CORS                      | Comma-separated extra origins (optional; defaults to `APP_URL`).                                     |
| `RECORD_SIGNER_EVIDENCE`       | `sign-waiver`             | `true` stores signer IP + user agent in `waiver_acceptance_evidence` (admin-only). Default off.      |
| `PUBLIC_CACHE_SECONDS`         | `get-public-registration` | Optional cache lifetime (default 60).                                                                |

The platform supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. The service role key never leaves Edge Functions.
The web page needs the public Turnstile **site key** (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `EXPO_PUBLIC_TURNSTILE_SITE_KEY`, Part C).

### Captcha: Cloudflare Turnstile

Free, no visual puzzle for most visitors, privacy-friendly, one API call to verify, and Cloudflare publishes always-pass / always-fail test keys.
Create a free Cloudflare account, **Turnstile > Add widget**, choose Managed, add your web hostname(s), and copy the **site key** (public) and **secret key**.
Until then use the documented test keys: site key `1x00000000000000000000AA` (always passes, token `XXXX.DUMMY.TOKEN.XXXX`) with secret
`1x0000000000000000000000000000000AA`; `2x...` variants always fail. Test sitekeys must be paired with the test secret.
Docs: https://developers.cloudflare.com/turnstile/troubleshooting/testing/ and https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

## Scheduled jobs (pg_cron, plain SQL)

| Job                          | Schedule         | What it does                                                                                                                                                                                                                |
| ---------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registration-expire-holds`  | every 5 minutes  | Unpaid at-submission holds past `hold_expires_at` are withdrawn (`payment_expired`), the request cancelled, the registrant emailed, the waitlist advanced when `auto_promote_waitlist`. A payment in flight keeps its spot. |
| `registration-staff-digest`  | every 15 minutes | One notification per manager per event with a count of new registrations; one "registration is full" per fill.                                                                                                              |
| `registration-waiver-expiry` | daily 14:00 UTC  | Guardians (waiver title only) and staff (a count per team) hear about waivers expiring within 14 days.                                                                                                                      |
| `registration-retention`     | daily 03:30 UTC  | Anonymizes declined/withdrawn registrations 12 months after the event ended; deletes sensitive answers 90 days after it ended (kept for placed players); deletes old tokens.                                                |

Run by hand: `select public.svc_run_registration_retention(12, 90);` (service role) or `select private.expire_registration_holds();`.

## Tests

- `pnpm db:test` (remote runner; every file rolls back). Registration files: `registration*`, `forms`, `waivers`, `documents`, `fn_*registration*`, `fn_*waiver*`, `fn_*document*`, `notification_outbox_email_only`.
- `pnpm --filter @athleit/core test`: validation, Edge cores (submit/verify/sign/export/public/mail), PDF contents, and a drift check that the Edge copy of the validation equals `packages/core`. After editing `packages/core/src/registration.ts` or `schemas/registration.ts` run `node scripts/sync-edge-registration.mjs`.
- `node scripts/registration-concurrency.mjs`: real parallel sessions against the linked project (six simultaneous acceptances for one spot; six simultaneous waitlist submissions). Leaves a small fixture team/form named "Concurrency fixture" (the form version is immutable by design).

## Deploy

```bash
pnpm supabase functions deploy get-public-registration submit-registration verify-registration sign-waiver claim-registration export-registrations deliver-notifications --use-api
```

## Runbook

- **Registrant never got the verification email:** they can submit again (the response is identical and a new link is sent, five per registration per day). Check `RESEND_API_KEY`/`EMAIL_FROM` and the function logs for `verification_email_failed`.
- **A signed copy PDF is missing:** the signature exists (`waiver_acceptances`); `copy: "pending"` was returned. The PDF can be regenerated from `svc_acceptance_context(acceptance_id)`; `svc_attach_signed_copy` sets the path once.
- **Captcha refusing everyone:** `CAPTCHA_SECRET` unset or mismatched with the site key.
- **Spam wave:** lower the per-IP/per-event limits in `submit.ts`, or close the event; the honeypot and captcha already stop most bots.

## Security review (Part B) and what changed because of it

An independent reviewer read the migrations and Edge Functions cold. Everything it found was fixed (migration `20260302000400_registration_hardening.sql`
and the Edge code), and each fix has a test:

- **Account takeover by email match.** Claiming no longer trusts `email_confirmed_at` (this project auto-confirms signups, so any stranger could
  claim a registration by signing up with the same address). A claim now needs the single-use token emailed to the registration's verified address
  (`/register/claim#token=...` -> `claim-registration`).
- **Capacity via late payment.** A payment that completes after its hold expired re-checks capacity under the event lock; the registration is waitlisted
  (or withdrawn when there is no waitlist) and its paid request is offered for refund. Abandoned `processing` checkouts expire 15 minutes after the hold.
- **Direct RPC bypassing the Edge rate limit.** `get_public_registration` is no longer executable by `anon`; the Edge Function reads it with the service role.
- **Enumeration and blocking.** A new anonymous registration and a duplicate return the identical 202 (the registration id is shown after the email is
  confirmed); a duplicate no longer invalidates the real registrant's link; unverified rows are deleted after 24 hours and hidden from staff lists.
- **Content.** Info blocks are validated in SQL; a cover path must sit under the issuer's own prefix; a field cannot be shown only when a sensitive
  answer is given; more forbidden label patterns, option labels checked.
- **Other.** The child linked to a registration must match its name and date of birth; the signed copy is emailed only to the account or the verified guardian
  address; per-account signing limit; the PDF notes characters it could not draw; outbox emails are purged on erasure and after 30 days.

Open items for the platform: confirm that Supabase overwrites `x-forwarded-for` / `cf-connecting-ip` (rate limits use the last forwarded entry), and decide
whether to enable "Confirm email" on the hosted project (recommended regardless; claims no longer depend on it).
