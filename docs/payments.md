# Payments (Phase 4)

Stripe Connect (Express accounts), **test mode only** until [payments-go-live.md](payments-go-live.md) is executed.
Webhooks are the source of truth for payment status; the client success screen is only a hint.
Part A (this document's scope so far) is the database, the fee module and RLS. Edge Functions follow in Part B.

## Model

| Table                   | Purpose                                                                                                                                              | Written by                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `fee_config`            | One active row (history kept): Athleit flat + bps, Stripe estimate (for pass-through only), refund flags. Edited via `private.admin_set_fee_config`. | service role / DB owner                      |
| `connected_accounts`    | One Stripe Express account per team **or** club (`num_nonnulls = 1`), status mirrored from Stripe, `default_fee_policy`.                             | Edge Functions                               |
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

**Variance.** Stripe's actual fee (card type, international) differs from the estimate. `payments` stores both. Charges are **destination
charges**, so Athleit pays Stripe's fee and the team's net is fixed by the application fee: `net = total - application_fee`. The team therefore nets the
estimate exactly and **Athleit bears the variance** (see [payments-architecture.md](payments-architecture.md)).

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
