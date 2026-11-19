// charge-installments: pg_cron, every 15 minutes. Authenticated by the same shared secret header as reconcile-payments.
// In test mode (the only mode these functions run in) the body may carry `now` (ISO time) so integration tests can
// advance the clock without waiting; it is ignored otherwise.
import { json } from '../_shared/payments/http.ts';
import { chargeDueInstallments } from '../_shared/payments/installments.ts';
import { makeLogger } from '../_shared/payments/log.ts';
import { env, serviceClient, stripeApi } from '../_shared/payments/runtime.ts';
import { supabaseStore } from '../_shared/payments/store.ts';
import { timingSafeEqual } from '../_shared/payments/stripe.ts';

Deno.serve(async (req) => {
  const log = makeLogger('charge-installments');
  const expected = env('RECONCILE_SECRET');
  const got = req.headers.get('x-reconcile-secret') ?? '';
  if (req.method !== 'POST' || !expected || !timingSafeEqual(got, expected))
    return json({ error: 'forbidden' }, 403);
  const body = await req.json().catch(() => ({}));
  const now =
    typeof body?.now === 'string' && !Number.isNaN(Date.parse(body.now)) ? body.now : null;
  const out = await chargeDueInstallments(
    { store: supabaseStore(serviceClient() as any), stripe: stripeApi(), log },
    { now },
  );
  return json(out);
});
