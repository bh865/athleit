// reconcile-billing: pg_cron safety net (every 15 minutes) for team subscriptions. Same shared secret as reconcile-payments.
import { json } from '../_shared/payments/http.ts';
import { makeLogger } from '../_shared/payments/log.ts';
import { reconcileBilling, supabaseBillingStore } from '../_shared/payments/billing.ts';
import { env, serviceClient, stripeApi } from '../_shared/payments/runtime.ts';
import { timingSafeEqual } from '../_shared/payments/stripe.ts';

Deno.serve(async (req) => {
  const log = makeLogger('reconcile-billing');
  const expected = env('RECONCILE_SECRET');
  const got = req.headers.get('x-reconcile-secret') ?? '';
  if (req.method !== 'POST' || !expected || !timingSafeEqual(got, expected))
    return json({ error: 'forbidden' }, 403);
  const out = await reconcileBilling({
    store: supabaseBillingStore(serviceClient() as any),
    stripe: stripeApi(),
    log,
  });
  return json(out);
});
