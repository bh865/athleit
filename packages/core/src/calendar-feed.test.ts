import { describe, expect, it, vi } from 'vitest';

import {
  createRateLimiter,
  handleFeed,
  type FeedDeps,
} from '../../../supabase/functions/_shared/feed';
import type { FeedEvent } from '../../../supabase/functions/_shared/ics';

const TOKEN = 'a'.repeat(64);
const REVOKED = 'b'.repeat(64);
const event: FeedEvent = {
  id: 'e1',
  team_name: 'Falcons',
  type: 'game',
  title: 'Game vs. Hawks',
  starts_at: '2027-06-01T14:00:00Z',
  ends_at: '2027-06-01T16:00:00Z',
  timezone: 'America/New_York',
  location_name: 'Field 3',
  location_address: null,
  location_text: null,
  opponent_name: 'Hawks',
  home_away: 'home',
  notes: null,
  arrive_early_minutes: null,
  status: 'scheduled',
  cancelled_reason: null,
  revision: 1,
  updated_at: '2027-01-05T12:00:00Z',
};
const deps = (over: Partial<FeedDeps> = {}): FeedDeps => ({
  resolveToken: async (t) => (t === TOKEN ? 'profile-1' : null),
  loadEvents: async () => [event],
  ipLimiter: createRateLimiter(100, 60_000),
  tokenLimiter: createRateLimiter(100, 60_000),
  ...over,
});
const get = (path: string, init: RequestInit = {}) =>
  new Request(`https://x.supabase.co/functions/v1/calendar-feed${path}`, init);

describe('calendar feed handler', () => {
  it('serves the ICS for a live token', async () => {
    const res = await handleFeed(get(`/${TOKEN}.ics`), deps());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('private, max-age=300');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    const body = await res.text();
    expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(body).toContain('UID:event-e1@athleit');
    expect(body).not.toContain(TOKEN);
  });

  it('answers 404 identically for unknown, revoked and malformed tokens', async () => {
    const seen = new Set<string>();
    for (const path of [
      `/${'c'.repeat(64)}.ics`,
      `/${REVOKED}.ics`,
      '/short.ics',
      '/',
      `/${TOKEN}.txt`,
      `/${TOKEN.toUpperCase()}.ics`,
    ]) {
      const res = await handleFeed(get(path), deps());
      expect(res.status).toBe(404);
      seen.add(await res.text());
    }
    expect(seen.size).toBe(1);
  });

  it('a revoked token fails even though it once worked', async () => {
    let live = true;
    const d = deps({ resolveToken: async (t) => (t === TOKEN && live ? 'profile-1' : null) });
    expect((await handleFeed(get(`/${TOKEN}.ics`), d)).status).toBe(200);
    live = false;
    expect((await handleFeed(get(`/${TOKEN}.ics`), d)).status).toBe(404);
  });

  it('supports conditional requests (ETag / 304) and HEAD', async () => {
    const first = await handleFeed(get(`/${TOKEN}.ics`), deps());
    const etag = first.headers.get('etag')!;
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    const again = await handleFeed(
      get(`/${TOKEN}.ics`, { headers: { 'if-none-match': etag } }),
      deps(),
    );
    expect(again.status).toBe(304);
    const head = await handleFeed(get(`/${TOKEN}.ics`, { method: 'HEAD' }), deps());
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('only allows GET and HEAD', async () => {
    const res = await handleFeed(get(`/${TOKEN}.ics`, { method: 'POST' }), deps());
    expect(res.status).toBe(405);
  });

  it('rate-limits per IP and per token with Retry-After', async () => {
    const d = deps({
      ipLimiter: createRateLimiter(2, 60_000),
      tokenLimiter: createRateLimiter(100, 60_000),
    });
    const hit = () =>
      handleFeed(
        get(`/${TOKEN}.ics`, { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } }),
        d,
      );
    expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(200);
    const limited = await hit();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    // a different client is unaffected
    expect(
      (
        await handleFeed(
          get(`/${TOKEN}.ics`, { headers: { 'x-forwarded-for': '198.51.100.7' } }),
          d,
        )
      ).status,
    ).toBe(200);

    const t = deps({ tokenLimiter: createRateLimiter(1, 60_000) });
    expect((await handleFeed(get(`/${TOKEN}.ics`), t)).status).toBe(200);
    expect((await handleFeed(get(`/${TOKEN}.ics`), t)).status).toBe(429);
  });

  it('never logs the token, even when the database fails', async () => {
    const logs: string[] = [];
    const spies = (['log', 'error', 'warn', 'info'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...a) => void logs.push(a.join(' '))),
    );
    const res = await handleFeed(
      get(`/${TOKEN}.ics`),
      deps({
        resolveToken: async () => {
          throw new Error(`boom ${TOKEN}`);
        },
      }),
    );
    expect(res.status).toBe(500);
    await handleFeed(
      get(`/${TOKEN}.ics`),
      deps({
        loadEvents: async () => {
          throw new Error('x');
        },
      }),
    );
    spies.forEach((s) => s.mockRestore());
    expect(logs.join('\n')).not.toContain(TOKEN);
    expect(await res.text()).not.toContain(TOKEN);
  });

  it('the rate limiter resets after its window', () => {
    const rl = createRateLimiter(1, 1000);
    expect(rl.check('k', 0).ok).toBe(true);
    expect(rl.check('k', 500).ok).toBe(false);
    expect(rl.check('k', 1500).ok).toBe(true);
  });
});
