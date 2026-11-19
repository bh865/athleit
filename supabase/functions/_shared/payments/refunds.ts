// refund-payment core. prepare_refund (as the signed-in admin) reserves refund rows and returns the amounts
// the refund policy allows; this module only sends those to Stripe. Final status is set by the webhook.
import type { Logger } from './log.ts';
import type { Store } from './store.ts';
import type { StripeApi } from './stripe.ts';

export interface RefundDeps {
  store: Store;
  stripe: Pick<StripeApi, 'get' | 'post'>;
  log: Logger;
  /** public.prepare_refund as the signed-in user (checks issuer-admin rights and refund policy). */
  prepare: (a: {
    paymentId: string;
    paymentItemId?: string;
    baseCents?: number;
    reason?: string;
  }) => Promise<{
    payment_id: string;
    stripe_payment_intent_id: string;
    stripe_account_id: string;
    refunds: { refund_id: string; amount_cents: number; refund_application_fee: boolean }[];
  }>;
}

type RefundPlan = Awaited<ReturnType<RefundDeps['prepare']>>;

export async function refundPayment(
  a: { paymentId: string; paymentItemId?: string; baseCents?: number; reason?: string },
  d: RefundDeps,
) {
  return sendRefunds(await d.prepare(a), d);
}

/**
 * Refund an amount of a plan request: the database allocates it to the most recently paid installment first, then backwards
 * (prepare_request_refund), one Stripe refund per payment touched. Sequential on purpose: if one fails, the earlier ones stand
 * and the error says so; nothing already sent is ever retried under a new key.
 */
export async function refundRequest(
  a: { requestId: string; baseCents?: number; reason?: string },
  d: Pick<RefundDeps, 'store' | 'stripe' | 'log'> & {
    prepareRequest: (a: {
      requestId: string;
      baseCents?: number;
      reason?: string;
    }) => Promise<RefundPlan[]>;
  },
) {
  const plans = await d.prepareRequest(a);
  const results: { refundId: string; amountCents: number; status: string }[] = [];
  for (const plan of plans) results.push(...(await sendRefunds(plan, d)));
  return results;
}

async function sendRefunds(plan: RefundPlan, d: Pick<RefundDeps, 'store' | 'stripe' | 'log'>) {
  const results: { refundId: string; amountCents: number; status: string }[] = [];
  for (const r of plan.refunds) {
    let sr;
    try {
      // Direct charge: the refund is issued ON the connected account (it is debited there). The application fee is
      // returned only when the policy refunds the Athleit charge. Stripe never returns its own processing fee.
      sr = await d.stripe.post(
        '/v1/refunds',
        {
          payment_intent: plan.stripe_payment_intent_id,
          amount: r.amount_cents,
          refund_application_fee: r.refund_application_fee,
          metadata: { athleit_refund_id: r.refund_id },
        },
        `athleit:rf:${r.refund_id}`,
        plan.stripe_account_id,
      );
    } catch (e) {
      await d.store.failRefund(r.refund_id).catch(() => {});
      d.log('error', 'refund.stripe_failed', { refundId: r.refund_id });
      throw e;
    }
    // Stripe accepted it: from here on never mark it failed. The webhook adopts the row by metadata even if this fails.
    await d.store
      .attachRefund(r.refund_id, sr.id, sr.status === 'failed' ? 'failed' : 'pending')
      .catch(() => {
        d.log('warn', 'refund.attach_deferred', { refundId: r.refund_id });
      });
    results.push({ refundId: r.refund_id, amountCents: r.amount_cents, status: sr.status });
  }
  return results;
}
