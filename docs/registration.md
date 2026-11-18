# Registration, forms, waivers and documents (Phase 5)

Part A (this document's scope so far) is the database, RLS and shared packages. Edge Functions (Part B) and the UI (Part C) build on it.
Permissions: [permissions.md](permissions.md). Data handling: [registration-privacy.md](registration-privacy.md). Tests: `supabase/tests/database/`.

## Model

| Table                            | Purpose                                                                                                                       | Written by                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `forms` / `form_versions`        | A form owner (team or club) with a mutable `draft_schema`; each publish creates the next immutable version.                    | `create_form`, `save_form_draft`, `publish_form_version`         |
| `waivers` / `waiver_versions`    | Same pattern for waiver text (restricted markdown) with a sha256 `content_hash` and optional `requires_resign_after_days`.     | `create_waiver`, `save_waiver_draft`, `publish_waiver_version`   |
| `team_required_waivers`          | Waivers every rostered player of a team must have signed.                                                                      | `set_team_required_waiver`                                       |
| `registration_events`            | The public offering: issuer, info blocks, window, capacity, waitlist, price and payment timing, form + waiver versions.         | `create/update/publish/close/archive_registration_event`         |
| `registrations`                  | One child per registration (`REG-1042`). Ordinary answers only.                                                                | `svc_create_registration` + decision functions (Edge Functions)  |
| `registration_sensitive_answers` | Medical and other sensitive answers. No grants at all; read only through `get_sensitive_answers` (audited).                     | `svc_create_registration`                                        |
| `registration_notes`             | Staff-only evaluation notes. Never visible to families.                                                                        | `add_registration_note`                                          |
| `registration_capability_grants` | Who besides issuer admins holds the `sensitive_answers` capability.                                                            | `grant_registration_capability`                                  |
| `waiver_acceptances`             | Append-only signatures: typed name, relationship, email, electronic-records consent, version, optional PDF path.               | `record_waiver_acceptance`, `svc_record_waiver_acceptance`       |
| `waiver_acceptance_evidence`     | Signer IP and user agent, readable by issuer admins only. Populated only if the product decision allows it.                    | `svc_record_waiver_acceptance`                                   |
| `documents`                      | Metadata for files in the private `documents` bucket.                                                                          | `create_document`, `update_document`, `archive_document`        |

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

## Known limits (Part A)

- Concurrency is enforced by row locks and verified in pgTAP by sequential scenarios; true parallel-call tests belong with the Edge Functions (Part B).
- Club-issued placement requires a person who is staff of the destination team.
- Payment requests for registrations (Part B) need small, backward-compatible changes to Phase 4 (see the Part A summary).
