# Payments: end-to-end testing to do

Stripe **test mode** only. Watch the function logs (`stripe-webhook`, `create-payment-intent`, `refund-payment`, `reconcile-payments`) and the
`payments`, `payment_requests`, `refunds`, `stripe_webhook_events` and `notification_outbox` tables while testing. Test cards:
`4242 4242 4242 4242` (succeeds), `4000 0000 0000 9995` (declined, insufficient funds), `4000 0025 0000 3155` (3D Secure), `4000 0000 0000 0259`
(creates a dispute after success).

## Already verified live (web, Dev project, Stripe test mode)

- [x] Payouts onboarding for a team (full Stripe dashboard, account pays its own Stripe fees, Stripe covers losses)
- [x] Send a request, pay with 4242, Processing, then receipt `RCP-…` after the webhook
- [x] Actual Stripe fee recorded from the balance transaction; Athleit pays no Stripe fee
- [x] Declined card (friendly failure), retry on the SAME reused intent, no double charge
- [x] 3D Secure card, completed
- [x] Partial refund and refund of the remainder, finalized by the webhook; our reserved refund rows adopted, not duplicated
- [x] CSV export (contents, amounts, refunded column, no card data)
- [x] Stripe-side integration script (`scripts/payments-integration.mjs`)

## To do

### Payment edge cases (web)

- [ ] 3D Secure **Fail authentication**: the "couldn't verify your card" message, request stays retryable
- [ ] Close the tab mid-Processing, reopen later: the request resolves and the receipt notification arrives
- [ ] Network drop during payment (offline in dev tools): friendly message, no charge unless a receipt appears
- [ ] Two household guardians: one pays, the other sees "already paid" on retry
- [ ] Multi-request checkout: two children, one summed total, one receipt listing both; mixed payees or fee terms are refused with a clear message
- [ ] Pay a request that was cancelled or waived while the checkout was open: refused, nothing charged
- [ ] Abandoned checkout (intent left at "requires payment method"): reconcile voids it after 24 h and frees the request

### Fees

- [ ] `pass_on` event: families see "Service fee", team nets about the base; actual vs estimated Stripe fee recorded
- [ ] Non-zero Athleit charge in `fee_config`: shown as its own line, collected as the application fee, returned only per the refund flags
- [ ] Full refund with service fee and Athleit charge: flags `refund_*_on_full` honored; partial refund keeps them unless the partial flags are on

### Staff operations (web)

- [ ] Send reminder: families notified once per household; a second click within 24 h reminds nobody
- [ ] Waive a request, record cash / check payment; each shows in the audit log and CSV
- [ ] Cancel a published event with one paid, one unpaid and one mid-checkout request
- [ ] Selected-players audience; club-issued event (club admin sees names and totals only for events the club issued)
- [ ] Coach / manager: sees status, cannot set up payouts or refund; parent sees only their household

### Privacy and permissions

- [ ] **Second family** cannot see the first family's requests, payments or receipts (UI and direct API)
- [ ] 13+ player login can view their own request but not pay
- [ ] A signed-in user cannot call refund, export or onboarding for a team they don't administer

### Disputes and accounts

- [ ] Dispute (card `4000 0000 0000 0259`): request flagged, staff notified, refund blocked while disputed; resolve in Stripe
- [ ] Onboarding "needs info" and "disconnected" states reflected in the Payouts card; onboarding link refresh when expired
- [ ] `account.updated` after the team changes details in their Stripe dashboard

### Notifications

- [ ] Due-in-3-days and overdue notices (hourly cron) arrive once; deep links open the exact request / event on web
- [ ] Fix email delivery: every payments email currently fails with `email_http_422` (Phase 3 email provider / sender setup), then retest receipt and reminder emails
- [ ] Notification preferences: the Payments category, mutes and quiet hours are respected

### Infrastructure

- [ ] `reconcile-payments` cron: create the Vault secrets (`reconcile_function_url`, `reconcile_secret`) and confirm it repairs a stuck `processing` payment and fills a missing Stripe fee
- [ ] Replay a webhook event from the Stripe dashboard: no change (duplicate), ledger row unchanged
- [ ] Live-mode event is refused; a test key set to a live key is refused by the functions

### Mobile (EAS development build; see `mobile-manual-tests.md`)

- [ ] Pay tab: list, multi-select, review sheet, PaymentSheet themed in light and dark
- [ ] 4242, decline, 3D Secure, Processing, receipt; kill the app mid-payment
- [ ] Apple Pay (needs the merchant ID and Stripe's Apple Pay certificate step) and Google Pay
- [ ] Staff on mobile: payouts, new request, collection, remind, waive, paid cash
- [ ] Notification deep link opens the exact request
- [ ] VoiceOver / TalkBack labels, 44pt targets, Reduce Motion and Reduce Transparency

### Automated

- [ ] Run `apps/web/e2e/payments.spec.ts` (needs `STRIPE_E2E=1`, the service-role key, a ready test account and webhook forwarding)
- [ ] Add a CI job or documented command for the Stripe-side script (`scripts/payments-integration.mjs`)

### Before live mode

- [ ] Work through [payments-go-live.md](payments-go-live.md) and [payments-compliance.md](payments-compliance.md); wipe the old test data from the Stripe sandbox
