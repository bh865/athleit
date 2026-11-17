// create-payment-intent core. The ONLY client input is a set of request ids. The amount, application fee,
// destination, description and metadata all come from rows the database computed (svc_reserve_payment).
import type { Logger } from './log.ts';
import type { Store } from './store.ts';
import type { StripeApi, StripeObject } from './stripe.ts';

export interface IntentDeps {
  store: Store;
  stripe: Pick<StripeApi, 'get' | 'post'>;
  log: Logger;
}
export interface IntentResult {
  paymentId: string;
  clientSecret: string | null;
  status: string;
  totalCents: number;
  reused: boolean;
}

export async function createPaymentIntent(
  userId: string,
  requestIds: string[],
  d: IntentDeps,
): Promise<IntentResult> {
  const r = await d.store.reservePayment(userId, requestIds);
  let pi: StripeObject | null = null;

  if (r.stripe_payment_intent_id) {
    // An open payment already exists for this exact set: reuse its intent instead of creating a second.
    pi = await d.stripe.get(`/v1/payment_intents/${r.stripe_payment_intent_id}`);
    if (pi.status === 'succeeded') {
      return {
        paymentId: r.payment_id,
        clientSecret: null,
        status: 'succeeded',
        totalCents: r.total_cents,
        reused: true,
      };
    }
    if (pi.status === 'canceled') {
      await d.store.paymentStatus({ pi: pi.id, status: 'canceled', paymentId: r.payment_id });
      throw new Error('request_not_payable'); // the client simply tries again and reserves a fresh payment
    }
  } else {
    // Amounts below come from the database reservation, never from the caller.
    const params: Record<string, unknown> = {
      amount: r.total_cents,
      currency: 'usd',
      application_fee_amount: r.application_fee_cents,
      transfer_data: { destination: r.stripe_account_id },
      on_behalf_of: r.stripe_account_id,
      description: r.description,
      automatic_payment_methods: { enabled: true },
      // Ids only: no names, nothing about the child.
      metadata: {
        athleit_payment_id: r.payment_id,
        request_set_key: r.request_set_key,
        display_ids: (r.display_ids ?? []).join(','),
      },
    };
    try {
      pi = await d.stripe.post('/v1/payment_intents', params, `athleit:pi:${r.payment_id}`);
    } catch (e) {
      await d.store.releasePayment(r.payment_id).catch(() => {});
      d.log('error', 'intent.create_failed', { paymentId: r.payment_id });
      throw e;
    }
    await d.store.attachPaymentIntent(r.payment_id, pi.id);
  }
  d.log('info', 'intent.ready', { paymentId: r.payment_id, reused: r.reused, status: pi?.status });
  return {
    paymentId: r.payment_id,
    clientSecret: pi?.client_secret ?? null,
    status: pi?.status ?? r.status,
    totalCents: r.total_cents,
    reused: r.reused,
  };
}
