// stripe-webhook core: verify the signature on the RAW body, write the event to the ledger first (the unique
// event id makes a replay a no-op), then handle it. Never logs bodies, headers or secrets.
import { handleStripeEvent, type HandlerDeps } from './handlers.ts';
import type { Logger } from './log.ts';
import { verifyStripeSignature } from './stripe.ts';

export interface WebhookDeps extends HandlerDeps {
  secrets: string[];
  log: Logger;
  now?: () => number;
  /** An unknown payment older than this is given up on (it will never appear). */
  giveUpAfterMs?: number;
}

export async function processWebhook(
  rawBody: string,
  signature: string | null,
  d: WebhookDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const now = d.now?.() ?? Date.now();
  const sig = await verifyStripeSignature(rawBody, signature, d.secrets, now);
  if (!sig.ok) {
    d.log('warn', 'webhook.signature_rejected', { reason: sig.reason });
    return { status: 400, body: { error: 'invalid_signature' } };
  }
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'invalid_json' } };
  }
  if (typeof event?.id !== 'string' || typeof event?.type !== 'string')
    return { status: 400, body: { error: 'invalid_event' } };
  // Phase 4 is test mode only: a live event means something is mis-wired. Do not process it.
  if (event.livemode === true) {
    d.log('error', 'webhook.live_event_refused', { id: event.id, type: event.type });
    return { status: 400, body: { error: 'live_mode_refused' } };
  }
  const obj = event.data?.object ?? {};
  const ledger = await d.store.ledgerEvent({
    eventId: event.id,
    type: event.type,
    livemode: false,
    account: event.account ?? null,
    payload: { type: event.type, object: obj.object ?? null, object_id: obj.id ?? null },
  });
  if (ledger === 'duplicate') {
    d.log('info', 'webhook.duplicate', { id: event.id, type: event.type });
    return { status: 200, body: { received: true, duplicate: true } };
  }
  try {
    const outcome = await handleStripeEvent(event, d);
    if (outcome === 'unknown_payment') {
      const age = now - Number(event.created ?? 0) * 1000;
      // Only objects carrying OUR payment id can be a payment we have not recorded yet; anything else is not ours.
      const ours = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(obj?.metadata?.athleit_payment_id ?? ''),
      );
      const giveUp = !ours || age > (d.giveUpAfterMs ?? 3_600_000);
      await d.store.finishEvent(event.id, 'unknown_payment', giveUp);
      d.log('warn', 'webhook.unknown_payment', { id: event.id, type: event.type, giveUp });
      return giveUp
        ? { status: 200, body: { received: true, ignored: true } }
        : { status: 500, body: { error: 'retry' } };
    }
    await d.store.finishEvent(event.id);
    d.log('info', 'webhook.handled', { id: event.id, type: event.type, outcome });
    return { status: 200, body: { received: true, outcome } };
  } catch (e) {
    const msg = String((e as Error).message ?? 'handler_error');
    if (msg.includes('payment_mismatch')) {
      // Stripe's amount/destination disagrees with what we reserved: never apply it, never retry it; a human looks.
      await d.store.finishEvent(event.id, 'payment_mismatch', true).catch(() => {});
      d.log('error', 'webhook.payment_mismatch', { id: event.id, type: event.type });
      return { status: 200, body: { received: true, refused: 'payment_mismatch' } };
    }
    await d.store.finishEvent(event.id, msg).catch(() => {});
    d.log('error', 'webhook.handler_failed', {
      id: event.id,
      type: event.type,
      error: String((e as Error).message ?? e).slice(0, 120),
    });
    return { status: 500, body: { error: 'retry' } };
  }
}
