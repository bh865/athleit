import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  backoffMs,
  buildContent,
  isViewingThread,
  linkFor,
  MAX_ATTEMPTS,
  processBatch,
  type Device,
  type Finish,
  type OutboxRow,
  type Store,
  type Transports,
} from '../../../supabase/functions/_shared/deliver';
import { expoTransport } from '../../../supabase/functions/_shared/transports';

const NOW = new Date('2026-03-10T15:00:00Z');
const row = (over: Partial<OutboxRow> & { id: string }): OutboxRow => ({
  profile_id: 'u1',
  category: 'messages',
  channel: 'push',
  attempts: 0,
  payload: { kind: 'message', thread_id: 't1', message_id: 'm1', title: 'Game day', sender_name: 'Casey' },
  ...over,
});
const device = (over: Partial<Device> = {}): Device => ({
  id: 'd1',
  platform: 'ios',
  token: 'ExponentPushToken[aaaaaaaa]',
  subscription: null,
  active_thread_id: null,
  active_at: null,
  ...over,
});

describe('buildContent (lock-screen content)', () => {
  it('shows only the title and a generic body for sensitive threads, even with a preview', () => {
    const c = buildContent(row({ id: 'a', payload: { kind: 'message', thread_id: 't1', title: 'U12 group', sensitive: true, preview: 'secret words' } }));
    expect(c).toEqual({ title: 'U12 group', body: 'New message', url: '/messages/t1' });
  });
  it('includes the preview only when present and not sensitive', () => {
    expect(buildContent(row({ id: 'a', payload: { kind: 'message', thread_id: 't1', title: 'T', preview: 'hello' } })).body).toBe('hello');
    expect(buildContent(row({ id: 'a' })).body).toBe('New message');
  });
  it('uses announcement and schedule wording and deep links', () => {
    expect(buildContent(row({ id: 'a', category: 'announcements' })).body).toBe('New announcement');
    const s = buildContent(row({ id: 'a', category: 'schedule', payload: { kind: 'schedule', event_id: 'e9', title: 'Practice', change: 'cancelled' } }));
    expect(s).toEqual({ title: 'Practice', body: 'Event cancelled', url: '/events/e9' });
    expect(linkFor({ kind: 'message' })).toBe('/');
  });
});

describe('retry policy', () => {
  it('backs off exponentially with a cap', () => {
    expect([1, 2, 3, 4, 5].map(backoffMs)).toEqual([30_000, 120_000, 480_000, 1_800_000, 1_800_000]);
  });
  it('suppresses push only while the device views that thread', () => {
    const r = row({ id: 'a' });
    expect(isViewingThread(device({ active_thread_id: 't1', active_at: new Date(NOW.getTime() - 5_000).toISOString() }), r, NOW)).toBe(true);
    expect(isViewingThread(device({ active_thread_id: 't1', active_at: new Date(NOW.getTime() - 60_000).toISOString() }), r, NOW)).toBe(false);
    expect(isViewingThread(device({ active_thread_id: 't2', active_at: NOW.toISOString() }), r, NOW)).toBe(false);
  });
});

/** In-memory store with the same claim semantics as the SQL claim_notifications(). */
class MemStore implements Store {
  results = new Map<string, Finish & { attempts: number }>();
  revoked: string[] = [];
  constructor(
    public rows: (OutboxRow & { status: string; deliver_after: Date })[],
    public devs: Record<string, Device[]>,
  ) {}
  async claim(limit: number) {
    const due = this.rows
      .filter((r) => (r.status === 'pending' || r.status === 'failed') && r.deliver_after <= NOW && r.attempts < MAX_ATTEMPTS)
      .slice(0, limit);
    due.forEach((r) => (r.status = 'sending'));
    return due;
  }
  async devices(p: string) {
    return (this.devs[p] ?? []).filter((d) => !this.revoked.includes(d.id));
  }
  async emailFor() {
    return null;
  }
  async revokeDevice(id: string) {
    this.revoked.push(id);
  }
  async finish(id: string, attempts: number, result: Finish) {
    this.results.set(id, { ...result, attempts });
    const r = this.rows.find((x) => x.id === id)!;
    r.attempts = attempts;
    r.status = result.status;
    if (result.status === 'failed' && result.retryAt) r.deliver_after = result.retryAt;
  }
}

