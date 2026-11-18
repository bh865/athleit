// claim-registration: POST { token } with the user's session. See _shared/registration/claim.ts.
import { claimRegistration } from '../_shared/registration/claim.ts';
import {
  allowedOrigins,
  claimStore,
  corsHeaders,
  effectiveAuth,
  env,
  json,
  makeLogger,
} from '../_shared/registration/runtime.ts';
import { clientIp, readJsonBody } from '../_shared/registration/util.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(
    req.headers.get('origin'),
    allowedOrigins(),
    env('STRIPE_SECRET_KEY')?.startsWith('sk_test_') ?? false,
  );
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  const log = makeLogger('claim-registration');
  const body = await readJsonBody(req, 2 * 1024);
  if (!body.ok) return json({ error: body.error }, body.status, cors);
  try {
    const r = await claimRegistration(
      { store: claimStore(), log },
      { ip: clientIp(req.headers), authHeader: effectiveAuth(req), body: body.value },
    );
    return json(r.body, r.status, cors);
  } catch (e) {
    log('error', 'unhandled', { reason: String((e as Error)?.message ?? e).slice(0, 60) });
    return json({ error: 'internal_error' }, 500, cors);
  }
});
