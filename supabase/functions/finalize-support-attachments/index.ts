// finalize-support-attachments: checks each uploaded object (size, real type from magic bytes) and records it; deletes failures.
// Authorised by the signed-in owner (JWT, RLS) or by the access token returned at submission.
import { finalizeAttachments } from '../_shared/support/core.ts';
import {
  allowedOrigins,
  corsHeaders,
  effectiveAuth,
  env,
  finalizeDeps,
  json,
  makeLogger,
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
  const log = makeLogger('finalize-support-attachments');
  const body = await readJsonBody(req, 16 * 1024);
  if (!body.ok) return json({ error: body.error }, body.status, cors);
  const b = body.value as { request_id?: unknown; token?: unknown; files?: unknown };
  const files = Array.isArray(b.files)
    ? ((b.files as { path?: unknown; name?: unknown }[]).filter(
        (f) => typeof f.path === 'string' && typeof f.name === 'string',
      ) as { path: string; name: string }[])
    : [];
  try {
    const r = await finalizeAttachments(finalizeDeps(log, effectiveAuth(req)), {
      ip: clientIp(req.headers),
      requestId: String(b.request_id ?? ''),
      token: typeof b.token === 'string' ? b.token : null,
      files,
    });
    return json(r.body, r.status, cors);
  } catch (e) {
    log('error', 'unhandled', { reason: String((e as Error)?.message ?? e).slice(0, 60) });
    return json({ error: 'internal_error' }, 500, cors);
  }
});
