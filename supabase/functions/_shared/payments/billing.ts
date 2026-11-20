// Team subscriptions (Athleit's own billing, on the PLATFORM Stripe account: no Stripe-Account header anywhere in this file).
//
// Rules that make this safe:
//  - State is never read from an event payload or a redirect. Every subscription or invoice event triggers a fetch of the
//    CURRENT subscription from Stripe, applied through one idempotent database function that refuses an older snapshot.
//  - A subscription is linked to a team by client_reference_id / subscription metadata and then verified by the database
//    (the team exists and any stored customer matches). Never by email or name; unknown customers are ignored.
//  - Redirect URLs come from configuration only. Authorization uses the caller's own client, never the service role.
import { checkoutTrial, type BillingState } from './billing-math.ts';
import type { Logger } from './log.ts';
import type { StripeApi, StripeObject } from './stripe.ts';

export type BillingStripe = Pick<StripeApi, 'get' | 'post'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isoFromEpoch = (s: unknown): string | null =>
  typeof s === 'number' && Number.isFinite(s) ? new Date(s * 1000).toISOString() : null;
const idOf = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : (v as StripeObject | null)?.id;

export interface CheckoutContext {
  enabled: boolean;
  state: BillingState;
  team_name?: string;
  trial_ends_at?: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_status?: string | null;
  automatic_tax?: boolean;
  stripe_product_id?: string | null;
  price_version?: {
    id: string;
    amount_cents: number;
    currency: string;
    stripe_price_id: string | null;
  };
}

export interface TeamBillingView {
  state: BillingState;
  can_manage: boolean;
}

/** The billing slice of the service-role database access (every call is an idempotent svc_* RPC). */
export interface BillingStore {
  checkoutContext(teamId: string): Promise<CheckoutContext>;
  setProduct(productId: string): Promise<string>;
  attachPrice(versionId: string, priceId: string): Promise<string>;
  setCustomer(teamId: string, customerId: string): Promise<string>;
  resolveTeam(teamId: string, customerId: string | null): Promise<string | null>;
  teamByCustomer(customerId: string): Promise<string | null>;
  applySnapshot(teamId: string, snapshot: Record<string, unknown>, at: string): Promise<string>;
  upsertInvoice(teamId: string, invoice: Record<string, unknown>): Promise<string>;
  invoiceCharge(
    invoiceId: string,
    refundedCents: number | null,
    disputed: boolean,
  ): Promise<string>;
  notify(teamId: string, notice: string, key: string): Promise<boolean>;
  reconcileCandidates(
    limit: number,
  ): Promise<{ team_id: string; stripe_subscription_id: string }[]>;
}

export interface BillingDeps {
  store: BillingStore;
  stripe: BillingStripe;
  log: Logger;
  now?: () => Date;
}

export type BillingOutcome = 'applied' | 'stale' | 'ignored' | 'unknown_team' | 'refused';

// ---------------------------------------------------------------------------------------------------------------
// Snapshot: the only way subscription state enters the database.
// ---------------------------------------------------------------------------------------------------------------

/** Normalise a Stripe subscription (either API shape for the period end) into what svc_apply_subscription_snapshot takes. */
export function snapshotFromSubscription(sub: StripeObject): Record<string, unknown> {
  const item = (sub.items?.data?.[0] ?? {}) as StripeObject;
  const periodEnd = sub.current_period_end ?? item.current_period_end;
  const cancelAt = typeof sub.cancel_at === 'number' ? sub.cancel_at : null;
  const price = (item.price ?? {}) as StripeObject;
  return {
    subscription_id: sub.id,
    customer_id: idOf(sub.customer),
    status: sub.status,
    current_period_end: isoFromEpoch(periodEnd),
    cancel_at_period_end:
      !!sub.cancel_at_period_end ||
      (cancelAt !== null && typeof periodEnd === 'number' && cancelAt <= periodEnd),
    canceled_at: isoFromEpoch(sub.canceled_at),
    ended_at: isoFromEpoch(sub.ended_at),
    price_version_id: UUID.test(String(sub.metadata?.price_version_id ?? ''))
      ? sub.metadata.price_version_id
      : null,
    unit_amount: typeof price.unit_amount === 'number' ? price.unit_amount : null,
    currency: price.currency ?? sub.currency ?? null,
    subscribed_by: UUID.test(String(sub.metadata?.initiated_by ?? ''))
      ? sub.metadata.initiated_by
      : null,
  };
}

