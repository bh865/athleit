// Deno wiring shared by the entry points (kept out of the testable cores).
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { corsHeaders, json, mapError } from './http.ts';
import { makeLogger, type Logger } from './log.ts';
import { supabaseStore, type Store } from './store.ts';
import { StripeApi, StripeError } from './stripe.ts';

export const env = (k: string) => Deno.env.get(k) || undefined;

export function allowedOrigins(): string[] {
  return (env('ALLOWED_ORIGINS') ?? env('APP_URL') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function serviceClient() {
  return createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A client that acts AS the caller (RLS and auth.uid() apply): used for every authorization decision. */
export function userClient(authHeader: string) {
  return createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
}

export function stripeApi() {
  return new StripeApi({ secretKey: env('STRIPE_SECRET_KEY') ?? '' });
}

/** Standard entry for user-facing functions: CORS, POST only, authenticate, rate limit, validate, handle errors. */
export function userFunction<T>(
  name: string,
  parse: (body: unknown) => { success: boolean; data?: T },
  limit: { perMinute: number },
  run: (ctx: {
    user: { id: string };
    input: T;
    authHeader: string;
    store: Store;
    log: Logger;
    user$: ReturnType<typeof userClient>;
  }) => Promise<Response>,
) {
  Deno.serve(async (req) => {
    const cors = corsHeaders(
      req.headers.get('origin'),
      allowedOrigins(),
      /^(sk|rk)_test_/.test(env('STRIPE_SECRET_KEY') ?? ''),
    );
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
    const log = makeLogger(name);
    try {
      const authHeader = req.headers.get('authorization') ?? '';
      if (!authHeader.toLowerCase().startsWith('bearer '))
        return json({ error: 'not_authenticated' }, 401, cors);
      const user$ = userClient(authHeader);
      const { data: u, error } = await user$.auth.getUser();
      if (error || !u.user) return json({ error: 'not_authenticated' }, 401, cors);
      const store = supabaseStore(serviceClient() as any);
      if (!(await store.rateLimit(`${name}:${u.user.id}`, limit.perMinute, 60))) {
        log('warn', 'rate_limited', { user: u.user.id });
        return json({ error: 'rate_limited' }, 429, { ...cors, 'retry-after': '30' });
      }
      const parsed = parse(await req.json().catch(() => null));
      if (!parsed.success) return json({ error: 'invalid_input' }, 400, cors);
      const res = await run({
        user: { id: u.user.id },
        input: parsed.data as T,
        authHeader,
        store,
        log,
        user$,
      });
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      const m = mapError(e);
      // Safe diagnostics only: Stripe's error type/code/status (never its message, which can echo request values) or our own error id.
      const detail =
        e instanceof StripeError
          ? {
              stripe_type: e.type,
              stripe_code: e.code,
              stripe_status: e.status,
              stripe_param: e.param,
            }
          : { reason: String((e as Error)?.message ?? e).slice(0, 60) };
      log(m.status >= 500 ? 'error' : 'warn', 'request_failed', { code: m.code, ...detail });
      return json({ error: m.code }, m.status, cors);
    }
  });
}
