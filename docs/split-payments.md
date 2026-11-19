# Split payments (installment plans)

Status: **step 1 of 6 done** (database and core). Branch `feat/split-payments`. Test-mode Stripe only.
This file is the working plan plus the rules as built; [payments.md](payments.md) and [payments-architecture.md](payments-architecture.md) stay the source of truth for everything not mentioned here.

## Rules as built (step 1)

- Staff choose any subset of {1..6} plan sizes and a cadence (weekly / every 2 weeks / monthly) on a **draft** payment event (`set_payment_event_plan`). Default `{1}` = nothing changes. Plan terms freeze at publish with the other money terms (`guard_payment_event`). A deposit is reserved as columns (`plan_deposit_kind/value`) but constrained to null: no UI yet.
- Schedule (`private.generate_plan`, mirrored in `packages/core/src/payment-plans.ts`, same vectors): integer cents, even split, remainder cents on installment 1; installment 1 due at checkout; later ones every cadence step from the checkout instant, **in UTC** (so daylight saving never moves an instant; monthly keeps the time of day and clamps to month end, computed from the start, not iteratively). Every installment >= 50 cents. The last installment must be due on or before the event due date.
- The server decides what is offered (`payer_plan_options`, `private.available_plan_sizes`). If no option fits, only "pay in full" is offered, so nobody is locked out of paying.
- `payment_request_installments`: amount, sequence and owner are immutable; `due_at` moves only while open. State machine in a trigger (also for the service role):
  `scheduled -> due | processing | paid | paid_offline | waived | cancelled`; `due` likewise; `processing -> paid | failed | due | scheduled | cancelled`; `failed -> due | processing | paid | paid_offline | waived | cancelled`; `paid -> partially_refunded | refunded`; `partially_refunded -> refunded`.
- The request status is **derived** from its installments by a trigger, so they cannot disagree: `unpaid -> processing -> partially_paid -> paid`; no open installment left and any waived -> `waived`, else any cancelled -> `cancelled`; refunds roll up to `partially_refunded` / `refunded`. A later installment going `processing` does not move a `partially_paid` request back.
- A request with `plan_count` null or 1 has no installment rows and behaves exactly as before. `plan_count` is set once, when the plan is created (`svc_create_plan`, service role).
- `payment_items.installment_id` (composite FK with the request) lets an item cover one installment. Live-payment uniqueness: one per whole request (`installment_id is null`) and one per installment.

## Worked example (4 installments)

$100.00 request, fee policy **absorb**, Athleit charge 50c + 1%, biweekly. Each installment is its own Stripe transaction, so the flat 50c repeats:

| Installment | Base   | Athleit charge | Payer pays  |
| ----------: | ------ | -------------- | ----------- |
|           1 | $25.00 | $0.75          | $25.75      |
|           2 | $25.00 | $0.75          | $25.75      |
|           3 | $25.00 | $0.75          | $25.75      |
|           4 | $25.00 | $0.75          | $25.75      |
|   **Total** |        | $3.00          | **$103.00** |

Paying in full costs $101.50 ($100.00 + $0.50 + $1.00), so the plan costs the family **$1.50 more**. Under `pass_on` the Stripe fixed fee repeats too. Vectors: `packages/core/src/payment-plans.test.ts`.

## Where "one request = one charge" is assumed (to change in later steps)

SQL: `compute_checkout_quote` (only `unpaid` requests, whole-request items), `svc_reserve_payment` (reuse key = md5 of request ids), `svc_payment_succeeded` (marks the request paid, one receipt), `svc_refund_event`, `prepare_refund`, `svc_dispute_event`, `svc_release_payment`, `release_items_on_cancel`, `send_payment_reminders`, `send_payment_due_notices` (per request on `due_at`, `overdue_notified_at`), `event_collection_summary` / `_detail`, `household_payments`, `household_open_payments`, `household_receipts`, `payment_event_export`, `cancel_payment_event`, `waive_request`, `record_offline_payment`, `cancel_open_payment`, `svc_reconcile_candidates*`, registration: `ensure_registration_payment`, `registration_payment_settled`, `registration_side_effects`, `expire_registration_holds` (hold timer), `link_registration_player`, `registration_payment_status`, and `20260405000100` account-deletion blockers.
Edge: `create-payment-intent`, `stripe-webhook`, `refund-payment`, `reconcile-payments`, `export-payments` (`_shared/payments/csv.ts`).
Core: `parent-pay.ts`, `payments.ts`, `team-details.ts`, `errors.ts`. Web: `payments/due-view`, `home-cards`, `request-list`, `request-detail`, `new-request-form`, `team/team-hub`, `registration/manage-event`, `home/more-tiles`. Mobile: `payments/staff-screen`, `team/hub`, `home/more-tiles`.

## Build order and status

1. **Database and core** (this step): plan columns and guard, installments table + state machine + roll-up, `payment_items.installment_id`, schedule generator (SQL + core), `payer_plan_options`, `svc_create_plan`, pgTAP + Vitest. Done; pgTAP written but not run (no local database).
   Not yet in step 1: registration events (plan columns, "require full balance before", the hold timer rule), quote and reserve with a plan (`payer_checkout_quote` fee impact per installment, one transaction with the first reservation), per-installment reminders/due notices/collection summary, refunds, disputes, cancel/withdraw rules, deletion blockers, staff operations (offline, waive, restructure, retry).
2. Edge Functions: `create-payment-intent` (plan + consent + `setup_future_usage`), `charge-installments` (pg_cron, `for update skip locked`, idempotency key from the installment id), webhook, refunds, reconcile, export.
3. Web UI. 4. Mobile UI. 5. Notifications. 6. Docs, `scripts/payments-integration.mjs`, Playwright + Axe, code review.

## Decisions to confirm

- Fees repeat per installment; autopay is opt-in with recorded consent; own scheduler with off-session PaymentIntents (no Subscriptions); missed installments never auto-cancel; the spot hold is satisfied by installment 1; plan terms freeze at publish; refunds apply to the latest paid installment first.
- Added while building: due instants are computed in UTC; if no plan size fits, "pay in full" is offered; the request status is derived from installments by a trigger; the deposit is reserved but disabled.
