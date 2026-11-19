// Maps Stripe events (and the same state fetched during reconcile) onto the idempotent database handlers.
// The database converges regardless of order or repetition; nothing here decides money.
//
// Charges are DIRECT charges on the team/club's connected account, so every payment object lives on that account:
// its events arrive on the Connect webhook endpoint with `event.account` set, and every Stripe read for it must
// carry the Stripe-Account header. The account is also passed to the database, which refuses an event whose
// account is not the one the payment was reserved for.
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

/** The actual Stripe processing fee of a charge (balance transaction on the connected account), or null if unreadable yet. */
export async function actualStripeFee(
  stripe: HandlerDeps['stripe'],
  chargeId: string | undefined,
  account: string,
): Promise<number | null> {
  if (!chargeId) return null;
  try {
    const ch = await stripe.get(
      `/v1/charges/${chargeId}`,
      { expand: ['balance_transaction'] },
      account,
    );
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

/** Apply a PaymentIntent's current Stripe state (used by webhooks AND reconcile). `account` = the connected account it lives on. */
export async function applyPaymentIntent(
  pi: StripeObject,
  d: HandlerDeps,
  account: string,
): Promise<Outcome> {
  const paymentId = metaPayment(pi);
  const status = pi.status as string;
  if (status === 'succeeded') {
    const charge = idOf(pi.latest_charge);
    const fee = await actualStripeFee(d.stripe, charge, account);
    const outcome = (await d.store.paymentSucceeded({
      pi: pi.id,
      paymentId,
      charge,
      stripeFee: fee,
      amount: pi.amount,
      currency: pi.currency,
      destination: account,
      applicationFee: pi.application_fee_amount ?? 0,
    })) as Outcome;
    // A plan's first payment made with autopay consent saved the card for off-session use: remember the ids.
    const customer = idOf(pi.customer);
    const method = idOf(pi.payment_method);
    if (paymentId && customer && method && pi.setup_future_usage === 'off_session')
      await d.store.saveCardForPayment(paymentId, customer, method);
    return outcome;
  }
  if (status === 'processing')
    return (await d.store.paymentStatus({
      pi: pi.id,
      status: 'processing',
      paymentId,
    })) as Outcome;
  if (status === 'canceled')
    return (await d.store.paymentStatus({ pi: pi.id, status: 'canceled', paymentId })) as Outcome;
  if (status === 'requires_payment_method' && pi.last_payment_error) {
    return (await d.store.paymentStatus({ pi: pi.id, status: 'failed', paymentId })) as Outcome;
  }
  return 'noop';
}

async function applyRefunds(
  charge: StripeObject,
  d: HandlerDeps,
  account: string,
): Promise<Outcome> {
  const pi = idOf(charge.payment_intent);
  if (!pi) return 'ignored';
  const list = await d.stripe.get('/v1/refunds', { charge: charge.id, limit: 100 }, account);
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
  const type = String(event.type);
  const account = event.account as string | undefined;
  // Payment objects are created on connected accounts, so their events always carry `account`. A payment-shaped
  // event WITHOUT one belongs to the platform's own Stripe account (not our flow): ignore it.
  if (/^(payment_intent|charge)\./.test(type) && !account) return 'ignored';
  switch (type) {
    case 'payment_intent.succeeded':
    case 'payment_intent.processing':
    case 'payment_intent.canceled':
      return applyPaymentIntent(obj, d, account!);
    case 'payment_intent.payment_failed':
      // Treat as failed regardless of how the snapshot looks at delivery time.
      return (await d.store.paymentStatus({
        pi: obj.id,
        status: 'failed',
        paymentId: metaPayment(obj),
      })) as Outcome;
    case 'charge.refunded':
      return applyRefunds(obj, d, account!);
    case 'charge.refund.updated': {
      const ch =
        typeof obj.charge === 'string'
          ? await d.stripe.get(`/v1/charges/${obj.charge}`, undefined, account)
          : (obj.charge as StripeObject);
      return ch?.id ? applyRefunds(ch, d, account!) : 'ignored';
    }
    case 'charge.dispute.created':
    case 'charge.dispute.closed': {
      const pi = idOf(obj.payment_intent);
      if (!pi) return 'ignored';
      const closed = type.endsWith('closed');
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
      if (!account) return 'ignored';
      return (await d.store.setAccountStatus({
        stripeAccountId: account,
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
