/**
 * Notification delivery core. Pure TypeScript (no Deno, Node or Supabase imports) so the same
 * code runs in the Edge Function and in unit/integration tests with fakes and a mock push server.
 *
 * Guarantees:
 *  - rows are claimed atomically by the Store (FOR UPDATE SKIP LOCKED), so two workers never
 *    send the same row;
 *  - every row ends in exactly one terminal-or-retry state: sent, skipped, or failed with
 *    backoff (up to MAX_ATTEMPTS);
 *  - revoked or dead devices are skipped and, when the provider says the token is gone, revoked;
 *  - nothing here logs payload bodies, tokens or email addresses.
 */

export const MAX_ATTEMPTS = 5;
export const ACTIVE_THREAD_WINDOW_MS = 30_000;
export const EXPO_BATCH = 100;

export interface OutboxRow {
  id: string;
  profile_id: string;
  category:
    | 'messages'
    | 'announcements'
    | 'schedule'
    | 'payments'
    | 'registration'
    | 'billing'
    | 'payments_reserved';
  channel: 'push' | 'email';
  payload: NotificationPayload;
  attempts: number;
}

export interface NotificationPayload {
  kind: 'message' | 'schedule' | 'payment' | 'registration' | 'registration_email' | 'billing';
  title?: string;
  sender_name?: string | null;
  preview?: string;
  sensitive?: boolean;
  thread_id?: string;
  message_id?: string;
  event_id?: string;
  team_id?: string;
  audience?: 'staff' | 'family' | 'admin';
  registration_event_id?: string;
  change?: string;
  /** Ready-to-show body for schedule notifications ("12 practices added"); never contains a child's name. */
  body?: string;
  count?: number;
  thread_type?: string;
}

export interface Device {
  id: string;
  platform: 'ios' | 'android' | 'web';
  token: string;
  subscription: { p256dh: string; auth: string } | null;
  active_thread_id: string | null;
  active_at: string | null;
}

export type Finish =
  | { status: 'sent' }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string; retryAt: Date | null };