/** Fetch the current subscription from Stripe and apply it. `teamId` must already be verified by resolveTeam. */
export async function refreshSubscription(
  teamId: string,
  subscriptionId: string,
  d: BillingDeps,
): Promise<BillingOutcome> {
  const sub = await d.stripe.get(`/v1/subscriptions/${subscriptionId}`, {
    expand: ['items.data.price'],
  });
  const at = (d.now?.() ?? new Date()).toISOString();
  const r = await d.store.applySnapshot(teamId, snapshotFromSubscription(sub), at);
  if (r === 'customer_mismatch' || r === 'subscription_conflict') {
    d.log('error', 'billing.snapshot_refused', { reason: r, team: teamId });
    return 'refused';
  }
  return r as BillingOutcome;
}

export function invoiceRow(inv: StripeObject): Record<string, unknown> {
  return {
    id: inv.id,
    number: inv.number ?? null,
    status: inv.status,
    amount_due: inv.amount_due,
    amount_paid: inv.amount_paid,
    currency: inv.currency,
    period_start: isoFromEpoch(inv.period_start),
    period_end: isoFromEpoch(inv.period_end),
    hosted_invoice_url: inv.hosted_invoice_url ?? null,
    invoice_pdf: inv.invoice_pdf ?? null,
    paid_at: isoFromEpoch(inv.status_transitions?.paid_at),
    created: isoFromEpoch(inv.created),
  };
}

const subscriptionOfInvoice = (inv: StripeObject): string | undefined =>
  idOf(inv.subscription) ?? idOf(inv.parent?.subscription_details?.subscription);

async function teamFor(
  metaTeam: unknown,
  customer: string | undefined,
  d: BillingDeps,
): Promise<string | null> {
  const t = typeof metaTeam === 'string' && UUID.test(metaTeam) ? metaTeam : null;
  if (t) return d.store.resolveTeam(t, customer ?? null);
  return customer ? d.store.teamByCustomer(customer) : null;
}

/** Mirror one invoice (fetched, never taken from the event) into the team's invoice list. */
async function mirrorInvoice(
  teamId: string,
  invoiceId: string,
  d: BillingDeps,
): Promise<StripeObject> {
  const inv = await d.stripe.get(`/v1/invoices/${invoiceId}`);
  await d.store.upsertInvoice(teamId, invoiceRow(inv));
  return inv;
}

/** Event types the platform endpoint treats as billing (everything else on that endpoint is not ours). */
export function isBillingEvent(event: StripeObject): boolean {
  if (event.account) return false; // Connect events belong to the payments handlers
  const type = String(event.type);
  const obj = (event.data?.object ?? {}) as StripeObject;
  if (type === 'checkout.session.completed') return obj.mode === 'subscription';
  if (/^customer\.subscription\./.test(type) || /^invoice\./.test(type)) return true;
  // Refunds and disputes count only for charges that paid a SUBSCRIPTION invoice.
  if (type === 'charge.refunded' || type === 'charge.dispute.created') return true;
  return false;
}

export async function handleBillingEvent(
  event: StripeObject,
  d: BillingDeps,
): Promise<BillingOutcome> {
  const type = String(event.type);
  const obj = (event.data?.object ?? {}) as StripeObject;

  if (type === 'checkout.session.completed') {
    if (obj.mode !== 'subscription') return 'ignored';
    const sub = idOf(obj.subscription);
    const team = await teamFor(
      obj.client_reference_id ?? obj.metadata?.team_id,
      idOf(obj.customer),
      d,
    );
    if (!sub || !team) return unknownTeam(event, d);
    return refreshSubscription(team, sub, d);
  }

  if (/^customer\.subscription\./.test(type)) {
    const team = await teamFor(obj.metadata?.team_id, idOf(obj.customer), d);
    if (!team) return unknownTeam(event, d);
    // trial_will_end only prompts a refresh; reminders are sent by the sweep, once, from the stored trial end.
    return refreshSubscription(team, obj.id, d);
  }

  if (/^invoice\./.test(type)) {
    const subId = subscriptionOfInvoice(obj);
    if (!subId) return 'ignored'; // not a subscription invoice
    const team = await teamFor(
      obj.subscription_details?.metadata?.team_id ??
        obj.parent?.subscription_details?.metadata?.team_id,
      idOf(obj.customer),
      d,
    );
    if (!team) return unknownTeam(event, d);
    await mirrorInvoice(team, obj.id, d);
    if (type === 'invoice.payment_action_required')
      await d.store.notify(team, 'payment_action_required', `sca:${obj.id}`);
    return refreshSubscription(team, subId, d);
  }

  if (type === 'charge.refunded' || type === 'charge.dispute.created') {
    const chargeId = type === 'charge.refunded' ? obj.id : idOf(obj.charge);
    if (!chargeId) return 'ignored';
    const charge = await d.stripe.get(`/v1/charges/${chargeId}`);
    const invoiceId = idOf(charge.invoice);
    if (!invoiceId) return 'ignored'; // not a subscription charge
    if (type === 'charge.dispute.created')
      d.log('error', 'billing.dispute_created', { invoice: invoiceId }); // loud, but never an automatic restriction
    const r = await d.store.invoiceCharge(
      invoiceId,
      typeof charge.amount_refunded === 'number' ? charge.amount_refunded : null,
      type === 'charge.dispute.created',
    );
    return r === 'applied' ? 'applied' : 'ignored';
  }
  return 'ignored';
}

