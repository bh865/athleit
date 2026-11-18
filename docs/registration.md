# Registration, forms, waivers and documents (Phase 5)

Parts A (database, RLS, shared packages) and B (Edge Functions, integrations) are built; the UI (Part C) builds on them. Operations, secrets and runbook: [registration-ops.md](registration-ops.md).
Permissions: [permissions.md](permissions.md). Data handling: [registration-privacy.md](registration-privacy.md). Tests: `supabase/tests/database/`.

## Model

| Table                            | Purpose                                                                                                                    | Written by                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `forms` / `form_versions`        | A form owner (team or club) with a mutable `draft_schema`; each publish creates the next immutable version.                | `create_form`, `save_form_draft`, `publish_form_version`        |
| `waivers` / `waiver_versions`    | Same pattern for waiver text (restricted markdown) with a sha256 `content_hash` and optional `requires_resign_after_days`. | `create_waiver`, `save_waiver_draft`, `publish_waiver_version`  |
| `team_required_waivers`          | Waivers every rostered player of a team must have signed.                                                                  | `set_team_required_waiver`                                      |
| `registration_events`            | The public offering: issuer, info blocks, window, capacity, waitlist, price and payment timing, form + waiver versions.    | `create/update/publish/close/archive_registration_event`        |
| `registrations`                  | One child per registration (`REG-1042`). Ordinary answers only.                                                            | `svc_create_registration` + decision functions (Edge Functions) |
| `registration_sensitive_answers` | Medical and other sensitive answers. No grants at all; read only through `get_sensitive_answers` (audited).                | `svc_create_registration`                                       |
| `registration_notes`             | Staff-only evaluation notes. Never visible to families.                                                                    | `add_registration_note`                                         |
| `registration_capability_grants` | Who besides issuer admins holds the `sensitive_answers` capability.                                                        | `grant_registration_capability`                                 |
| `waiver_acceptances`             | Append-only signatures: typed name, relationship, email, electronic-records consent, version, optional PDF path.           | `record_waiver_acceptance`, `svc_record_waiver_acceptance`      |
| `waiver_acceptance_evidence`     | Signer IP and user agent, readable by issuer admins only. Populated only if the product decision allows it.                | `svc_record_waiver_acceptance`                                  |
| `documents`                      | Metadata for files in the private `documents` bucket.                                                                      | `create_document`, `update_document`, `archive_document`        |

Storage buckets (all private; policies and tests in `documents_storage`, `waiver_copies_storage`, `registration_covers_storage`):
`documents` (20 MB, PDF, images, Office), `waiver-copies` (service role writes; signer, family and issuer staff read), `registration-covers` (managers
write, staff read; the public page receives a short-lived signed URL from an Edge Function).

## Immutable versions

Editing a published form or waiver means publishing a new version. `form_versions` and `waiver_versions` reject UPDATE, DELETE and TRUNCATE
(trigger `version_immutable`) for every role including the owner. Registrations keep `form_version_id`; waiver acceptances keep `waiver_version_id`;
a registration event pins `form_version_id` and `waiver_version_ids`. Once a registration exists, the event's price, payment timing, form and waivers are
locked (`terms_locked`). `waiver_acceptances` is append-only; the only permitted changes are setting `signed_copy_path` once and nulling
`signer_profile_id` when an account is deleted.

Forms: 12 field types, no file upload, `show_if` may only reference an earlier field, regex validation is not allowed (ReDoS), and labels or help text asking for
government IDs, SSNs or card data are rejected by `private.validate_form_schema` (and the Zod mirror in `packages/core`).

## Registration statuses

```
pending_verification --(email confirmed, svc_verify_registration)--> submitted | waitlisted
submitted    --accept--> accepted      --place_registered_player--> placed
submitted    --waitlist--> waitlisted  --accept / promote--> accepted
submitted | waitlisted | accepted  --decline--> declined         (placed cannot be declined)
any open status (placed: staff only) --withdraw--> withdrawn
```

`declined` and `withdrawn` are terminal. Enforced by trigger even for the service role. **Accepted does not mean placed**: no function inserts into a roster
except `place_registered_player`, called by staff of the destination team, which creates or links the `players` row, records an approved `join_request`
and calls the existing `place_player_on_roster`.

## Capacity and waitlist

A spot is **taken** by an `accepted` or `placed` registration, and, when `payment_timing = 'at_submission'`, by a `submitted` registration whose payment hold
is paid (`hold_expires_at is null`) or still running (`hold_expires_at > now()`). Pending, waitlisted, declined and withdrawn registrations never hold a spot.
Every function that changes capacity first locks the event row (`SELECT … FOR UPDATE`), so two simultaneous submissions or decisions for the last spot are
serialized and one gets `capacity_full` or lands on the waitlist.