describe('processBatch against a mock Expo endpoint', () => {
  let server: Server;
  let url = '';
  let received: { to: string; body: string; title: string }[] = [];
  let respond: (to: string) => object = () => ({ status: 'ok', id: 'x' });

  beforeAll(async () => {
    server = createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        const msgs = JSON.parse(data) as { to: string; body: string; title: string }[];
        received.push(...msgs);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ data: msgs.map((m) => respond(m.to)) }));
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/push`;
  });
  afterAll(() => void server.close());
  beforeEach(() => {
    received = [];
    respond = () => ({ status: 'ok', id: 'x' });
  });

  const transports = (): Transports => ({
    configured: { expo: true, webPush: false, email: false },
    expo: expoTransport({ url }),
    webPush: async () => ({ ok: false, gone: false, status: 0 }),
    email: async () => ({ ok: false, status: 0 }),
  });
  const mk = (id: string, profile: string, over: Partial<OutboxRow> = {}, deliver = NOW) => ({
    ...row({ id, profile_id: profile, ...over }),
    status: 'pending',
    deliver_after: deliver,
  });

  it('delivers exactly once per due eligible recipient; deferred (quiet hours) rows wait; no sender row exists', async () => {
    // The database wrote rows for: coach (due), parent (quiet hours -> deferred), teen (due). No row for the sender or a muted user.
    const store = new MemStore(
      [mk('r-coach', 'coach'), mk('r-parent', 'parent', {}, new Date(NOW.getTime() + 8 * 3600_000)), mk('r-teen', 'teen')],
      {
        coach: [device({ id: 'dc', token: 'ExponentPushToken[coach]' })],
        parent: [device({ id: 'dp', token: 'ExponentPushToken[parent]' })],
        teen: [device({ id: 'dt', token: 'ExponentPushToken[teen]' })],
      },
    );
    const counts = await processBatch(store, transports(), { now: () => NOW });
    expect(counts).toEqual({ sent: 2, skipped: 0, failed: 0 });
    expect(received.map((m) => m.to).sort()).toEqual(['ExponentPushToken[coach]', 'ExponentPushToken[teen]']);
    expect(store.rows.find((r) => r.id === 'r-parent')!.status).toBe('pending');
    // Running again delivers nothing new: rows are never re-sent.
    await processBatch(store, transports(), { now: () => NOW });
    expect(received).toHaveLength(2);
  });

  it('sends one push per device and none to a device viewing the thread', async () => {
    const store = new MemStore([mk('r1', 'u1')], {
      u1: [
        device({ id: 'a', token: 'ExponentPushToken[phone]' }),
        device({ id: 'b', token: 'ExponentPushToken[tablet]', active_thread_id: 't1', active_at: NOW.toISOString() }),
      ],
    });
    await processBatch(store, transports(), { now: () => NOW });
    expect(received.map((m) => m.to)).toEqual(['ExponentPushToken[phone]']);
  });

  it('skips when the only device is viewing the thread', async () => {
    const store = new MemStore([mk('r1', 'u1')], {
      u1: [device({ active_thread_id: 't1', active_at: NOW.toISOString() })],
    });
    await processBatch(store, transports(), { now: () => NOW });
    expect(received).toHaveLength(0);
    expect(store.results.get('r1')).toMatchObject({ status: 'skipped', reason: 'active_thread' });
  });

  it('revokes a dead token and skips; a revoked device never receives anything', async () => {
    respond = () => ({ status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } });
    const store = new MemStore([mk('r1', 'u1')], { u1: [device({ id: 'dead' })] });
    await processBatch(store, transports(), { now: () => NOW });
    expect(store.revoked).toEqual(['dead']);
    expect(store.results.get('r1')).toMatchObject({ status: 'skipped' });
    store.rows.push(mk('r2', 'u1'));
    received = [];
    await processBatch(store, transports(), { now: () => NOW });
    expect(received).toHaveLength(0);
  });

  it('retries transient failures with backoff, then gives up after the maximum attempts', async () => {
    respond = () => ({ status: 'error', message: 'boom', details: { error: 'MessageRateExceeded' } });
    const store = new MemStore([mk('r1', 'u1')], { u1: [device()] });
    await processBatch(store, transports(), { now: () => NOW });
    const first = store.rows[0]!;
    expect(first.status).toBe('failed');
    expect(first.attempts).toBe(1);
    expect(first.deliver_after.getTime()).toBe(NOW.getTime() + 30_000);
    // Not due yet: nothing happens.
    await processBatch(store, transports(), { now: () => NOW });
    expect(first.attempts).toBe(1);
    // Fast-forward through the retries.
    for (let i = 0; i < 10; i++) {
      first.deliver_after = NOW;
      await processBatch(store, transports(), { now: () => NOW });
    }
    expect(first.attempts).toBe(MAX_ATTEMPTS);
    expect(first.status).toBe('failed');
  });

  it('marks rows skipped, not failed, when a channel has no credentials yet', async () => {
    const tr = transports();
    tr.configured.expo = false;
    const store = new MemStore([mk('r1', 'u1')], { u1: [device()] });
    await processBatch(store, tr, { now: () => NOW });
    expect(store.results.get('r1')).toMatchObject({ status: 'skipped', reason: 'channel_not_configured' });
    expect(received).toHaveLength(0);
  });

  it('puts only the allowed text on the wire for a sensitive thread', async () => {
    const store = new MemStore(
      [mk('r1', 'u1', { payload: { kind: 'message', thread_id: 't1', title: 'U12 group', sensitive: true, preview: 'private text' } })],
      { u1: [device()] },
    );
    await processBatch(store, transports(), { now: () => NOW });
    expect(received[0]).toMatchObject({ title: 'U12 group', body: 'New message' });
    expect(JSON.stringify(received)).not.toContain('private text');
  });
});
