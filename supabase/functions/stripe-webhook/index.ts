// stripe-webhook: verifies the signature over the RAW body, then ledger-first idempotent handling.
// Two Stripe endpoints point here (platform events and Connect events); each has its own signing secret.
import { json } from '../_shared/payments/http.ts';
import { makeLogger } from '../_shared/payments/log.ts';
import { env, serviceClient, stripeApi } from '../_shared/payments/runtime.ts';
import { supabaseStore } from '../_shared/payments/store.ts';
import { processWebhook } from '../_shared/payments/webhook.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const log = makeLogger('stripe-webhook');
  const raw = await req.text(); // raw body, exactly as signed
  const secrets = [env('STRIPE_WEBHOOK_SECRET'), env('STRIPE_CONNECT_WEBHOOK_SECRET')].filter(
    Boolean,
  ) as string[];
  const r = await processWebhook(raw, req.headers.get('stripe-signature'), {
    secrets,
    log,
    store: supabaseStore(serviceClient() as any),
    // Built lazily so a bad signature is rejected (400) even before the Stripe key is configured.
    stripe: {
      get: (...a: Parameters<ReturnType<typeof stripeApi>['get']>) => stripeApi().get(...a),
      post: (...a: Parameters<ReturnType<typeof stripeApi>['post']>) => stripeApi().post(...a),
    },
  });
  return json(r.body, r.status);
});
