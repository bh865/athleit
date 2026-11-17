// Minimal Stripe REST client + webhook signature verification. Runtime-neutral (Deno and Node 20+):
// only `fetch` and Web Crypto. No SDK, so every request is explicit and testable.
//
// TEST MODE ONLY for Phase 4: assertTestKey() refuses live keys outright.

export class StripeError extends Error {
  constructor(
    public status: number,
    public type: string,
    public code: string | null,
    message: string,
  ) {
    super(message);
  }
}

/** Refuse anything that is not a test-mode secret or restricted key. Never echoes the key. */
export function assertTestKey(key: string | undefined): string {
  if (!key) throw new Error('stripe_key_missing');
  if (/^(sk|rk)_live_/.test(key)) throw new Error('live_key_refused');
  if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key)) throw new Error('stripe_key_invalid');
  return key;
}

/** Stripe's form encoding for nested params: a[b][c]=1, arrays as a[0]=x. */
export function encodeForm(params: Record<string, unknown>): string {
  const out: string[] = [];
  const add = (k: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => add(`${k}[${i}]`, x));
    else if (typeof v === 'object')
      for (const [kk, vv] of Object.entries(v)) add(`${k}[${kk}]`, vv);
    else out.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  };
  for (const [k, v] of Object.entries(params)) add(k, v);
  return out.join('&');
}

export interface StripeConfig {
  secretKey: string;
  fetch?: typeof fetch;
  apiVersion?: string;
}

export interface RequestOptions {
  idempotencyKey?: string;
  query?: Record<string, unknown>;
  stripeAccount?: string;
}

export type StripeObject = Record<string, any>;

export class StripeApi {
  private key: string;
  private f: typeof fetch;
  private version?: string;
  constructor(cfg: StripeConfig) {
    this.key = assertTestKey(cfg.secretKey);
    this.f = cfg.fetch ?? fetch;
    this.version = cfg.apiVersion;
  }

  async request(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, unknown> = {},
    opts: RequestOptions = {},
  ): Promise<StripeObject> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.key}` };
    if (this.version) headers['stripe-version'] = this.version;
    if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
    if (opts.stripeAccount) headers['stripe-account'] = opts.stripeAccount;
    let url = `https://api.stripe.com${path}`;
    let body: string | undefined;
    if (method === 'GET') {
      const q = encodeForm({ ...params, ...(opts.query ?? {}) });
      if (q) url += `?${q}`;
    } else {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = encodeForm(params);
    }
    const res = await this.f(url, { method, headers, body });
    const json = (await res.json().catch(() => ({}))) as StripeObject;
    if (!res.ok) {
      const e = (json.error ?? {}) as StripeObject;
      // Only the type/code are kept: Stripe error messages can echo request values.
      throw new StripeError(
        res.status,
        String(e.type ?? 'api_error'),
        e.code ? String(e.code) : null,
        `stripe_${e.type ?? 'error'}`,
      );
    }
    return json;
  }
  get(path: string, query?: Record<string, unknown>, stripeAccount?: string) {
    return this.request('GET', path, query ?? {}, { stripeAccount });
  }
  post(
    path: string,
    params: Record<string, unknown>,
    idempotencyKey?: string,
    stripeAccount?: string,
  ) {
    return this.request('POST', path, params, { idempotencyKey, stripeAccount });
  }
}

// Webhook signature (https://docs.stripe.com/webhooks#verify-manually): HMAC-SHA256 over `${t}.${rawBody}`.
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function signPayload(
  secret: string,
  timestamp: number,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`)));
}

export type SignatureResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'missing_header'
        | 'malformed_header'
        | 'no_secret'
        | 'timestamp_out_of_tolerance'
        | 'no_match';
    };

/** Verifies against ANY of the secrets (platform endpoint and Connect endpoint have different ones). */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secrets: string[],
  nowMs = Date.now(),
  toleranceSec = 300,
): Promise<SignatureResult> {
  if (!header) return { ok: false, reason: 'missing_header' };
  const live = secrets.filter(Boolean);
  if (live.length === 0) return { ok: false, reason: 'no_secret' };
  let t = NaN;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') t = Number(v);
    else if (k === 'v1') v1.push(v);
  }
  if (!Number.isFinite(t) || v1.length === 0) return { ok: false, reason: 'malformed_header' };
  if (Math.abs(nowMs / 1000 - t) > toleranceSec)
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  for (const secret of live) {
    const expected = await signPayload(secret, t, rawBody);
    if (v1.some((sig) => timingSafeEqual(sig, expected))) return { ok: true };
  }
  return { ok: false, reason: 'no_match' };
}
