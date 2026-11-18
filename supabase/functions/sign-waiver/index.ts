// sign-waiver: record an append-only acceptance, generate the signed-copy PDF into private Storage, email it to the signer.
// Signed-in guardians send their session; verified anonymous registrants send { signToken }.
// RECORD_SIGNER_EVIDENCE=true additionally stores the signer's IP and user agent (admin-only table). Off by default.
import * as pdf from 'npm:pdf-lib@1.17.1';
import { signWaiver } from '../_shared/registration/sign.ts';
import {
  allowedOrigins,
  appUrl,
  corsHeaders,
  effectiveAuth,
  env,
  json,
  mailer,
  makeLogger,
  signStore,
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
  const log = makeLogger('sign-waiver');
  const body = await readJsonBody(req, 8 * 1024);
  if (!body.ok) return json({ error: body.error }, body.status, cors);
  try {
    const r = await signWaiver(
      {
        store: signStore(),
        mailer: mailer(),
        pdf: pdf as any,
        appUrl: appUrl(),
        recordEvidence: env('RECORD_SIGNER_EVIDENCE') === 'true',
        log,
      },
      {
        ip: clientIp(req.headers),
        userAgent: (req.headers.get('user-agent') ?? '').slice(0, 400),
        authHeader: effectiveAuth(req),
        body: body.value,
      },
    );
    return json(r.body, r.status, cors);
  } catch (e) {
    log('error', 'unhandled', { reason: String((e as Error)?.message ?? e).slice(0, 60) });
    return json({ error: 'internal_error' }, 500, cors);
  }
});
