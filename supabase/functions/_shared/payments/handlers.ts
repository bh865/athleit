// Maps Stripe events (and the same state fetched during reconcile) onto the idempotent database handlers.
// The database converges regardless of order or repetition; nothing here decides money.
import type { StripeApi, StripeObject } from './stripe.ts';
import type { Store } from './store.ts';

export interface HandlerDeps {
  store: Store;
  stripe: Pick<StripeApi, 'get' | 'post'>;
}
export type Outcome = 'applied' | 'noop' | 'ignored' | 'unknown_payment' | 'unknown_account';

const metaPayment = (o: StripeObject): string | undefined => {
  const v = o?.metadata?.athleit_payment_id;
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined;
};
const idOf = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : (v as StripeObject | null)?.id;

/** The actual Stripe processing fee of a charge (balance transaction), or null if it cannot be read yet. */
export async function actualStripeFee(
  stripe: HandlerDeps['stripe'],
  chargeId: string | undefined,
): Promise<number | null> {
  if (!chargeId) return null;
  try {
    const ch = await stripe.get(`/v1/charges/${chargeId}`, { expand: ['balance_transaction'] });
    const bt = ch.balance_transaction as StripeObject | null;
    if (!bt || typeof bt === 'string') return null;
    const details = (bt.fee_details ?? []) as StripeObject[];
    const fee = details
      .filter((d) => d.type === 'stripe_fee')
      .reduce((a, d) => a + Number(d.amount), 0);
    return Number.isSafeInteger(fee) ? fee : null;
  } catch {
    return null; // reconcile fills it in later; never fail the payment over it
  }
}

/** Apply a PaymentIntent's current Stripe state (used by webhooks AND reconcile). */
export async function applyPaymentIntent(pi: StripeObject, d: HandlerDeps): Promise<Outcome> {
  const paymentId = metaPayment(pi);
  const status = pi.status as string;
  if (status === 'succeeded') {
    const charge = idOf(pi.latest_charge);
    const fee = await actualStripeFee(d.stripe, charge);
    return (await d.store.paymentSucceeded({
      pi: pi.id,
      paymentId,
      charge,
      stripeFee: fee,
      amount: pi.amount,
      currency: pi.currency,
      destination: idOf(pi.transfer_data?.destination),
      applicationFee: pi.application_fee_amount ?? null,
    })) as Outcome;
  }
  if (status === 'processing')
    return (await d.store.paymentStatus({ pi: pi.id, status: 'processing', paymentId })) as Outcome;
  if (status === 'canceled')
    return (await d.store.paymentStatus({ pi: pi.id, status: 'canceled', paymentId })) as Outcome;
  if (status === 'requires_payment_method' && pi.last_payment_error) {
    return (await d.store.paymentStatus({ pi: pi.id, status: 'failed', paymentId })) as Outcome;
  }
  return 'noop';
}

async function applyRefunds(charge: StripeObject, d: HandlerDeps): Promise<Outcome> {
  const pi = idOf(charge.payment_intent);
  if (!pi) return 'ignored';
  const list = await d.stripe.get('/v1/refunds', { charge: charge.id, limit: 100 });
  const refunds = ((list.data ?? []) as StripeObject[]).map((r) => ({
    id: r.id as string,
    amount: Number(r.amount),
    status: String(r.status),
    ref:
      typeof r.metadata?.athleit_refund_id === 'string'
        ? (r.metadata.athleit_refund_id as string)
        : undefined,
  }));
  return (await d.store.refundEvent({
    pi,
    refunds,
    paymentId: metaPayment(charge),
    charge: charge.id,
  })) as Outcome;
}

export async function handleStripeEvent(event: StripeObject, d: HandlerDeps): Promise<Outcome> {
  const obj = (event.data?.object ?? {}) as StripeObject;
  // Payments are platform-account objects. A payment event scoped to a CONNECTED account is not ours to act on.
  if (event.account && /^(payment_intent|charge)\./.test(String(event.type))) return 'ignored';
  switch (event.type) {
    case 'payment_intent.succeeded':
    case 'payment_intent.processing':
    case 'payment_intent.canceled':
      return applyPaymentIntent(obj, d);
    case 'payment_intent.payment_failed':
      // Treat as failed regardless of how the snapshot looks at delivery time.
      return (await d.store.paymentStatus({
        pi: obj.id,
        status: 'failed',
        paymentId: metaPayment(obj),
      })) as Outcome;
    case 'charge.refunded':
      return applyRefunds(obj, d);
    case 'charge.refund.updated': {
      const ch =
        typeof obj.charge === 'string'
          ? await d.stripe.get(`/v1/charges/${obj.charge}`)
          : (obj.charge as StripeObject);
      return ch?.id ? applyRefunds(ch, d) : 'ignored';
    }
    case 'charge.dispute.created':
    case 'charge.dispute.closed': {
      const pi = idOf(obj.payment_intent);
      if (!pi) return 'ignored';
      const closed = event.type.endsWith('closed');
      const outcome = closed
        ? obj.status === 'won'
          ? 'won'
          : obj.status === 'lost'
            ? 'lost'
            : 'other'
        : undefined;
      return (await d.store.disputeEvent({
        pi,
        disputeId: obj.id,
        phase: closed ? 'closed' : 'created',
        outcome,
      })) as Outcome;
    }
    case 'account.updated':
      return applyAccount(obj, d);
    case 'account.application.deauthorized': {
      const acct = event.account as string | undefined;
      if (!acct) return 'ignored';
      return (await d.store.setAccountStatus({
        stripeAccountId: acct,
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        requirements: {},
        deauthorized: true,
      })) as Outcome;
    }
    default:
      return 'ignored';
  }
}

export async function applyAccount(acct: StripeObject, d: HandlerDeps): Promise<Outcome> {
  return (await d.store.setAccountStatus({
    stripeAccountId: acct.id,
    detailsSubmitted: !!acct.details_submitted,
    chargesEnabled: !!acct.charges_enabled,
    payoutsEnabled: !!acct.payouts_enabled,
    requirements: acct.requirements ?? {},
  })) as Outcome;
}
