// submit-registration: the ONLY write path for registrations. See _shared/registration/submit.ts.
// Secrets: CAPTCHA_SECRET (Turnstile secret key), RESEND_API_KEY, EMAIL_FROM, APP_URL, ALLOWED_ORIGINS.
import { submitRegistration } from '../_shared/registration/submit.ts';
import {
  allowedOrigins,
  appUrl,
  captcha,
  corsHeaders,
  effectiveAuth,
  env,
  json,
  mailer,
  makeLogger,
  submitStore,
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
  const log = makeLogger('submit-registration');
  const body = await readJsonBody(req, 64 * 1024);
  if (!body.ok) return json({ error: body.error }, body.status, cors);
  try {
    const r = await submitRegistration(
      { store: submitStore(), captcha: captcha(), mailer: mailer(), appUrl: appUrl(), log },
      { ip: clientIp(req.headers), authHeader: effectiveAuth(req), body: body.value },
    );
    return json(r.body, r.status, cors);
  } catch (e) {
    log('error', 'unhandled', { reason: String((e as Error)?.message ?? e).slice(0, 60) });
    return json({ error: 'internal_error' }, 500, cors);
  }
});
