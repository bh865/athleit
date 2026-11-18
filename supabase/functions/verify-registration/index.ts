// verify-registration: POST { token } from the emailed link (the token travels in the URL fragment, then in this body).
import { verifyRegistration } from '../_shared/registration/verify.ts';
import {
  allowedOrigins,
  corsHeaders,
  env,
  json,
  makeLogger,
  verifyStore,
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
  const log = makeLogger('verify-registration');
  const body = await readJsonBody(req, 2 * 1024);
  if (!body.ok) return json({ error: body.error }, body.status, cors);
  try {
    const r = await verifyRegistration(
      { store: verifyStore(), log },
      { ip: clientIp(req.headers), body: body.value },
    );
    return json(r.body, r.status, cors);
  } catch (e) {
    log('error', 'unhandled', { reason: String((e as Error)?.message ?? e).slice(0, 60) });
    return json({ error: 'internal_error' }, 500, cors);
  }
});
