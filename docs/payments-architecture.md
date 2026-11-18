# Payments architecture: Stripe Connect charge type

Status: **recommendation, implemented in Part B.** Test mode only. Sources: Stripe Connect docs on charges, destination charges,
Express accounts and refunds/disputes (read for this phase; see "Open items" for what could not be confirmed).

## Decision (revised): direct charges on accounts that pay their own Stripe fees

Owner rule: **Athleit does not pay Stripe's fee. The team pays it (absorb) or the payer does (pass_on).**
Stripe's docs: destination charges (with or without `on_behalf_of`) are always billed to the platform, so they cannot satisfy this rule. The supported
way is **direct charges on connected accounts created with `controller.fees.payer = account`** (Stripe deducts its fee from the connected account;
`application_fee_amount` then contains only Athleit's own fee) and `controller.losses.payments = stripe` (Stripe, not Athleit, covers negative balances).
Accounts use Stripe-hosted onboarding and the **full Stripe Dashboard** (`controller.stripe_dashboard.type = full`, the Standard-style configuration). Confirmed by Stripe's API in test mode: _"When `stripe_dashboard[type]=express`, your platform must collect fees and be liable for negative balances"_, so an Express dashboard cannot be combined with "the account pays its own fees". Consequence: teams manage payouts, refunds and disputes in their own Stripe Dashboard (volunteer admins sign in to Stripe), which is the price of Athleit paying no Stripe fees.

| Question                    | Chosen: direct charge, account pays fees                                                                                              | Rejected: destination charge (+`on_behalf_of`)                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Merchant of record          | The connected account (its name and descriptor on statements).                                                                        | Settlement merchant is the account, but the platform creates the charge. |
| Stripe fees                 | **Deducted from the connected account.** Athleit pays nothing.                                                                        | Billed to the platform: violates the rule.                               |
| Application fee             | Only the Athleit charge.                                                                                                              | Would have to also cover Stripe's fee, with Athleit eating the variance. |
| Disputes / negative balance | The connected account's balance; Stripe is liable for losses (`losses.payments = stripe`). Not Athleit.                               | Platform debited and liable.                                             |
| Refunds                     | Issued on the connected account and debited from its balance (pending if short; fails after 45 days).                                 | Platform balance, with transfer reversal.                                |
| Where objects live          | On the connected account: every Stripe call carries `Stripe-Account`; events arrive on the **Connect** endpoint with `event.account`. | On the platform.                                                         |

Trade-off to know: the full dashboard is heavier for volunteer admins than Express. The alternative that keeps Express makes the platform pay Stripe's fees and bear losses, which the owner ruled out.

## What it means for the fee module (Part A rules unchanged)

```
application_fee = athleit_charge only
absorb : payer pays base + charge;           team nets base - ACTUAL Stripe fee
pass_on: payer pays the grossed-up total;    team nets ~ base (the gross-up used the ESTIMATED fee)
```

`net_to_account_cents = total - application_fee - Stripe fee` (estimated until the balance transaction is read, then actual). The variance between
estimated and actual Stripe fee is the **team's** under both policies (as in Part A). Athleit's only income is its own charge.

## Flows

- **Onboarding** (`connect-onboarding`): admin only (decided by `connected_account_status.can_manage` as the signed-in user). Creates an Express
  account (`card_payments` + `transfers`), stores it, returns a single-use Account Link whose return/refresh URLs are built server-side from
  `APP_URL`/`APP_SCHEME`. `account.updated` (Connect endpoint) mirrors status; `account.application.deauthorized` disconnects.
- **Pay** (`create-payment-intent`): input is request ids only. `svc_reserve_payment` locks the requests, reuses an open payment for the same set,
  recomputes the quote server-side for that payer, records payment + items, marks requests `processing`. The PaymentIntent is created **on the
  connected account** with idempotency key `athleit:pi:<payment id>`; metadata holds ids only. The response carries the client secret **and the
  connected account id**: the Payment Element (`loadStripe(pk, { stripeAccount })`) and PaymentSheet (`stripeAccountId`) must be initialised with it.
- **Settle** (`stripe-webhook`): signature verified on the raw body (platform and Connect endpoints have different secrets); ledger row first;
  idempotent handlers; actual Stripe fee read from the balance transaction; receipt id assigned; receipt and staff notifications enqueued.
- **Refund** (`refund-payment`): `prepare_refund` (issuer admin) reserves refund rows with policy-driven amounts; Stripe refund uses
  a refund on the connected account, with `refund_application_fee` only when the policy returns the Athleit charge; the webhook finalizes status.
- **Safety net** (`reconcile-payments`, pg_cron every 10 minutes): re-fetches stuck/abandoned/canceled intents, missing fees, accounts, stuck events.

## Verified in Stripe test mode (scripts/payments-integration.mjs, all passing)

- A direct charge created with the `Stripe-Account` header on an account with `fees.payer=account`, `losses.payments=stripe`, full dashboard: succeeds
  ($45.45 total, 45c application fee). The balance transaction on the connected account shows the Stripe fee (162c = 2.9% + 30c, exactly the estimate) and
  the 45c application fee as separate lines: **the team bears Stripe's fee; Athleit pays none.** Net to the team 4338 = 4545 - 162 - 45.
- Same idempotency key returns the same intent; 4000 0000 0000 9995 declines (insufficient funds); 4000 0025 0000 3155 requires authentication.
- Refunds are issued on the connected account. A partial refund with `refund_application_fee=false` keeps the Athleit charge; the final refund with
  `refund_application_fee=true` returned the whole 45c (application fee refunded: 45). This matches the policy flags.
- Stripe rejects `stripe_dashboard.type=express` with `fees.payer=account` ("your platform must collect fees and be liable for negative balances"), hence
  the full dashboard.

## Open items

1. Not yet exercised end to end: the Connect webhook endpoint (secret and endpoint registration), so payment status changes still need a run through
   the real `stripe-webhook` function.
2. Current Connect pricing: with `fees.payer=account` Stripe's docs say it charges no Connect fees to the account or the platform; confirm on the pricing page.
3. Stripe recommends Accounts v2 for new platforms; v1 controller properties are used here and remain supported.
