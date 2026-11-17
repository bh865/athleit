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

export async function refundPayment(
  a: { paymentId: string; paymentItemId?: string; baseCents?: number; reason?: string },
  d: RefundDeps,
) {
  const plan = await d.prepare(a);
  const results: { refundId: string; amountCents: number; status: string }[] = [];
  for (const r of plan.refunds) {
    try {
      // reverse_transfer: the team gives back its share. The application fee is returned only when the policy
      // refunds the Athleit charge. Stripe never returns its own processing fee.
      const s = await d.stripe.post(
        '/v1/refunds',
        {
          payment_intent: plan.stripe_payment_intent_id,
          amount: r.amount_cents,
          reverse_transfer: true,
          refund_application_fee: r.refund_application_fee,
          metadata: { athleit_refund_id: r.refund_id },
        },
        `athleit:rf:${r.refund_id}`,
      );
      await d.store.attachRefund(r.refund_id, s.id, s.status === 'failed' ? 'failed' : 'pending');
      results.push({ refundId: r.refund_id, amountCents: r.amount_cents, status: s.status });
    } catch (e) {
      await d.store.failRefund(r.refund_id).catch(() => {});
      d.log('error', 'refund.stripe_failed', { refundId: r.refund_id });
      throw e;
    }
  }
  return results;
}
