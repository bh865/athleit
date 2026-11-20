// report-docs-status: the weekly docs staleness job posts which help articles are stale. Authenticated with an HMAC (not a bearer
// token): X-Docs-Timestamp (unix seconds, within 10 minutes) and X-Docs-Signature = hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`).
// Secret: DOCS_STATUS_SECRET (also a GitHub Actions secret). The body is only slugs, flags and repo paths; no personal data.
import { json } from '../_shared/payments/http.ts';
import { timingSafeEqual } from '../_shared/payments/stripe.ts';
import { service } from '../_shared/registration/runtime.ts';
import { readJsonBody } from '../_shared/registration/util.ts';
import { verifyDocsSignature } from '../_shared/support/docs-status.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const secret = Deno.env.get('DOCS_STATUS_SECRET');
  const raw = await req.text();
  if (raw.length > 256 * 1024) return json({ error: 'payload_too_large' }, 413);
  const ok = await verifyDocsSignature({
    secret,
    body: raw,
    timestamp: req.headers.get('x-docs-timestamp'),
    signature: req.headers.get('x-docs-signature'),
    now: Date.now(),
    equal: timingSafeEqual,
  });
  if (!ok) return json({ error: 'forbidden' }, 403);
  const body = await readJsonBody(new Request(req.url, { method: 'POST', body: raw }), 256 * 1024);
  if (!body.ok) return json({ error: body.error }, body.status);
  const { data, error } = await service().rpc('svc_report_article_status', {
    p_items: (body.value as { items?: unknown }).items ?? [],
  });
  if (error) return json({ error: 'rejected' }, 422);
  return json({ ok: true, updated: data });
});
