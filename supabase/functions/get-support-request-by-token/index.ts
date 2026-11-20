// get-support-request-by-token: the signed-out read view. Non-internal messages only. Never cached, never logged with the token.
import { viewByToken } from '../_shared/support/core.ts';
import { allowedOrigins, corsHeaders, env, json, makeLogger } from '../_shared/support/runtime.ts';
import { tokenDeps } from '../_shared/support/runtime.ts';
import { clientIp, readJsonBody } from '../_shared/registration/util.ts';

Deno.serve(async (req) => {
  const cors = {
    ...corsHeaders(
      req.headers.get('origin'),
      allowedOrigins(),
      env('STRIPE_SECRET_KEY')?.startsWith('sk_test_') ?? false,
    ),
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  const log = makeLogger('get-support-request-by-token');
  const body = await readJsonBody(req, 2 * 1024);
  if (!body.ok) return json({ error: body.error }, body.status, cors);
  try {
    const r = await viewByToken(tokenDeps(), {
      ip: clientIp(req.headers),
      token: String((body.value as { token?: unknown })?.token ?? ''),
    });
    return json(r.body, r.status, cors);
  } catch (e) {
    log('error', 'unhandled', { reason: String((e as Error)?.message ?? e).slice(0, 60) });
    return json({ error: 'internal_error' }, 500, cors);
  }
});
