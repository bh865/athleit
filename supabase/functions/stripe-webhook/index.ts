// stripe-webhook: verifies the signature over the RAW body, then ledger-first idempotent handling.
// Two Stripe endpoints point here (platform events and Connect events); each has its own signing secret.
import { json } from '../_shared/payments/http.ts';
import { makeLogger } from '../_shared/payments/log.ts';
import { env, serviceClient, stripeApi } from '../_shared/payments/runtime.ts';
import { supabaseBillingStore } from '../_shared/payments/billing.ts';
import { supabaseStore } from '../_shared/payments/store.ts';
import { processWebhook } from '../_shared/payments/webhook.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const log = makeLogger('stripe-webhook');
  const raw = await req.text(); // raw body, exactly as signed
  // The platform endpoint (subscription billing) is REQUIRED since team subscriptions: without its secret, platform events
  // could not be verified, so refuse loudly instead of silently dropping them.
  if (!env('STRIPE_WEBHOOK_SECRET')) {
    log('error', 'webhook.platform_secret_missing');
    return json({ error: 'webhook_not_configured' }, 500);
  }
  const secrets = [env('STRIPE_WEBHOOK_SECRET'), env('STRIPE_CONNECT_WEBHOOK_SECRET')].filter(
    Boolean,
  ) as string[];
  const stripe = {
    get: (...a: Parameters<ReturnType<typeof stripeApi>['get']>) => stripeApi().get(...a),
    post: (...a: Parameters<ReturnType<typeof stripeApi>['post']>) => stripeApi().post(...a),
  };
  const r = await processWebhook(raw, req.headers.get('stripe-signature'), {
    secrets,
    log,
    store: supabaseStore(serviceClient() as any),
    billing: { store: supabaseBillingStore(serviceClient() as any), stripe, log },
    // Built lazily so a bad signature is rejected (400) even before the Stripe key is configured.
    stripe: {
      get: (...a: Parameters<ReturnType<typeof stripeApi>['get']>) => stripeApi().get(...a),
      post: (...a: Parameters<ReturnType<typeof stripeApi>['post']>) => stripeApi().post(...a),
    },
  });
  return json(r.body, r.status);
});
