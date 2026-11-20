// send-support-emails: drains support_email_queue (confirmations and staff replies for signed-out requesters).
// Called by pg_cron through pg_net with the shared secret header (same as reconcile-billing).
import { drainEmails } from '../_shared/support/core.ts';
import { emailDeps, env, json, makeLogger } from '../_shared/support/runtime.ts';
import { timingSafeEqual } from '../_shared/payments/stripe.ts';

Deno.serve(async (req) => {
  const log = makeLogger('send-support-emails');
  const expected = env('RECONCILE_SECRET');
  const got = req.headers.get('x-reconcile-secret') ?? '';
  if (req.method !== 'POST' || !expected || !timingSafeEqual(got, expected))
    return json({ error: 'forbidden' }, 403);
  return json(await drainEmails(emailDeps(log), 50));
});
