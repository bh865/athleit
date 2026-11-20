// submit-support-request: signed-out ticket creation (captcha, rate limits, hold for review, signed upload URLs).
// Signed-in people create requests with the create_support_request RPC (RLS and ownership apply); this is the public path.
// Secrets: CAPTCHA_SECRET, RESEND_API_KEY, EMAIL_FROM, APP_URL, ALLOWED_ORIGINS.
import { submitPublic } from '../_shared/support/core.ts';
import {
  allowedOrigins,
  corsHeaders,
  env,
  json,
  makeLogger,
  submitDeps,
} from '../_shared/support/runtime.ts';
import { clientIp, readJsonBody } from '../_shared/registration/util.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(
    req.headers.get('origin'),
    allowedOrigins(),
    env('STRIPE_SECRET_KEY')?.startsWith('sk_test_') ?? false,
  );
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  const log = makeLogger('submit-support-request');
  const body = await readJsonBody(req, 32 * 1024);
  if (!body.ok) return json({ error: body.error }, body.status, cors);
  try {
    const r = await submitPublic(submitDeps(log), { ip: clientIp(req.headers), body: body.value });
    return json(r.body, r.status, cors);
  } catch (e) {
    log('error', 'unhandled', { reason: String((e as Error)?.message ?? e).slice(0, 60) });
    return json({ error: 'internal_error' }, 500, cors);
  }
});
