// The installment charger (pg_cron through the charge-installments function). For each installment the database says is due
// and covered by autopay with a saved card, it reserves a payment (marked off-session) and creates a Stripe PaymentIntent on the
// connected account, confirmed off-session with the saved card. A declined card or an authentication-required response is
// recorded as a failed attempt (dunning lives in the database): it never cancels the request or the player.
//
// Idempotency: the Stripe key is derived from the installment id AND the id of the payment reserved for this attempt. A crashed
// run that is retried reuses the same open payment, so it makes the same PaymentIntent and never a second charge; the next
// attempt after a failure (or a staff retry) has a new payment and so a new key. (An attempt NUMBER is not enough: Stripe
// replays a remembered decline for 24 hours, and a staff retry lowers the attempt count.) the database refuses a second live payment for the installment (unique index).
import type { Logger } from './log.ts';
import type { Store } from './store.ts';
import { StripeError, type StripeApi } from './stripe.ts';

export interface ChargeDeps {
  store: Store;
  stripe: Pick<StripeApi, 'get' | 'post'>;
  log: Logger;
}
export interface ChargeSummary {
  claimed: number;
  charged: number;
  failed: number;
  skipped: number;
  errors: number;
}

export async function chargeDueInstallments(
  d: ChargeDeps,
  opts: { now?: string | null; limit?: number } = {},
): Promise<ChargeSummary> {
  const out: ChargeSummary = { claimed: 0, charged: 0, failed: 0, skipped: 0, errors: 0 };
  const due = await d.store.claimDueInstallments(opts.now ?? null, opts.limit ?? 25);
  out.claimed = due.length;
  for (const item of due) {
    try {
      const r = await d.store.reserveInstallments(item.payer, [item.installment_id], true);
      if (r.stripe_payment_intent_id) {
        out.skipped++; // a charge for this attempt already exists: the webhook or reconcile settles it
        continue;
      }
      try {
        const pi = await d.stripe.post(
          '/v1/payment_intents',
          {
            amount: r.total_cents,
            currency: 'usd',
            ...(r.application_fee_cents ? { application_fee_amount: r.application_fee_cents } : {}),
            description: r.description,
            customer: item.customer,
            payment_method: item.payment_method,
            off_session: true,
            confirm: true,
            metadata: {
              athleit_payment_id: r.payment_id,
              request_set_key: r.request_set_key,
              display_ids: (r.display_ids ?? []).join(','),
            },
          },
          `athleit:inst:${item.installment_id}:${r.payment_id}`,
          r.stripe_account_id,
        );
        await d.store.attachPaymentIntent(r.payment_id, pi.id);
        out.charged++;
        d.log('info', 'installment.charged', { paymentId: r.payment_id, status: pi.status });
      } catch (e) {
        if (e instanceof StripeError && e.type === 'card_error') {
          // Declined or authentication required. The intent (if Stripe made one) is left to reconcile to void.
          await d.store.installmentChargeFailed(r.payment_id);
          out.failed++;
          d.log('warn', 'installment.charge_failed', { paymentId: r.payment_id, code: e.code });
        } else {
          await d.store.releasePayment(r.payment_id).catch(() => {});
          throw e;
        }
      }
    } catch (e) {
      out.errors++;
      d.log('error', 'installment.error', {
        reason: String((e as Error)?.message ?? e).slice(0, 60),
      });
    }
  }
  return out;
}

/**
 * Warn households whose saved card expires before an autopay installment is due (7 days ahead). The expiry is read from Stripe
 * (we store ids only); a card that cannot be read is skipped and tried again on the next run.
 */
export async function warnExpiringCards(
  d: ChargeDeps,
  opts: { now?: string | null } = {},
): Promise<{ checked: number; warned: number }> {
  const out = { checked: 0, warned: 0 };
  for (const c of await d.store.cardsToCheck(opts.now ?? null)) {
    try {
      const pm = await d.stripe.get(
        `/v1/payment_methods/${c.payment_method}`,
        undefined,
        c.stripe_account_id,
      );
      const card = pm.card as { exp_month?: number; exp_year?: number } | undefined;
      out.checked++;
      if (!card?.exp_month || !card.exp_year) continue;
      // A card is valid through the END of its expiry month (UTC).
      const validThrough = Date.UTC(card.exp_year, card.exp_month, 1);
      if (validThrough <= Date.parse(c.due_at)) {
        await d.store.warnCardExpiring(c.installment_id);
        out.warned++;
      }
    } catch (e) {
      d.log('warn', 'card.check_failed', {
        reason: String((e as Error)?.message ?? e).slice(0, 60),
      });
    }
  }
  return out;
}
