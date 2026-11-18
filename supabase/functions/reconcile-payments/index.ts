// reconcile-payments: pg_cron safety net. Authenticated by a shared secret header (set in Vault + function secrets).
import { json } from '../_shared/payments/http.ts';
import { makeLogger } from '../_shared/payments/log.ts';
import { reconcile } from '../_shared/payments/reconcile.ts';
import { env, serviceClient, stripeApi } from '../_shared/payments/runtime.ts';
import { supabaseStore } from '../_shared/payments/store.ts';
import { timingSafeEqual } from '../_shared/payments/stripe.ts';

Deno.serve(async (req) => {
  const log = makeLogger('reconcile-payments');
  const expected = env('RECONCILE_SECRET');
  const got = req.headers.get('x-reconcile-secret') ?? '';
  if (req.method !== 'POST' || !expected || !timingSafeEqual(got, expected))
    return json({ error: 'forbidden' }, 403);
  const out = await reconcile({
    store: supabaseStore(serviceClient() as any),
    stripe: stripeApi(),
    log,
  });
  return json(out);
});
