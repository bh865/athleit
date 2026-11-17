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
