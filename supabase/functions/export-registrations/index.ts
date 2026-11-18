// export-registrations: CSV of an event's registrations for staff. The database function decides (issuer staff only;
// sensitive columns only with the capability; every export audited). Cells are neutralized against CSV injection.
import { registrationsToCsv } from '../_shared/registration/export.ts';
import {
  allowedOrigins,
  asCaller,
  corsHeaders,
  effectiveAuth,
  env,
  json,
  makeLogger,
  service,
} from '../_shared/registration/runtime.ts';
import { mapDbError, readJsonBody } from '../_shared/registration/util.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(
    req.headers.get('origin'),
    allowedOrigins(),
    env('STRIPE_SECRET_KEY')?.startsWith('sk_test_') ?? false,
  );
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  const log = makeLogger('export-registrations');
  const auth = effectiveAuth(req);
  if (!auth) return json({ error: 'not_authenticated' }, 401, cors);
  const body = await readJsonBody(req, 1024);
  if (!body.ok) return json({ error: body.error }, body.status, cors);
  const { eventId, includeSensitive } = (body.value ?? {}) as {
    eventId?: unknown;
    includeSensitive?: unknown;
  };
  if (typeof eventId !== 'string' || !/^[0-9a-f-]{36}$/i.test(eventId))
    return json({ error: 'invalid_input' }, 400, cors);
  try {
    const user = await asCaller(auth).auth.getUser();
    if (user.error || !user.data.user) return json({ error: 'not_authenticated' }, 401, cors);
    const ok = await service().rpc('svc_rate_limit', {
      p_bucket: `reg-export:${user.data.user.id}`,
      p_limit: 10,
      p_window_seconds: 60,
    });
    if (ok.error || ok.data !== true) return json({ error: 'rate_limited' }, 429, cors);
    const { data, error } = await asCaller(auth).rpc('export_registrations', {
      p_event_id: eventId,
      p_include_sensitive: includeSensitive === true,
    });
    if (error) {
      const m = mapDbError(error);
      return json({ error: m.code }, m.status, cors);
    }
    log('info', 'exported', {
      event: eventId,
      rows: (data as any).rows?.length ?? 0,
      sensitive: includeSensitive === true,
    });
    return new Response(registrationsToCsv(data as any), {
      status: 200,
      headers: {
        ...cors,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="registrations.csv"',
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    log('error', 'unhandled', { reason: String((e as Error)?.message ?? e).slice(0, 60) });
    return json({ error: 'internal_error' }, 500, cors);
  }
});
