// get-public-registration: public-safe event info for a slug. GET ?slug=... or POST {slug}. No registrants, only a coarse
// "spots" label. Anonymous responses are cacheable; `noindex` events send X-Robots-Tag.
import { getPublicRegistration } from '../_shared/registration/public.ts';
import {
  allowedOrigins,
  corsHeaders,
  effectiveAuth,
  env,
  json,
  publicStore,
} from '../_shared/registration/runtime.ts';
import { clientIp } from '../_shared/registration/util.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(
    req.headers.get('origin'),
    allowedOrigins(),
    env('STRIPE_SECRET_KEY')?.startsWith('sk_test_') ?? false,
  );
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET' && req.method !== 'POST')
    return json({ error: 'method_not_allowed' }, 405, cors);
  const slug =
    req.method === 'GET'
      ? new URL(req.url).searchParams.get('slug')
      : ((await req.json().catch(() => null)) as { slug?: string } | null)?.slug;
  try {
    const r = await getPublicRegistration(
      { store: publicStore(), cacheSeconds: Number(env('PUBLIC_CACHE_SECONDS') ?? '60') },
      { ip: clientIp(req.headers), slug, authHeader: effectiveAuth(req) },
    );
    return json(r.body, r.status, { ...cors, ...r.headers });
  } catch {
    console.error(JSON.stringify({ fn: 'get-public-registration', event: 'failed' }));
    return json({ error: 'internal_error' }, 500, cors);
  }
});
