// Delivers notification_outbox rows (push via Expo / Web Push, email via Resend).
// Triggered by the database through pg_net (statement-level trigger on insert) and by a pg_cron
// sweep every minute. The caller supplies nothing: the function only works through the queue, so
// invoking it repeatedly is harmless (idempotent claim, leases, backoff).
//
// Secrets (Edge Function secrets, never in the repo): SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are provided by the platform. Optional per channel:
//   EXPO_ACCESS_TOKEN                      Expo push (works without it; it only raises limits)
//   VAPID_PRIVATE_JWK, VAPID_SUBJECT       Web Push (private key as JWK JSON, subject like mailto:ops@example.com)
//   RESEND_API_KEY, EMAIL_FROM, APP_URL    transactional email
// A channel without its secrets marks rows 'skipped' (channel_not_configured), never 'failed'.
import { buildPushHTTPRequest } from 'npm:@pushforge/builder@2.0.4';
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

import {
  processBatch,
  type Device,
  type Finish,
  type OutboxRow,
  type Store,
  type Transports,
} from '../_shared/deliver.ts';
import { expoTransport, resendTransport } from '../_shared/transports.ts';

const env = (k: string) => Deno.env.get(k) || undefined;
const db = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const store: Store = {
  async claim(limit) {
    const { data, error } = await db.rpc('claim_notifications', { p_limit: limit });
    if (error) throw new Error(`claim_failed:${error.code ?? ''}`);
    return (data ?? []) as OutboxRow[];
  },
  async devices(profileId) {
    const { data, error } = await db
      .from('push_devices')
      .select('id, platform, token, subscription, active_thread_id, active_at')
      .eq('profile_id', profileId)
      .is('revoked_at', null);
    if (error) throw new Error('devices_failed');
    return (data ?? []) as Device[];
  },
  async emailFor(profileId) {
    const { data } = await db.auth.admin.getUserById(profileId);
    return data.user?.email ?? null;
  },
  async revokeDevice(id) {
    await db.from('push_devices').update({ revoked_at: new Date().toISOString() }).eq('id', id);
  },
  async finish(rowId, attempts, r: Finish) {
    const base = { attempts };
    const patch =
      r.status === 'sent'
        ? { ...base, status: 'sent', sent_at: new Date().toISOString(), last_error: null }
        : r.status === 'skipped'
          ? { ...base, status: 'skipped', last_error: r.reason }
          : {
              ...base,
              status: 'failed',
              last_error: r.error,
              // null retryAt = out of attempts: park far in the future (the claim also checks attempts < 5).
              deliver_after: (r.retryAt ?? new Date(Date.now() + 365 * 86_400_000)).toISOString(),
            };
    await db.from('notification_outbox').update(patch).eq('id', rowId);
  },
};

const vapid = env('VAPID_PRIVATE_JWK');
const resendKey = env('RESEND_API_KEY');
const from = env('EMAIL_FROM');
const appUrl = env('APP_URL') ?? '';

const transports: Transports = {
  configured: { expo: true, webPush: Boolean(vapid), email: Boolean(resendKey && from && appUrl) },
  expo: expoTransport({ accessToken: env('EXPO_ACCESS_TOKEN') }),
  async webPush(device, content) {
    const sub = device.subscription;
    if (!vapid || !sub) return { ok: false, gone: true, status: 0 };
    const { endpoint, headers, body } = await buildPushHTTPRequest({
      privateJWK: JSON.parse(vapid),
      subscription: { endpoint: device.token, keys: sub },
      message: {
        payload: { title: content.title, body: content.body, url: content.url },
        adminContact: env('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
        options: { ttl: 3600, urgency: 'high' },
      },
    });
    const res = await fetch(endpoint, { method: 'POST', headers, body });
    return {
      ok: res.status === 201 || res.status === 200,
      gone: res.status === 404 || res.status === 410,
      status: res.status,
    };
  },
  email:
    resendKey && from
      ? resendTransport({ apiKey: resendKey, from, appUrl })
      : async () => ({ ok: false, status: 0 }),
};

Deno.serve(async () => {
  try {
    const counts = await processBatch(store, transports);
    // Counts only: never rows, tokens, addresses or message text.
    console.log(JSON.stringify({ delivered: counts }));
    return new Response(JSON.stringify(counts), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    console.error('deliver_failed', e instanceof Error ? e.message : 'error');
    return new Response(JSON.stringify({ error: 'deliver_failed' }), { status: 500 });
  }
});
