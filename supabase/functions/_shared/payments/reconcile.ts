// reconcile-payments core (safety net, every 10 minutes via pg_cron): re-fetch from Stripe whatever the
// database thinks is unfinished and repair it through the SAME handlers the webhook uses.
import {
  applyAccount,
  applyPaymentIntent,
  handleStripeEvent,
  type HandlerDeps,
} from './handlers.ts';
import type { Logger } from './log.ts';

export interface ReconcileDeps extends HandlerDeps {
  log: Logger;
}

export async function reconcile(d: ReconcileDeps) {
  const c = await d.store.reconcileCandidates();
  const out = { payments: 0, abandoned: 0, voided: 0, fees: 0, accounts: 0, events: 0, errors: 0 };
  const guard = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      out.errors++;
      d.log('error', 'reconcile.item_failed', {
        label,
        error: String((e as Error).message).slice(0, 80),
      });
    }
  };

  for (const p of c.open_payments)
    await guard('open_payment', async () => {
      let pi = await d.stripe.get(`/v1/payment_intents/${p.pi}`);
      if (
        p.abandoned &&
        ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(pi.status)
      ) {
        pi = await d.stripe.post(
          `/v1/payment_intents/${p.pi}/cancel`,
          {},
          `athleit:cancel:${p.id}`,
        );
        out.abandoned++;
      }
      await applyPaymentIntent(pi, d);
      out.payments++;
    });

  // Canceled here: make sure Stripe cannot still take the money (or record it if it already did).
  for (const p of c.canceled_payments)
    await guard('canceled_payment', async () => {
      let pi = await d.stripe.get(`/v1/payment_intents/${p.pi}`);
      if (pi.status === 'succeeded') await applyPaymentIntent(pi, d);
      else if (pi.status !== 'canceled') {
        pi = await d.stripe.post(
          `/v1/payment_intents/${p.pi}/cancel`,
          {},
          `athleit:cancel:${p.id}`,
        );
        out.voided++;
      }
    });

  for (const p of c.missing_fee)
    await guard('missing_fee', async () => {
      await applyPaymentIntent(await d.stripe.get(`/v1/payment_intents/${p.pi}`), d);
      out.fees++;
    });

  for (const a of c.accounts)
    await guard('account', async () => {
      await applyAccount(await d.stripe.get(`/v1/accounts/${a}`), d);
      out.accounts++;
    });

  for (const id of c.stuck_events)
    await guard('event', async () => {
      const ev = await d.stripe.get(`/v1/events/${id}`);
      if (ev.livemode) return;
      const outcome = await handleStripeEvent(ev, d);
      if (outcome !== 'unknown_payment') await d.store.finishEvent(id);
      out.events++;
    });

  await d.store.cleanupRateLimits().catch(() => {});
  d.log('info', 'reconcile.done', out);
  return out;
}