function unknownTeam(event: StripeObject, d: BillingDeps): BillingOutcome {
  // Logged and ignored: an event for a customer we do not know never creates anything.
  d.log('warn', 'billing.unknown_team', { id: event.id, type: event.type });
  return 'unknown_team';
}

// ---------------------------------------------------------------------------------------------------------------
// User-facing flows (the caller has already been authenticated; authorization is the database's, as the caller).
// ---------------------------------------------------------------------------------------------------------------

export interface FlowDeps extends BillingDeps {
  /** public.get_team_billing as the signed-in user. null = not a member of the team's staff. */
  viewAsUser: (teamId: string) => Promise<TeamBillingView | null>;
  /** From APP_URL: the only source of redirect targets. */
  appUrl: string;
  payerEmail?: string | null;
}

async function requireAdmin(teamId: string, d: FlowDeps): Promise<TeamBillingView> {
  const v = await d.viewAsUser(teamId);
  if (!v?.can_manage) throw new Error('not_authorized');
  return v;
}

const bucket = (d: BillingDeps, seconds: number) =>
  Math.floor((d.now?.() ?? new Date()).getTime() / 1000 / seconds);

export function billingUrls(appUrl: string, teamId: string) {
  const base = appUrl.replace(/\/$/, '');
  return {
    success: `${base}/teams/${teamId}/billing/success`,
    cancel: `${base}/teams/${teamId}/billing/cancelled`,
    portalReturn: `${base}/teams/${teamId}/billing`,
  };
}

