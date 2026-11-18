# Payments (Phase 4)

Stripe Connect (accounts with the full Stripe Dashboard), **test mode only** until [payments-go-live.md](payments-go-live.md) is executed.
Webhooks are the source of truth for payment status; the client success screen is only a hint.
Part A (this document's scope so far) is the database, the fee module and RLS. Edge Functions follow in Part B.

## Model

| Table                   | Purpose                                                                                                                                              | Written by                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `fee_config`            | One active row (history kept): Athleit flat + bps, Stripe estimate (for pass-through only), refund flags. Edited via `private.admin_set_fee_config`. | service role / DB owner                      |
| `connected_accounts`    | One Stripe connected account per team **or** club (`num_nonnulls = 1`), status mirrored from Stripe, `default_fee_policy`.                           | Edge Functions                               |
| `payment_events`        | What is being collected: issuer, title, per-player `amount_cents`, `due_at`, audience, fee policy, frozen `fee_config` snapshot, status.             | `create/update/publish/cancel_payment_event` |
| `payment_requests`      | One per player per event, with `household_id`, `display_id` (`PR-3317`), status, reminder bookkeeping, `disputed`.                                   | functions                                    |
| `payments`              | One Stripe PaymentIntent (id attached after creation): fee split, estimated vs actual Stripe fee, `receipt_display_id` (`RCP-20481`).                | Edge Functions                               |
| `payment_items`         | Which requests a payment covers (+ allocated fee cents). `is_active` unique per request: a request is in at most one live payment.                   | Edge Functions                               |
| `offline_payments`      | Cash / check / other, who recorded it. One per request.                                                                                              | `record_offline_payment`                     |
| `refunds`               | Stripe refunds (id attached after the call, status finalized by the webhook).                                                                        | Edge Functions                               |
| `stripe_webhook_events` | Event ledger; unique `stripe_event_id` makes a replay a no-op. No client access, no policies.                                                        | Edge Functions                               |

Money is **integer cents + currency (USD only)** everywhere. Card data is never stored; only Stripe object ids.

Deviations from the brief (all additive): `payment_events.audience_player_ids uuid[]` instead of an audience table; `payment_items` carries the
allocated `platform_fee_cents` / `processing_fee_passthrough_cents`; `payments` also holds `household_id`, `connected_account_id`, `fee_policy`,
`request_set_key`, `currency`, `estimated_stripe_fee_cents`; `payment_requests` holds reminder columns; `payments.stripe_payment_intent_id` is
nullable until the intent exists (reserve the row first, then create the intent with an idempotency key derived from the row id).

## Fee rules (exactly as implemented)

Implemented in `packages/core/src/fees.ts` and mirrored by `private.fee_breakdown`; both are held to the same vectors
(`supabase/tests/database/fn_fee_breakdown.test.sql`, parsed by `packages/core/src/fees.test.ts`). Round half up, integers only.

```
athleit_charge = flat + round(base * bps / 10000)       added on top, paid by the payer, shown as its own line,
                                                        collected as the Stripe application fee
absorb : total = base + athleit_charge                  the team absorbs Stripe's fee
pass_on: total = ceil((base + athleit_charge + stripe_fixed) / (1 - stripe_bps/10000))
         service_fee = total - base - athleit_charge    payer covers Stripe's ESTIMATED fee ("Service fee" in UI)
estimated_stripe_fee = round(total * stripe_bps / 10000) + stripe_fixed
```

For a multi-request checkout the charge is computed **once on the summed base** (flat applies once per payment), then allocated across items by
largest remainder so items sum exactly to the payment. Initial `fee_config`: Athleit charge 0 / 0 bps, Stripe estimate 2.9% + 30¢ (pricing is a pending decision).

**Variance.** Stripe's actual fee (card type, international) differs from the estimate. `payments` stores both. Charges are **direct charges** on
accounts that pay their own Stripe fees ([payments-architecture.md](payments-architecture.md)), so Athleit never pays Stripe's fee and
`application_fee_amount` is only the Athleit charge. `net_to_account = total - application_fee - Stripe fee` (estimate, then actual). The variance
is the **team's** under both policies.

**Worked example, a $45.00 request** (Stripe estimate 2.9% + 30¢; Athleit charge shown with two settings):

| Athleit charge | Policy  | Payer pays | Lines                                 | Est. Stripe fee | Team nets (est.) |
| -------------- | ------- | ---------: | ------------------------------------- | --------------: | ---------------: |
| none (initial) | absorb  |     $45.00 | $45.00                                |           $1.61 |           $43.39 |
| none           | pass_on |     $46.66 | $45.00 + $1.66 service fee            |           $1.65 |           $45.01 |
| $0.50 + 1%     | absorb  |     $45.95 | $45.00 + $0.95 Athleit charge         |           $1.63 |           $43.37 |
| $0.50 + 1%     | pass_on |     $47.64 | $45.00 + $0.95 charge + $1.69 service |           $1.68 |           $45.01 |

## Status state machines (enforced by triggers, even for the service role)

```
payment_requests: unpaid -> processing -> paid -> partially_refunded -> refunded
                  unpaid -> paid (out-of-order webhook) | paid_offline | waived | cancelled
                  processing -> unpaid (failed/canceled intent) | paid | cancelled      paid -> refunded
                  waived, cancelled, refunded, paid_offline: terminal
payments:         requires_payment_method <-> processing / failed -> succeeded -> partially_refunded -> refunded
                  any open state -> canceled (releases the items)
payment_events:   draft -> published -> closed;  draft | published -> cancelled (terminal)
```

Amounts, players, households, fee snapshots and Stripe ids are immutable once written.

## Functions

`create_payment_event`, `update_payment_event` (draft only), `publish_payment_event` (needs `charges_enabled`; snapshots `fee_config`; one request per
audience player; one notification **per household** through category `payments`), `cancel_payment_event` (admin; unpaid requests cancelled, paid ones
untouched, unconfirmed intents canceled), `waive_request`, `record_offline_payment`, `send_payment_reminders` (once per request per 24 h),
`payer_checkout_quote(request_ids[])` (the only place a charge is computed; takes ids only), `event_collection_summary`, `event_collection_detail`,
`household_payments`, `household_receipts`, `connected_account_status`, `set_default_fee_policy`. All audited where they change state.

Club-issued events: audience = active players on any team linked to the club. A club admin sees names and totals only for events their club issued,
never a linked team's own events.

## Notes for Part B

- A cancelled event leaves intents canceled **in the database**; the Edge Function must also cancel them at Stripe, and `reconcile-payments` must void any
  open intent whose payment is `canceled`.
- `payer_checkout_quote` only accepts `unpaid` requests; reuse of an open intent is a lookup by `payments.request_set_key`.
- Receipt ids come from `private.next_receipt_display_id()` (service role).

## Part B: server logic

Edge Functions (all in `supabase/functions/`, logic in `_shared/payments/`, Zod-validated, per-user rate limited, structured logs with redaction):

| Function                | Caller                  | What it does                                                                                                                                   |
| ----------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect-onboarding`    | issuer admin (JWT)      | Creates the connected account (full dashboard, account pays fees) once, returns a single-use Account Link (URLs from config), or syncs status. |
| `create-payment-intent` | guardian (JWT)          | Request ids only. Reserves the payment, creates the intent (idempotent), returns the client secret.                                            |
| `stripe-webhook`        | Stripe (signature)      | Raw-body signature check, ledger first, idempotent handlers. Platform and Connect endpoints, two secrets.                                      |
| `refund-payment`        | issuer admin (JWT)      | `prepare_refund` (policy amounts) then Stripe refunds with `reverse_transfer`; webhook finalizes.                                              |
| `reconcile-payments`    | pg_cron (shared secret) | Repairs stuck / abandoned / canceled intents, missing fees, accounts, stuck events.                                                            |
| `export-payments`       | event staff (JWT)       | CSV of one event (no card data, formula-safe cells).                                                                                           |

Edge Function secrets: `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET` (platform endpoint), `STRIPE_CONNECT_WEBHOOK_SECRET` (Connect endpoint),
`RECONCILE_SECRET`, `APP_URL`, `APP_SCHEME`, optional `ALLOWED_ORIGINS`. Platform-provided: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
Vault secrets for the cron kick: `reconcile_function_url`, `reconcile_secret` (same value as `RECONCILE_SECRET`). The functions refuse live keys.

Webhook events to subscribe to. Because charges are direct charges, **all of these arrive on the Connect endpoint ("Listen to events on Connected accounts")**: `payment_intent.succeeded`,
`payment_intent.processing`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `charge.refund.updated`,
`charge.dispute.created`, `charge.dispute.closed`, `account.updated`, `account.application.deauthorized`. The platform endpoint is optional (no events of ours land there).

Convergence rules (tested in pgTAP): duplicate deliveries are no-ops (ledger + idempotent handlers); late events never move a payment backwards;
a refund before success applies success first; a success on a payment we had canceled is recorded, its items become refundable again and issuer
admins are told; a webhook that beats the intent-id attach resolves by our payment id in metadata; Stripe's amount, currency, destination and
application fee must equal what was reserved or the event is refused (`payment_mismatch`).

Known gaps (documented, not hidden): disputes are debited from the connected account by Stripe (Athleit is not liable) and flagged/audited here, with
refunds blocked while disputed; `refund_application_fee` semantics need a test-mode check
(`scripts/payments-integration.mjs`); any staff member can publish an event (decision pending).

See [payments-e2e-todo.md](payments-e2e-todo.md) for what has been verified live and the end-to-end test scenarios still to run.

## Part C: UI

Web: `/pay` (parents: Due / Receipts, multi-select checkout, Stripe Payment Element initialised with the connected account), `/teams/[id]/payments` and
`/clubs/[id]/payments` (staff: payouts status, new request with live fee preview, collection ring and per-family list, remind, export CSV, waive, paid
offline, refund, cancel), `/payments/connect/return|refresh` (Stripe onboarding return), Home cards (staff outstanding bar, parent amount due).
Mobile: the **Pay** tab (guardians: pay with PaymentSheet and receipts; staff: payouts, new request, collection, remind, waive, paid cash).

Rules the UI follows: it never sends or computes a charge amount (only request ids; the review sheet shows `payer_checkout_quote`); after Stripe
confirms it shows **Processing** until the webhook marks the payment paid, then the receipt (closing the app is safe: the status resolves later and a
receipt notification arrives); all amounts are mono with spoken labels; Stripe's UI is themed from the semantic tokens.
Notifications (category `payments`, deep links to the exact request or event): new request, reminder (staff, once per request per 24 h), due in 3 days
and overdue (hourly cron, once each), receipt, refund; to staff: payment received, needs refund, dispute opened, payout action required.
