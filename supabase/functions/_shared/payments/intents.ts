// create-payment-intent core. The ONLY client input is a set of request ids. The amount, application fee,
// description and metadata all come from rows the database computed (svc_reserve_payment).
// DIRECT charge: the intent is created ON the team/club's connected account (Stripe-Account header), whose account pays
// Stripe's fee. application_fee_amount is only the Athleit charge. The apps must open the payment sheet for that account.
import type { Logger } from './log.ts';
import { AUTOPAY_CONSENT_VERSION, type CreatePaymentIntentInput } from './schemas.ts';
import type { ReserveResult, Store } from './store.ts';
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
  /** The connected account the intent lives on: the Payment Element / PaymentSheet must be initialised with it. */
  stripeAccountId: string;
}

export interface ClientMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** Reserve according to the input shape: whole requests, installments of an existing plan, or the start of a plan. */
async function reserve(
  userId: string,
  input: CreatePaymentIntentInput,
  d: IntentDeps,
  meta: ClientMeta,
): Promise<ReserveResult> {
  if ('requestIds' in input) return d.store.reservePayment(userId, input.requestIds);
  if ('installmentIds' in input) return d.store.reserveInstallments(userId, input.installmentIds);
  return d.store.reservePlan({
    userId,
    requestId: input.plan.requestId,
    size: input.plan.size,
    autopay: input.plan.autopay,
    consentVersion: AUTOPAY_CONSENT_VERSION,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });
}

/** The Customer lives on the connected account (direct charges); created once per household and account. */
async function ensureCustomer(userId: string, r: ReserveResult, d: IntentDeps): Promise<string> {
  const household = r.household_id!;
  const account = r.connected_account_id!;
  const existing = await d.store.getCustomer(household, account);
  if (existing) return existing;
  const c = await d.stripe.post(
    '/v1/customers',
    { metadata: { athleit_household_id: household } }, // ids only: no names or emails
    `athleit:cus:${household}:${account}`,
    r.stripe_account_id,
  );
  await d.store.saveCustomer({
    householdId: household,
    connectedAccountId: account,
    customer: c.id,
    userId,
  });
  return c.id;
}

export async function createPaymentIntent(
  userId: string,
  input: CreatePaymentIntentInput | string[],
  d: IntentDeps,
  meta: ClientMeta = {},
): Promise<IntentResult> {
  // A bare id list is the original whole-request form.
  const r = await reserve(userId, Array.isArray(input) ? { requestIds: input } : input, d, meta);
  let pi: StripeObject | null = null;

  if (r.stripe_payment_intent_id) {
    // An open payment already exists for this exact set: reuse its intent instead of creating a second.
    pi = await d.stripe.get(
      `/v1/payment_intents/${r.stripe_payment_intent_id}`,
      undefined,
      r.stripe_account_id,
    );
    if (pi.status === 'succeeded') {
      return {
        paymentId: r.payment_id,
        clientSecret: null,
        status: 'succeeded',
        totalCents: r.total_cents,
        reused: true,
        stripeAccountId: r.stripe_account_id,
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
      // Omitted when zero (Stripe rejects a zero fee on some account types).
      ...(r.application_fee_cents ? { application_fee_amount: r.application_fee_cents } : {}),
      description: r.description,
      automatic_payment_methods: { enabled: true },
      // Ids only: no names, nothing about the child.
      metadata: {
        athleit_payment_id: r.payment_id,
        request_set_key: r.request_set_key,
        display_ids: (r.display_ids ?? []).join(','),
      },
    };
    if (r.setup_future_usage) {
      // Autopay: save the card for off-session use on a Customer of the connected account.
      params.customer = await ensureCustomer(userId, r, d);
      params.setup_future_usage = 'off_session';
    }
    try {
      pi = await d.stripe.post(
        '/v1/payment_intents',
        params,
        `athleit:pi:${r.payment_id}`,
        r.stripe_account_id,
      );
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
    stripeAccountId: r.stripe_account_id,
  };
}