export async function createBillingCheckout(
  userId: string,
  teamId: string,
  d: FlowDeps,
): Promise<{ url: string; trialExtendedToMinimum: boolean; trialEndsAt: string | null }> {
  await requireAdmin(teamId, d);
  const ctx = await d.store.checkoutContext(teamId);
  if (!ctx.enabled || ctx.state === 'off') throw new Error('billing_disabled');
  if (['active', 'cancel_scheduled', 'comped'].includes(ctx.state))
    throw new Error('already_subscribed');
  // A subscription Stripe is still billing (including past_due, which Smart Retries is working on) is fixed through the
  // portal. A second Checkout would charge the card again and the database would refuse to apply it.
  if (
    ctx.stripe_subscription_id &&
    ['active', 'trialing', 'past_due', 'unpaid'].includes(ctx.stripe_status ?? '')
  )
    throw new Error('already_subscribed');
  const ver = ctx.price_version;
  if (!ver) throw new Error('billing_unavailable');

  // Product, then Price: created lazily the first time a checkout needs them; the ids are stored so a price is never
  // created twice (and the idempotency keys make a crash between create and store harmless).
  let product = ctx.stripe_product_id ?? null;
  if (!product) {
    const p = await d.stripe.post(
      '/v1/products',
      { name: 'Athleit team subscription' },
      'athleit:billing:product:v1',
    );
    product = await d.store.setProduct(p.id);
  }
  let priceId = ver.stripe_price_id;
  if (!priceId) {
    const p = await d.stripe.post(
      '/v1/prices',
      {
        product,
        unit_amount: ver.amount_cents,
        currency: ver.currency,
        recurring: { interval: 'month' },
        metadata: { price_version_id: ver.id },
      },
      `athleit:billing:price:${ver.id}`,
    );
    priceId = await d.store.attachPrice(ver.id, p.id);
  }

  // The customer belongs to the TEAM (metadata team_id), not to whoever clicked Subscribe.
  let customer = ctx.stripe_customer_id ?? null;
  if (!customer) {
    const c = await d.stripe.post(
      '/v1/customers',
      {
        name: ctx.team_name,
        email: d.payerEmail ?? undefined,
        metadata: { team_id: teamId },
      },
      `athleit:billing:customer:${teamId}`,
    );
    customer = await d.store.setCustomer(teamId, c.id);
  }

  // Expire stale open sessions for this team so only one is ever live.
  const open = await d.stripe.get('/v1/checkout/sessions', { customer, status: 'open', limit: 10 });
  const expired: string[] = [];
  for (const s of (open.data ?? []) as StripeObject[])
    if (s.client_reference_id === teamId) {
      expired.push(String(s.id));
      await d.stripe
        .post(`/v1/checkout/sessions/${s.id}/expire`, {}, `athleit:billing:expire:${s.id}`)
        .catch(() => {});
    }

  const now = d.now?.() ?? new Date();
  const trial = ctx.trial_ends_at
    ? checkoutTrial(ctx.trial_ends_at, ctx.state, now)
    : ({ mode: 'charge_now' } as const);
  const urls = billingUrls(d.appUrl, teamId);
  const meta = { team_id: teamId, price_version_id: ver.id, initiated_by: userId };
  const session = await d.stripe.post(
    '/v1/checkout/sessions',
    {
      mode: 'subscription',
      customer,
      client_reference_id: teamId,
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: 'always',
      allow_promotion_codes: false,
      metadata: meta,
      subscription_data: {
        metadata: meta,
        ...(trial.mode === 'trial'
          ? { trial_end: Math.floor(trial.trialEnd.getTime() / 1000) }
          : {}),
      },
      ...(ctx.automatic_tax
        ? {
            billing_address_collection: 'required',
            automatic_tax: { enabled: true },
            customer_update: { address: 'auto', name: 'auto' },
          }
        : {}),
      success_url: urls.success,
      cancel_url: urls.cancel,
    },
    // The expired session ids are part of the key: an idempotent replay must never hand back a session we just expired.
    `athleit:billing:checkout:${teamId}:${ver.id}:${bucket(d, 300)}:${expired.join('+')}`,
  );
  if (typeof session.url !== 'string') throw new Error('stripe_no_session_url');
  return {
    url: session.url,
    trialExtendedToMinimum: trial.mode === 'trial' && trial.extendedToMinimum,
    trialEndsAt: trial.mode === 'trial' ? trial.realEnd.toISOString() : null,
  };
}

export async function createPortalSession(teamId: string, d: FlowDeps): Promise<{ url: string }> {
  await requireAdmin(teamId, d);
  const ctx = await d.store.checkoutContext(teamId);
  if (!ctx.enabled || !ctx.stripe_customer_id) throw new Error('not_subscribed');
  const s = await d.stripe.post('/v1/billing_portal/sessions', {
    customer: ctx.stripe_customer_id,
    return_url: billingUrls(d.appUrl, teamId).portalReturn,
  });
  if (typeof s.url !== 'string') throw new Error('stripe_no_session_url');
  return { url: s.url };
}

/** Card brand and last four of the team's default payment method, read from Stripe on demand (nothing is stored). */
export async function getCardSummary(
  teamId: string,
  d: FlowDeps,
): Promise<{
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
} | null> {
  await requireAdmin(teamId, d);
  const ctx = await d.store.checkoutContext(teamId);
  if (!ctx.stripe_customer_id) return null;
  const cust = await d.stripe.get(`/v1/customers/${ctx.stripe_customer_id}`, {
    expand: ['invoice_settings.default_payment_method'],
  });
  let pm = cust.invoice_settings?.default_payment_method as
    StripeObject | string | null | undefined;
  if (!pm && ctx.stripe_subscription_id) {
    const sub = await d.stripe.get(`/v1/subscriptions/${ctx.stripe_subscription_id}`, {
      expand: ['default_payment_method'],
    });
    pm = sub.default_payment_method;
  }
  const card = typeof pm === 'object' && pm ? (pm.card as StripeObject | undefined) : undefined;
  return card
    ? {
        brand: card.brand ?? null,
        last4: card.last4 ?? null,
        expMonth: card.exp_month ?? null,
        expYear: card.exp_year ?? null,
      }
    : null;
}

