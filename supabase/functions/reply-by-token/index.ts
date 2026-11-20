// reply-by-token: the signed-out reply. Same limits as a signed-in reply; closed requests refuse.
import { replyByToken } from '../_shared/support/core.ts';
import {
  allowedOrigins,
  corsHeaders,
  env,
  json,
  makeLogger,
  tokenDeps,
} from '../_shared/support/runtime.ts';
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
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  const log = makeLogger('reply-by-token');
  const body = await readJsonBody(req, 16 * 1024);
  if (!body.ok) return json({ error: body.error }, body.status, cors);
  const b = body.value as { token?: unknown; body?: unknown };
  try {
    const r = await replyByToken(tokenDeps(), {
      ip: clientIp(req.headers),
      token: String(b?.token ?? ''),
      body: b?.body,
    });
    return json(r.body, r.status, cors);
  } catch (e) {
    log('error', 'unhandled', { reason: String((e as Error)?.message ?? e).slice(0, 60) });
    return json({ error: 'internal_error' }, 500, cors);
  }
});