- New submissions: if the event is full (or others already wait), they go to the waitlist when `waitlist_enabled`, otherwise `registration_full`.
- `waitlist_position` is monotonic per event and never renumbered, so the order is stable even when someone withdraws. `waitlist_rank` is computed on read.
- When a spot frees (decline, withdraw): with `auto_promote_waitlist` the first waitlisted registrations are accepted in order; otherwise staff confirm with
  `promote_from_waitlist`.
- At-submission holds that expire stop counting automatically (the cron that cancels them is Part B).

## Public surface

`get_public_registration(slug)` is the only function an anonymous visitor can call. It returns a fixed list of public-safe fields (no ids of owners, no
registrants, no counts beyond a coarse `spots` label: `open | few | waitlist | full`) or `null` for a missing, draft, archived or not-visible event.
`link_only` events are served with `noindex: true`; `members_only` events return `null` unless the caller is a member. Writes by anonymous visitors only
happen in the `submit-registration` Edge Function (Part B), which calls `svc_create_registration` with the service role.

## Audit

`audit_log` entries: `form.create|publish`, `waiver.create|publish|required|accept`, `registration_event.create|update|publish|close|archive`,
`registration.submit|verify|decide|promote|withdraw|place|note|export|sensitive_read|capability`, `document.create|update|archive`.
Audit rows hold ids and statuses only, never names, emails or answers.

## Server flows (Part B)

**Anonymous registration.** `submit-registration` (captcha, per-IP/per-email/per-event rate limits, honeypot, 64 KB cap, Zod against the PUBLISHED form
version, answers split into ordinary and sensitive) calls `svc_create_registration` with the service role. The row starts `pending_verification` and does
not count toward capacity. The registrant receives an email whose link carries a single-use, 60-minute token in the URL **fragment**
(`/register/verify#token=...`); only its sha256 is stored. `verify-registration` consumes it (replay, expiry and unknown look identical), the registration
becomes `submitted` or `waitlisted` (capacity is decided now, under the event lock), and the response carries a 60-minute **signing token** (body only, never
emailed) so the registrant can sign waivers without an account. A repeated anonymous submission looks identical to a first one (no enumeration; the id is shown after confirmation) and re-sends the link without cancelling the original.

**Signed-in guardian.** Skips verification. If the event takes payment at submission an account is required (the function refuses anonymous submitters) and
the child must be linked (`player_required`).

**Waivers.** `sign-waiver` records the acceptance (signed-in: AS the user, so ownership is checked by the database; token: bound to one registration), builds a
signed-copy PDF (title, version, content hash, full text, typed signature, relationship, email, UTC time, consent, registration), stores it in the private
`waiver-copies` bucket, attaches its path once, and emails the PDF to the signer. If copy generation fails the signature still stands (`copy: "pending"`).
IP and user agent are stored only when `RECORD_SIGNER_EVIDENCE=true` (off by default).

**Payments (Phase 4 reused).** One `payment_events` row of kind `registration` per registration event, one `payment_requests` row per registration, amount from
`registration_events.price_cents` only. `at_submission`: the request exists as soon as a signed-in submission with a linked child is created; the spot is held
until `hold_expires_at`; the registration cannot be accepted until the request is paid; paying lifts the hold; the cron `registration-expire-holds` withdraws
unpaid expired holds (a payment in flight keeps its spot), cancels the request, emails the registrant and advances the waitlist. `after_acceptance`: accepting
creates the request (due in 7 days). An anonymous registrant who must pay gets an email asking them to create an account with the same address;
the email carries a single-use claim link (`claim-registration`) that attaches the registration to their signed-in account, and `link_registration_player`
links the child (name and date of birth must match), which creates the request. Declining or withdrawing cancels an UNPAID request; a PAID one stays, `registration_payment_status.refundable` tells the UI to offer the staff refund
through the existing `refund-payment` function. Changes to Phase 4 tables are listed in the Part B summary and migration `20260302000100`.

**Notifications.** Registrant emails (received, decision, promoted, payment due, hold expired) go through `notification_outbox` rows with `recipient_email`
(no profile), are **transactional and ignore notification preferences**, and are deduped by key. Staff get batched summaries ("N new registrations",
"registration is full", "N waivers expire within 14 days") via `enqueue_notification` category `registration`, never one per submission and never with
names or answers. Delivery is the existing worker (`deliver-notifications`).

**Exports and data requests.** `export-registrations` returns CSV (formula-injection safe); sensitive columns only when requested AND the caller holds the
capability; every export audited. `export_registrant_data` and `erase_registrant_data` are staff-triggered and audited. Retention runs daily.

## Known limits

- Concurrency is enforced by row locks (`SELECT ... FOR UPDATE` on the event). pgTAP runs inside one transaction, so the parallel proof lives in `scripts/registration-concurrency.mjs` (see registration-ops.md).
- Club-issued placement requires a person who is staff of the destination team.