/** Cancel (at period end) or resume. Never ends service early; the snapshot is applied at once so the UI is current. */
export async function updateSubscription(
  teamId: string,
  action: 'cancel' | 'resume',
  d: FlowDeps,
): Promise<{ state: string; currentPeriodEnd: string | null }> {
  await requireAdmin(teamId, d);
  const ctx = await d.store.checkoutContext(teamId);
  if (!ctx.stripe_subscription_id) throw new Error('not_subscribed');
  const want = action === 'cancel' ? 'active' : 'cancel_scheduled';
  if (ctx.state !== want) throw new Error('not_subscribed');
  const sub = await d.stripe.post(
    `/v1/subscriptions/${ctx.stripe_subscription_id}`,
    { cancel_at_period_end: action === 'cancel' },
    `athleit:billing:${action}:${ctx.stripe_subscription_id}:${bucket(d, 60)}`,
  );
  const snap = snapshotFromSubscription(sub);
  await d.store.applySnapshot(teamId, snap, (d.now?.() ?? new Date()).toISOString());
  return {
    state: action === 'cancel' ? 'cancel_scheduled' : 'active',
    currentPeriodEnd: (snap.current_period_end as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Reconcile (pg_cron every 15 minutes). Safe to run concurrently and repeatedly: every step is an idempotent snapshot.
// ---------------------------------------------------------------------------------------------------------------

export async function reconcileBilling(
  d: BillingDeps,
  limit = 50,
): Promise<{ checked: number; applied: number; stale: number; errors: number }> {
  const out = { checked: 0, applied: 0, stale: 0, errors: 0 };
  for (const c of await d.store.reconcileCandidates(limit)) {
    out.checked++;
    try {
      const r = await refreshSubscription(c.team_id, c.stripe_subscription_id, d);
      if (r === 'applied') out.applied++;
      else if (r === 'stale') out.stale++;
      const invs = await d.stripe.get('/v1/invoices', {
        subscription: c.stripe_subscription_id,
        limit: 3,
      });
      for (const inv of (invs.data ?? []) as StripeObject[])
        await d.store.upsertInvoice(c.team_id, invoiceRow(inv));
    } catch (e) {
      out.errors++;
      d.log('error', 'billing.reconcile_item_failed', {
        error: String((e as Error).message).slice(0, 80),
      });
    }
  }
  d.log('info', 'billing.reconcile_done', out);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Database access (service role).
// ---------------------------------------------------------------------------------------------------------------

interface RpcLike {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: any; error: { message?: string; code?: string } | null }>;
}

export function supabaseBillingStore(db: RpcLike): BillingStore {
  const call = async (n: string, a: Record<string, unknown> = {}) => {
    const r = await db.rpc(n, a);
    if (r.error) throw new Error(r.error.message ?? 'db_error');
    return r.data;
  };
  return {
    checkoutContext: (t) => call('svc_billing_checkout_context', { p_team_id: t }),
    setProduct: (p) => call('svc_set_billing_product', { p_product_id: p }),
    attachPrice: (v, p) => call('svc_attach_stripe_price', { p_version_id: v, p_price_id: p }),
    setCustomer: (t, c) => call('svc_set_billing_customer', { p_team_id: t, p_customer_id: c }),
    resolveTeam: (t, c) => call('svc_billing_resolve_team', { p_team_id: t, p_customer_id: c }),
    teamByCustomer: (c) => call('svc_billing_team_by_customer', { p_customer_id: c }),
    applySnapshot: (t, s, at) =>
      call('svc_apply_subscription_snapshot', { p_team_id: t, p_snap: s, p_snapshot_at: at }),
    upsertInvoice: (t, i) => call('svc_upsert_billing_invoice', { p_team_id: t, p_inv: i }),
    invoiceCharge: (i, r, dsp) =>
      call('svc_billing_invoice_charge', { p_invoice_id: i, p_refunded_cents: r, p_disputed: dsp }),
    notify: (t, n, k) => call('svc_billing_notify', { p_team_id: t, p_notice: n, p_key: k }),
    reconcileCandidates: (limit) => call('svc_billing_reconcile_candidates', { p_limit: limit }),
  };
}