export interface Store {
  /** Atomically move up to `limit` due rows to 'sending' and return them. */
  claim(limit: number): Promise<OutboxRow[]>;
  devices(profileId: string): Promise<Device[]>;
  emailFor(profileId: string): Promise<string | null>;
  revokeDevice(deviceId: string): Promise<void>;
  finish(rowId: string, attempts: number, result: Finish): Promise<void>;
}

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: { url: string; thread_id?: string; message_id?: string };
  sound: 'default';
  channelId: string;
  priority: 'high';
}
export type ExpoTicket =
  | { status: 'ok'; id?: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

export interface WebPushResult {
  ok: boolean;
  /** 404/410: the browser dropped the subscription. */
  gone: boolean;
  status: number;
}
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Transports {
  configured: { expo: boolean; webPush: boolean; email: boolean };
  expo(messages: ExpoMessage[]): Promise<ExpoTicket[]>;
  webPush(
    device: Device,
    body: { title: string; body: string; url: string },
  ): Promise<WebPushResult>;
  email(msg: EmailMessage): Promise<{ ok: boolean; status: number }>;
}

// Payload building --------------------------------------------------------------------------------

/** Deep link path, identical on web and in the mobile app (expo-router). */
export function linkFor(p: NotificationPayload): string {
  if (p.thread_id) return `/messages/${p.thread_id}`;
  if (p.event_id) return `/events/${p.event_id}`;
  if (p.registration_event_id) return `/manage/registration/${p.registration_event_id}`;
  // Billing: admins land on the team's billing page, coaches and managers on the team (they only see status there).
  if (p.kind === 'billing' && p.team_id)
    return p.audience === 'staff' ? `/teams/${p.team_id}` : `/teams/${p.team_id}/billing`;
  if (p.kind === 'registration' && p.team_id)
    return p.audience === 'staff' ? `/teams/${p.team_id}/waivers` : '/registrations';
  return '/';
}

/**
 * What appears on the lock screen. Sensitive threads (any minor) and recipients without the
 * preview setting see only the thread title or sender, never message text.
 */
export function buildContent(row: OutboxRow): { title: string; body: string; url: string } {
  const p = row.payload;
  const url = linkFor(p);
  if (row.category === 'schedule') {
    const change: Record<string, string> = {
      created: 'New event',
      time_changed: 'Time changed',
      location_changed: 'Location changed',
      cancelled: 'Event cancelled',
    };
    return {
      title: p.title || 'Schedule update',
      body: p.body || change[p.change ?? ''] || 'Schedule update',
      url,
    };
  }
  if (row.category === 'registration') {
    return { title: p.title || 'Registration', body: p.body || 'Registration update', url };
  }
  if (row.category === 'billing') {
    return { title: p.title || 'Team billing', body: p.body || 'Team billing update', url };
  }
  const title = p.title || p.sender_name || 'New message';
  const generic = row.category === 'announcements' ? 'New announcement' : 'New message';
  const showText = !p.sensitive && typeof p.preview === 'string' && p.preview.length > 0;
  return { title, body: showText ? p.preview! : generic, url };
}

export function toExpoMessage(
  device: Device,
  c: { title: string; body: string; url: string },
  row: OutboxRow,
): ExpoMessage {
  return {
    to: device.token,
    title: c.title,
    body: c.body,
    data: {
      url: c.url,
      ...(row.payload.thread_id ? { thread_id: row.payload.thread_id } : {}),
      ...(row.payload.message_id ? { message_id: row.payload.message_id } : {}),
    },
    sound: 'default',
    channelId: row.category === 'schedule' ? 'schedule' : 'messages',
    priority: 'high',
  };
}

/** Exponential backoff with a cap: 30s, 2m, 8m, 30m, then give up (MAX_ATTEMPTS). */
export const backoffMs = (attempts: number) =>
  Math.min(30 * 60_000, 30_000 * 4 ** Math.max(0, attempts - 1));

/** The device is open on this very thread right now: do not buzz it. */
export function isViewingThread(device: Device, row: OutboxRow, now: Date): boolean {
  return (
    row.payload.thread_id !== undefined &&
    device.active_thread_id === row.payload.thread_id &&
    device.active_at !== null &&
    now.getTime() - new Date(device.active_at).getTime() < ACTIVE_THREAD_WINDOW_MS
  );
}

// Delivery ----------------------------------------------------------------------------------------

async function deliverPush(
  row: OutboxRow,
  store: Store,
  tr: Transports,
  now: Date,
): Promise<Finish> {
  const all = await store.devices(row.profile_id);
  if (all.length === 0) return { status: 'skipped', reason: 'no_active_device' };
  const devices = all.filter((d) => !isViewingThread(d, row, now));
  if (devices.length === 0) return { status: 'skipped', reason: 'active_thread' };
  const content = buildContent(row);

  let delivered = 0;
  let transient = 0;
  let configuredAny = false;

  const mobile = devices.filter((d) => d.platform !== 'web');
  if (mobile.length > 0 && tr.configured.expo) {
    configuredAny = true;
    for (let i = 0; i < mobile.length; i += EXPO_BATCH) {
      const chunk = mobile.slice(i, i + EXPO_BATCH);
      let tickets: ExpoTicket[];
      try {
        tickets = await tr.expo(chunk.map((d) => toExpoMessage(d, content, row)));
      } catch {
        transient += chunk.length;
        continue;
      }
      for (let k = 0; k < chunk.length; k++) {
        const t = tickets[k];
        if (t?.status === 'ok') delivered++;
        else if (t?.status === 'error' && t.details?.error === 'DeviceNotRegistered') {
          await store.revokeDevice(chunk[k]!.id);
        } else transient++;
      }
    }
  }
  const web = devices.filter((d) => d.platform === 'web');
  if (web.length > 0 && tr.configured.webPush) {
    configuredAny = true;
    for (const d of web) {
      try {
        const r = await tr.webPush(d, content);
        if (r.ok) delivered++;
        else if (r.gone) await store.revokeDevice(d.id);
        else transient++;
      } catch {
        transient++;
      }
    }
  }
  if (delivered > 0) return { status: 'sent' };
  if (!configuredAny) return { status: 'skipped', reason: 'channel_not_configured' };
  if (transient > 0) return { status: 'failed', error: 'push_provider_error', retryAt: null };
  return { status: 'skipped', reason: 'no_active_device' }; // every token was dead and has been revoked
}

async function deliverEmail(row: OutboxRow, store: Store, tr: Transports): Promise<Finish> {
  if (!tr.configured.email) return { status: 'skipped', reason: 'channel_not_configured' };
  const to = await store.emailFor(row.profile_id);
  if (!to) return { status: 'skipped', reason: 'no_email' };
  const c = buildContent(row);
  const r = await tr.email({
    to,
    subject: c.title,
    text: `${c.body}\n\nOpen: {{APP_URL}}${c.url}`,
  });
  return r.ok
    ? { status: 'sent' }
    : { status: 'failed', error: `email_http_${r.status}`, retryAt: null };
}

/** Deliver one claimed row and record exactly one outcome. */
export async function processRow(row: OutboxRow, store: Store, tr: Transports, now = new Date()) {
  const attempts = row.attempts + 1;
  let result: Finish;
  try {
    result =
      row.channel === 'push'
        ? await deliverPush(row, store, tr, now)
        : await deliverEmail(row, store, tr);
  } catch (e) {
    result = { status: 'failed', error: e instanceof Error ? e.name : 'error', retryAt: null };
  }
  if (result.status === 'failed') {
    result = {
      ...result,
      retryAt: attempts >= MAX_ATTEMPTS ? null : new Date(now.getTime() + backoffMs(attempts)),
    };
  }
  await store.finish(row.id, attempts, result);
  return result;
}

/** Claim and deliver until the queue is drained (bounded). */
export async function processBatch(
  store: Store,
  tr: Transports,
  opts: { batch?: number; maxRows?: number; now?: () => Date } = {},
) {
  const batch = opts.batch ?? 50;
  const maxRows = opts.maxRows ?? 500;
  const counts = { sent: 0, skipped: 0, failed: 0 };
  let seen = 0;
  while (seen < maxRows) {
    const rows = await store.claim(batch);
    if (rows.length === 0) break;
    seen += rows.length;
    for (const row of rows) counts[(await processRow(row, store, tr, opts.now?.())).status]++;
    if (rows.length < batch) break;
  }
  return counts;
}
