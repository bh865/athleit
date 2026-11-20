// record-article-feedback: "Was this helpful?" votes and no-result searches. Rate limited, no personal data.
// A signed-in vote carries the profile id (from the JWT); search misses never do and drop email-like queries.
import {
  allowedOrigins,
  asCaller,
  corsHeaders,
  effectiveAuth,
  env,
  json,
  makeLogger,
  service,
} from '../_shared/support/runtime.ts';
import { loggableMiss } from '../_shared/support/rules.ts';
import { clientIp, readJsonBody } from '../_shared/registration/util.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(
    req.headers.get('origin'),
    allowedOrigins(),
    env('STRIPE_SECRET_KEY')?.startsWith('sk_test_') ?? false,
  );
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  const log = makeLogger('record-article-feedback');
  const body = await readJsonBody(req, 4 * 1024);
  if (!body.ok) return json({ error: body.error }, body.status, cors);
  const b = body.value as {
    kind?: unknown;
    slug?: unknown;
    helpful?: unknown;
    comment?: unknown;
    query?: unknown;
  };
  const db = service();
  const ip = clientIp(req.headers);
  try {
    const { data: ok } = await db.rpc('svc_rate_limit', {
      p_bucket: `help:feedback:${ip}`,
      p_limit: 40,
      p_window_seconds: 3600,
    });
    if (ok !== true) return json({ error: 'rate_limited' }, 429, cors);
    if (b.kind === 'miss') {
      const q = typeof b.query === 'string' ? loggableMiss(b.query) : null;
      if (q) await db.rpc('svc_record_search_miss', { p_query: q });
      return json({ ok: true }, 200, cors); // same answer whether or not it was logged
    }
    if (
      b.kind === 'vote' &&
      typeof b.slug === 'string' &&
      /^[a-z0-9-]{1,120}$/.test(b.slug) &&
      typeof b.helpful === 'boolean'
    ) {
      const auth = effectiveAuth(req);
      let profile: string | null = null;
      if (auth) {
        const { data } = await asCaller(auth).auth.getUser();
        profile = data.user?.id ?? null;
      }
      await db.rpc('svc_record_article_feedback', {
        p_slug: b.slug,
        p_helpful: b.helpful,
        p_comment: typeof b.comment === 'string' ? b.comment : null,
        p_profile: profile,
      });
      return json({ ok: true }, 200, cors);
    }
    return json({ error: 'invalid_request' }, 422, cors);
  } catch (e) {
    log('error', 'unhandled', { reason: String((e as Error)?.message ?? e).slice(0, 60) });
    return json({ error: 'internal_error' }, 500, cors);
  }
});
