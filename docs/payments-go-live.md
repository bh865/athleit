# Going live checklist (NOT executed; needs explicit approval)

Nothing here has been done. Phase 4 runs in Stripe **test mode** only.

1. Legal: resolve every item in [payments-compliance.md](payments-compliance.md); finalize fee copy and refund policy flags.
2. Pricing: choose Athleit charge (flat / bps) and Stripe estimate in `fee_config` via `private.admin_set_fee_config`.
3. Stripe account: complete the live platform profile, Connect settings (branding, countries), and verify business details.
4. Keys: create live secret key + publishable key; set `STRIPE_SECRET_KEY` (Edge Function secret) and the apps' publishable key. The functions
   currently **refuse** `sk_live_`/`rk_live_`: remove `assertTestKey`'s live guard only as part of this approved step.
5. Webhooks: register the live platform endpoint and Connect endpoint to `.../functions/v1/stripe-webhook`; set both signing secrets. Remove the
   test `livemode` refusal in `processWebhook`.
6. Apple Pay: merchant ID, domain verification file on the production web domain, Stripe Apple Pay certificate. Google Pay: production access.
7. Mobile: production EAS build with the live publishable key and URL scheme.
8. Production Supabase project (separate from Dev): run migrations, create Vault secrets (`reconcile_function_url`, `reconcile_secret`), deploy functions.
9. Dry run with a real small payment and a real refund on a team the owner controls; confirm payout.
10. Monitoring: alerts on webhook failures, unprocessed `stripe_webhook_events`, `reconcile-payments` errors, dispute notifications.

## Team subscription billing (also NOT executed; test mode only so far)

Live-mode steps for the owner. Details in [billing.md](billing.md).

11. Platform webhook: register the **live** platform endpoint (no Connect) to `.../functions/v1/stripe-webhook` with exactly these events: `checkout.session.completed`, `customer.subscription.created|updated|deleted|trial_will_end`, `invoice.created|finalized|paid|payment_failed|payment_action_required`, `charge.refunded`, `charge.dispute.created`. `STRIPE_WEBHOOK_SECRET` is now **required**: the function refuses to run without it.
12. Billing settings in the live Stripe account: Smart Retries on with a retry window of about three weeks and "cancel the subscription" after the final failure; customer emails limited to receipts; Billing Portal limited to payment method updates and invoice history (cancel is done in the app); the Stripe Tax decision (`team_subscription.automatic_tax`) after asking an accountant.
13. Vault: `billing_reconcile_function_url` (the `reconcile-billing` function URL); `reconcile_secret` is shared with `reconcile-payments`. Deploy `create-billing-checkout`, `create-billing-portal-session`, `update-team-subscription`, `get-billing-card`, `reconcile-billing`.
14. Launch: create the first platform admin (runbook), enrol TOTP, then `select private.enable_team_billing(<owner id>, '<reason>')`. This starts a fresh trial for every existing team.
15. Store policy: decide whether the iOS and Android apps may link out to web billing (they currently show a plain instruction only).
