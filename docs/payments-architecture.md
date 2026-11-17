# Payments architecture: Stripe Connect charge type

Status: **recommendation, implemented in Part B.** Test mode only. Sources: Stripe Connect docs on charges, destination charges,
Express accounts and refunds/disputes (read for this phase; see "Open items" for what could not be confirmed).

## Recommendation

**Express connected accounts + destination charges with `on_behalf_of` + `application_fee_amount`.**
The platform (Athleit) creates the PaymentIntent, names the team/club account as `transfer_data[destination]` and `on_behalf_of`, and collects
the application fee. Stripe's docs say direct charges target Standard accounts; for Express, destination charges are the supported pattern.

## Trade-offs

| Question                    | Destination + `on_behalf_of` (chosen)                                                                                                       | Direct charges                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Merchant of record          | The connected account is the settlement merchant (its name/descriptor on statements, its country's fees). Athleit still creates the charge. | The connected account, fully.                                      |
| Who pays Stripe fees        | **The platform** (Stripe bills indirect charges to the platform).                                                                           | The connected account (configurable).                              |
| Disputes / negative balance | **The platform** is debited and liable; it can reverse the transfer to recover. For Express accounts the platform is responsible.           | The connected account.                                             |
| Application fee             | `application_fee_amount`, moved to the platform after the full amount transfers to the team.                                                | Collected from the connected account.                              |
| Refunds                     | Platform balance is debited; `reverse_transfer` recovers the team's share; `refund_application_fee` returns the fee.                        | Debited from the connected account.                                |
| Statement descriptor        | The connected account's, because of `on_behalf_of` (good: families recognise their team).                                                   | The connected account's.                                           |
| Fit for Athleit             | One platform integration, one webhook stream, uniform reporting, Express onboarding. Teams are volunteers; they should not run disputes.    | Needs Standard accounts and full Stripe dashboards for every team. |

## What it means for the fee module (no conflict with Part A rules, one consequence)

The platform pays Stripe's fee, so the team's net is set by the **application fee**, not by Stripe:

```
application_fee = athleit_charge + (absorb: estimated Stripe fee | pass_on: the service fee)
team receives   = total - application_fee
absorb : total = base + charge;  team nets base - estimated Stripe fee
pass_on: total = grossed-up;     team nets exactly base
```

`private.compute_checkout_quote` returns `application_fee_cents`; it is stored on `payments` and frozen. The team therefore nets the **estimate**
deterministically. **Athleit bears the variance** between the estimated and the actual Stripe fee (recorded on `payments.stripe_fee_cents` from the
balance transaction, so variance is reportable). This updates Part A's note, which said the team bears it. If you prefer the team to bear the
variance, the alternative is a reconciling transfer after the balance transaction is known (more moving parts; not built).

## Flows

- **Onboarding** (`connect-onboarding`): admin only (decided by `connected_account_status.can_manage` as the signed-in user). Creates an Express
  account (`card_payments` + `transfers`), stores it, returns a single-use Account Link whose return/refresh URLs are built server-side from
  `APP_URL`/`APP_SCHEME`. `account.updated` (Connect endpoint) mirrors status; `account.application.deauthorized` disconnects.
- **Pay** (`create-payment-intent`): input is request ids only. `svc_reserve_payment` locks the requests, reuses an open payment for the same set,
  recomputes the quote server-side for that payer, records payment + items, marks requests `processing`. The PaymentIntent is created with
  idempotency key `athleit:pi:<payment id>`; metadata holds ids only. The client secret goes back to the apps (Payment Element / PaymentSheet).
- **Settle** (`stripe-webhook`): signature verified on the raw body (platform and Connect endpoints have different secrets); ledger row first;
  idempotent handlers; actual Stripe fee read from the balance transaction; receipt id assigned; receipt and staff notifications enqueued.
- **Refund** (`refund-payment`): `prepare_refund` (issuer admin) reserves refund rows with policy-driven amounts; Stripe refund uses
  `reverse_transfer=true` and `refund_application_fee` only when the policy returns the Athleit charge; the webhook finalizes status.
- **Safety net** (`reconcile-payments`, pg_cron every 10 minutes): re-fetches stuck/abandoned/canceled intents, missing fees, accounts, stuck events.

## Open items to confirm in test mode

1. Exact balance effects of `reverse_transfer` together with `refund_application_fee` on a charge made with `application_fee_amount`
   (run `scripts/payments-integration.mjs` and inspect the transfer reversal it prints).
2. Current Connect pricing for Express accounts (monthly active-account and payout fees are paid by the platform). Not confirmed from the docs
   read; check the Stripe pricing page before setting `fee_config`.
3. Stripe now recommends controller properties / Accounts v2 over the legacy `type: express` for new platforms; the brief asked for Express, which
   remains supported. Revisit before live mode.
