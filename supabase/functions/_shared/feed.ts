// Request handling for the calendar feed, separated from the Deno entry point so it can be
// tested with fakes. The token is the only credential: it identifies the person and is never
// logged, never echoed, and unknown / revoked / malformed tokens are indistinguishable (404).
import { buildCalendar, type FeedEvent } from './ics.ts';

export interface RateLimiter {
  check(key: string, now?: number): { ok: boolean; retryAfter: number };
}

/** Fixed-window counter per key (per isolate, best effort: limits bursts from one client). */
export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, { n: number; reset: number }>();
  return {
    check(key, now = Date.now()) {
      const cur = hits.get(key);
      if (!cur || cur.reset <= now) {
        hits.set(key, { n: 1, reset: now + windowMs });
        if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
        return { ok: true, retryAfter: 0 };
      }
      cur.n += 1;
      return cur.n <= limit
        ? { ok: true, retryAfter: 0 }
        : { ok: false, retryAfter: Math.ceil((cur.reset - now) / 1000) };
    },
  };
}

export interface FeedDeps {
  /** Hash lookup: the owner of a live token, or null (unknown, revoked). Records last_used_at. */
  resolveToken(token: string): Promise<string | null>;
  loadEvents(profileId: string): Promise<FeedEvent[]>;
  ipLimiter: RateLimiter;
  tokenLimiter: RateLimiter;
  appUrl?: string | undefined;
}

const TOKEN_RE = /\/([0-9a-f]{64})(?:\.ics)?\/?$/;
const HEADERS = {
  'content-type': 'text/calendar; charset=utf-8',
  'content-disposition': 'inline; filename="athleit.ics"',
  'cache-control': 'private, max-age=300',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
} as const;

const plain = (status: number, extra: Record<string, string> = {}) =>
  new Response(status === 404 ? 'Not found' : status === 429 ? 'Too many requests' : 'Error', {
    status,
    headers: {
      'content-type': 'text/plain',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      ...extra,
    },
  });

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handleFeed(req: Request, deps: FeedDeps): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return plain(405, { allow: 'GET, HEAD' });
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'unknown';
  const ipCheck = deps.ipLimiter.check(`ip:${ip}`);
  if (!ipCheck.ok) return plain(429, { 'retry-after': String(ipCheck.retryAfter) });

  const match = TOKEN_RE.exec(new URL(req.url).pathname);
  if (!match) return plain(404);
  const token = match[1]!;
  // Rate-limit per token without keeping the token: key on its hash.
  const tokenCheck = deps.tokenLimiter.check(`t:${(await sha256Hex(token)).slice(0, 16)}`);
  if (!tokenCheck.ok) return plain(429, { 'retry-after': String(tokenCheck.retryAfter) });

  let profile: string | null;
  try {
    profile = await deps.resolveToken(token);
  } catch {
    console.error('feed_resolve_failed');
    return plain(500);
  }
  if (!profile) return plain(404);

  let events: FeedEvent[];
  try {
    events = await deps.loadEvents(profile);
  } catch {
    console.error('feed_load_failed');
    return plain(500);
  }
  const body = buildCalendar(events, { appUrl: deps.appUrl });
  const etag = `"${(await sha256Hex(body)).slice(0, 32)}"`;
  if (req.headers.get('if-none-match') === etag)
    return new Response(null, { status: 304, headers: { ...HEADERS, etag } });
  return new Response(req.method === 'HEAD' ? null : body, {
    status: 200,
    headers: { ...HEADERS, etag },
  });
}
