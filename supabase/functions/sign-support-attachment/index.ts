// sign-support-attachment: staff only. admin_support_attachment_path checks the platform role; this returns a 60 second signed URL
// that forces a download (so a browser never renders attacker-controlled content in our origin).
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
import { readJsonBody } from '../_shared/registration/util.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(
    req.headers.get('origin'),
    allowedOrigins(),
    env('STRIPE_SECRET_KEY')?.startsWith('sk_test_') ?? false,
  );
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  const auth = effectiveAuth(req);
  if (!auth) return json({ error: 'not_authenticated' }, 401, cors);
  const log = makeLogger('sign-support-attachment');
  const body = await readJsonBody(req, 1024);
  if (!body.ok) return json({ error: body.error }, body.status, cors);
  const id = String((body.value as { attachment_id?: unknown })?.attachment_id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'invalid_request' }, 422, cors);
  try {
    const { data: path, error } = await asCaller(auth).rpc('admin_support_attachment_path', {
      p_attachment_id: id,
    });
    if (error || typeof path !== 'string') return json({ error: 'forbidden' }, 403, cors);
    const { data, error: e2 } = await service()
      .storage.from('support-attachments')
      .createSignedUrl(path, 60, { download: true });
    if (e2 || !data) return json({ error: 'not_found' }, 404, cors);
    return json({ url: data.signedUrl }, 200, cors);
  } catch (e) {
    log('error', 'unhandled', { reason: String((e as Error)?.message ?? e).slice(0, 60) });
    return json({ error: 'internal_error' }, 500, cors);
  }
});
