# Payments architecture: Stripe Connect charge type

Status: **recommendation, implemented in Part B.** Test mode only. Sources: Stripe Connect docs on charges, destination charges,
Express accounts and refunds/disputes (read for this phase; see "Open items" for what could not be confirmed).

## Decision (revised): direct charges on accounts that pay their own Stripe fees

Owner rule: **Athleit does not pay Stripe's fee. The team pays it (absorb) or the payer does (pass_on).**
Stripe's docs: destination charges (with or without `on_behalf_of`) are always billed to the platform, so they cannot satisfy this rule. The supported
way is **direct charges on connected accounts created with `controller.fees.payer = account`** (Stripe deducts its fee from the connected account;
`application_fee_amount` then contains only Athleit's own fee) and `controller.losses.payments = stripe` (Stripe, not Athleit, covers negative balances).
Accounts keep Stripe-hosted onboarding and the lightweight Express Dashboard (`controller.stripe_dashboard.type = express`).

| Question                    | Chosen: direct charge, account pays fees                                                                                              | Rejected: destination charge (+`on_behalf_of`)                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Merchant of record          | The connected account (its name and descriptor on statements).                                                                        | Settlement merchant is the account, but the platform creates the charge. |
| Stripe fees                 | **Deducted from the connected account.** Athleit pays nothing.                                                                        | Billed to the platform: violates the rule.                               |
| Application fee             | Only the Athleit charge.                                                                                                              | Would have to also cover Stripe's fee, with Athleit eating the variance. |
| Disputes / negative balance | The connected account's balance; Stripe is liable for losses (`losses.payments = stripe`). Not Athleit.                               | Platform debited and liable.                                             |
| Refunds                     | Issued on the connected account and debited from its balance (pending if short; fails after 45 days).                                 | Platform balance, with transfer reversal.                                |
| Where objects live          | On the connected account: every Stripe call carries `Stripe-Account`; events arrive on the **Connect** endpoint with `event.account`. | On the platform.                                                         |

Trade-off to know: Stripe's own guide discourages direct charges on Express accounts where the _platform_ is liable for losses. This configuration
makes Stripe liable, which is the supported combination; but the integration script must be run once in test mode to confirm Stripe accepts
`fees.payer=account` together with the `express` dashboard (see Open items).

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

## Open items to confirm in test mode

1. That Stripe accepts `controller.fees.payer=account` + `losses.payments=stripe` + `stripe_dashboard.type=express` together, and exactly how much of
   the application fee `refund_application_fee` returns on a partial vs full refund (run `scripts/payments-integration.mjs`).
2. Current Connect pricing for Express accounts (monthly active-account and payout fees are paid by the platform). Not confirmed from the docs
   read; check the Stripe pricing page before setting `fee_config`.
3. Stripe now recommends controller properties / Accounts v2 over the legacy `type: express` for new platforms; the brief asked for Express, which
   remains supported. Revisit before live mode.
