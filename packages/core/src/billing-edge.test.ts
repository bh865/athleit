/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for Stripe and the store are deliberately loose */
import { describe, expect, it, vi } from 'vitest';

import {
  createBillingCheckout,
  createPortalSession,
  handleBillingEvent,
  isBillingEvent,
  reconcileBilling,
  snapshotFromSubscription,
  updateSubscription,
  type BillingStore,
  type CheckoutContext,
} from '../../../supabase/functions/_shared/payments/billing';
import { checkoutTrial as edgeTrial } from '../../../supabase/functions/_shared/payments/billing-math';
import { buildContent, linkFor } from '../../../supabase/functions/_shared/deliver';
import { processWebhook } from '../../../supabase/functions/_shared/payments/webhook';
import { signPayload } from '../../../supabase/functions/_shared/payments/stripe';
import { billingTeamInput, updateSubscriptionInput } from '../../../supabase/functions/_shared/payments/schemas';
import { checkoutTrial as coreTrial } from './team-billing';

const TEAM = 'a1000000-0000-0000-0000-00000000000a';
const VER = 'b1000000-0000-0000-0000-000000000001';
const USER = 'a8888888-8888-8888-8888-888888888888';
const NOW = new Date('2026-01-01T00:00:00Z');
const log = vi.fn();

function ctx(over: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    enabled: true,
    state: 'trialing',
    team_name: 'Falcons',
    trial_ends_at: '2026-01-10T00:00:00Z',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_status: null,
    automatic_tax: false,
    stripe_product_id: null,
    price_version: { id: VER, amount_cents: 1000, currency: 'usd', stripe_price_id: null },
    ...over,
  };
}

function fakeStore(c: CheckoutContext = ctx(), extra: Partial<BillingStore> = {}) {
  const calls: Record<string, any> = {};
  const rec = (n: string, v: any, r: any) => {
    (calls[n] ??= []).push(v);
    return r;
  };
  const store: BillingStore = {
    checkoutContext: async () => c,
    setProduct: async (p) => rec('setProduct', p, p),
    attachPrice: async (v, p) => rec('attachPrice', [v, p], p),
    setCustomer: async (t, cu) => rec('setCustomer', [t, cu], cu),
    resolveTeam: async (t) => rec('resolveTeam', t, t),
    teamByCustomer: async (cu) => rec('teamByCustomer', cu, cu === 'cus_known' ? TEAM : null),
    applySnapshot: async (t, s, at) => rec('applySnapshot', { t, s, at }, 'applied'),
    upsertInvoice: async (t, i) => rec('upsertInvoice', { t, i }, 'applied'),
    invoiceCharge: async (i, r, d) => rec('invoiceCharge', { i, r, d }, 'applied'),
    notify: async (t, n, k) => rec('notify', { t, n, k }, true),
    reconcileCandidates: async () => [{ team_id: TEAM, stripe_subscription_id: 'sub_1' }],
    ...extra,
  };
  return { store, calls };
}

const sub = (over: Record<string, any> = {}) => ({
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
  cancel_at_period_end: false,
  canceled_at: null,
  ended_at: null,
  metadata: { team_id: TEAM, price_version_id: VER, initiated_by: USER },
  items: { data: [{ current_period_end: 1_770_000_000, price: { id: 'price_1', unit_amount: 1000, currency: 'usd' } }] },
  ...over,
});

function fakeStripe(handlers: Record<string, (params: any, key?: string, account?: string) => any> = {}) {
  const requests: { method: string; path: string; params: any; key?: string; account?: string }[] = [];
  const route = (method: 'get' | 'post') => async (path: string, params: any, key?: any, account?: any) => {
    const acct = method === 'get' ? key : account; // get(path, query, account) / post(path, params, key, account)
    requests.push({ method, path, params, key: method === 'post' ? key : undefined, account: acct });
    const h = Object.entries(handlers).find(([p]) => path.startsWith(p));
    if (!h) throw new Error(`unexpected ${method} ${path}`);
    return h[1](params, key, acct);
  };
  return { stripe: { get: route('get'), post: route('post') } as any, requests };
}

const flow = (store: BillingStore, stripe: any, over: any = {}) => ({
  store,
  stripe,
  log,
  now: () => NOW,
  appUrl: 'https://app.athleit.test/',
  payerEmail: 'admin@example.test',
  viewAsUser: async () => ({ state: 'trialing' as const, can_manage: true }),
  ...over,
});

describe('snapshotFromSubscription', () => {
  it('reads the period end from either API shape and the locked price version from metadata', () => {
    const s = snapshotFromSubscription(sub());
    expect(s).toMatchObject({ subscription_id: 'sub_1', customer_id: 'cus_1', status: 'active', unit_amount: 1000, price_version_id: VER, subscribed_by: USER });
    expect(s.current_period_end).toBe(new Date(1_770_000_000 * 1000).toISOString());
    const old = snapshotFromSubscription({ ...sub(), current_period_end: 1_760_000_000, items: { data: [{ price: { unit_amount: 1000, currency: 'usd' } }] } });
    expect(old.current_period_end).toBe(new Date(1_760_000_000 * 1000).toISOString());
  });
  it('treats cancel_at at the period end as a scheduled cancellation, and ignores malformed metadata ids', () => {
    expect(snapshotFromSubscription(sub({ cancel_at: 1_770_000_000 })).cancel_at_period_end).toBe(true);
    expect(snapshotFromSubscription(sub({ cancel_at: 1_900_000_000 })).cancel_at_period_end).toBe(false);
    expect(snapshotFromSubscription(sub({ metadata: { price_version_id: 'nope', initiated_by: 'x' } }))).toMatchObject({ price_version_id: null, subscribed_by: null });
  });
});

describe('webhook routing and handlers', () => {
  it('routes only platform billing events (never Connect events, never non-subscription checkouts)', () => {
    expect(isBillingEvent({ type: 'invoice.paid', data: { object: {} } })).toBe(true);
    expect(isBillingEvent({ type: 'customer.subscription.updated', data: { object: {} } })).toBe(true);
    expect(isBillingEvent({ type: 'checkout.session.completed', data: { object: { mode: 'subscription' } } })).toBe(true);
    expect(isBillingEvent({ type: 'checkout.session.completed', data: { object: { mode: 'payment' } } })).toBe(false);
    expect(isBillingEvent({ type: 'invoice.paid', account: 'acct_1', data: { object: {} } })).toBe(false);
    expect(isBillingEvent({ type: 'payment_intent.succeeded', data: { object: {} } })).toBe(false);
  });

  it('fetches the subscription instead of trusting the event payload, with NO Stripe-Account header', async () => {
    const { store, calls } = fakeStore();
    const { stripe, requests } = fakeStripe({ '/v1/subscriptions/': () => sub({ status: 'past_due' }) });
    const payloadClaim = { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { team_id: TEAM } };
    const out = await handleBillingEvent({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: payloadClaim } }, { store, stripe, log, now: () => NOW });
    expect(out).toBe('applied');
    expect(requests[0]).toMatchObject({ method: 'get', path: '/v1/subscriptions/sub_1' });
    expect(requests.every((r) => r.account === undefined)).toBe(true);
    expect(calls.applySnapshot[0].s.status).toBe('past_due'); // the fetched state, not the payload's 'active'
  });

  it('links a checkout to the team by client_reference_id, never by email or name', async () => {
    const { store, calls } = fakeStore();
    const { stripe } = fakeStripe({ '/v1/subscriptions/': () => sub() });
    await handleBillingEvent(
      { id: 'evt_2', type: 'checkout.session.completed', data: { object: { mode: 'subscription', client_reference_id: TEAM, customer: 'cus_1', subscription: 'sub_1', customer_email: 'someone@else.test', customer_details: { name: 'Other Team' } } } },
      { store, stripe, log, now: () => NOW },
    );
    expect(calls.resolveTeam).toEqual([TEAM]);
    expect(calls.applySnapshot[0].t).toBe(TEAM);
  });

  it('ignores an event for an unknown customer and never creates anything', async () => {
    const { store, calls } = fakeStore();
    const { stripe, requests } = fakeStripe({});
    const out = await handleBillingEvent({ id: 'evt_3', type: 'customer.subscription.created', data: { object: { id: 'sub_9', customer: 'cus_stranger', metadata: {} } } }, { store, stripe, log, now: () => NOW });
    expect(out).toBe('unknown_team');
    expect(calls.applySnapshot).toBeUndefined();
    expect(requests).toHaveLength(0);
  });

  it('mirrors a subscription invoice (fetched) and refreshes; payment_action_required also notifies once-keyed', async () => {
    const { store, calls } = fakeStore();
    const inv = { id: 'in_1', subscription: 'sub_1', customer: 'cus_known', status: 'open', amount_due: 1000, amount_paid: 0, currency: 'usd', created: 1_770_000_000, hosted_invoice_url: 'https://invoice.stripe.test/i/1' };
    const { stripe, requests } = fakeStripe({ '/v1/invoices/': () => inv, '/v1/subscriptions/': () => sub({ status: 'past_due' }) });
    const out = await handleBillingEvent({ id: 'evt_4', type: 'invoice.payment_action_required', data: { object: { id: 'in_1', subscription: 'sub_1', customer: 'cus_known' } } }, { store, stripe, log, now: () => NOW });
    expect(out).toBe('applied');
    expect(requests.map((r) => r.path)).toEqual(['/v1/invoices/in_1', '/v1/subscriptions/sub_1']);
    expect(calls.upsertInvoice[0].i).toMatchObject({ id: 'in_1', amount_due: 1000, status: 'open' });
    expect(calls.notify[0]).toEqual({ t: TEAM, n: 'payment_action_required', k: 'sca:in_1' });
  });

  it('ignores an invoice that is not a subscription invoice', async () => {
    const { store } = fakeStore();
    const { stripe } = fakeStripe({});
    expect(await handleBillingEvent({ id: 'e', type: 'invoice.paid', data: { object: { id: 'in_2', customer: 'cus_known' } } }, { store, stripe, log })).toBe('ignored');
  });

  it('records refunds and disputes for subscription charges only, with no automatic restriction', async () => {
    const { store, calls } = fakeStore();
    const { stripe } = fakeStripe({ '/v1/charges/ch_sub': () => ({ id: 'ch_sub', invoice: 'in_1', amount_refunded: 500 }), '/v1/charges/ch_pay': () => ({ id: 'ch_pay', invoice: null }) });
    await handleBillingEvent({ id: 'e1', type: 'charge.refunded', data: { object: { id: 'ch_sub' } } }, { store, stripe, log });
    expect(calls.invoiceCharge[0]).toEqual({ i: 'in_1', r: 500, d: false });
    await handleBillingEvent({ id: 'e2', type: 'charge.dispute.created', data: { object: { id: 'dp_1', charge: 'ch_sub' } } }, { store, stripe, log });
    expect(calls.invoiceCharge[1]).toEqual({ i: 'in_1', r: 500, d: true });
    expect(calls.applySnapshot).toBeUndefined(); // a dispute never changes subscription state
    expect(await handleBillingEvent({ id: 'e3', type: 'charge.refunded', data: { object: { id: 'ch_pay' } } }, { store, stripe, log })).toBe('ignored');
  });

  it('replay and out-of-order delivery: every event refetches, and the database refuses an older snapshot', async () => {
    const applied: string[] = [];
    const { store } = fakeStore(ctx(), {
      applySnapshot: async (_t, s: any, at) => {
        applied.push(`${s.status}@${at}`);
        return applied.length === 3 ? 'stale' : 'applied';
      },
    });
    let n = 0;
    const { stripe } = fakeStripe({ '/v1/subscriptions/': () => sub({ status: ['active', 'past_due', 'active'][n++] }) });
    let clock = 0;
    const d = { store, stripe, log, now: () => new Date(NOW.getTime() + 1000 * clock++) };
    const ev = { id: 'evt', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_known', metadata: { team_id: TEAM } } } };
    expect(await handleBillingEvent(ev, d)).toBe('applied');
    expect(await handleBillingEvent(ev, d)).toBe('applied');
    expect(await handleBillingEvent(ev, d)).toBe('stale');
    expect(applied).toHaveLength(3);
  });

  it('a refused snapshot (customer mismatch) is logged loudly and not retried', async () => {
    const errors: string[] = [];
    const { store } = fakeStore(ctx(), { applySnapshot: async () => 'customer_mismatch' });
    const { stripe } = fakeStripe({ '/v1/subscriptions/': () => sub() });
    const out = await handleBillingEvent({ id: 'e', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_known', metadata: { team_id: TEAM } } } }, { store, stripe, log: (l, e) => errors.push(`${l}:${e}`) });
    expect(out).toBe('refused');
    expect(errors).toContain('error:billing.snapshot_refused');
  });
});

describe('processWebhook with billing', () => {
  const secret = 'whsec_test';
  async function deliver(event: any, billing: any, ledger: 'ok' | 'duplicate' = 'ok') {
    const raw = JSON.stringify(event);
    const t = Math.floor(NOW.getTime() / 1000);
    const sig = `t=${t},v1=${await signPayload(secret, t, raw)}`;
    const finished: any[] = [];
    const paymentsStore: any = { ledgerEvent: async () => ledger === 'ok' ? 'new' : 'duplicate', finishEvent: async (...a: any[]) => finished.push(a) };
    const res = await processWebhook(raw, sig, { secrets: [secret], log, store: paymentsStore, stripe: { get: async () => { throw new Error('payments stripe must not be used'); }, post: async () => ({}) } as any, billing, now: () => NOW.getTime() });
    return { res, finished };
  }
  const billingDeps = (store: BillingStore, stripe: any) => ({ store, stripe, log, now: () => NOW });

  it('handles a platform subscription event through the billing handlers and finishes the ledger row', async () => {
    const { store, calls } = fakeStore();
    const { stripe } = fakeStripe({ '/v1/subscriptions/': () => sub() });
    const { res, finished } = await deliver({ id: 'evt_a', type: 'customer.subscription.updated', created: 1, livemode: false, data: { object: { id: 'sub_1', customer: 'cus_known', metadata: { team_id: TEAM } } } }, billingDeps(store, stripe));
    expect(res.status).toBe(200);
    expect(calls.applySnapshot).toHaveLength(1);
    expect(finished[0][0]).toBe('evt_a');
  });
  it('a replayed event id is a no-op', async () => {
    const { store, calls } = fakeStore();
    const { stripe } = fakeStripe({});
    const { res } = await deliver({ id: 'evt_a', type: 'invoice.paid', livemode: false, data: { object: {} } }, billingDeps(store, stripe), 'duplicate');
    expect(res.body).toMatchObject({ duplicate: true });
    expect(calls.applySnapshot).toBeUndefined();
  });
  it('refuses a live-mode event', async () => {
    const { store } = fakeStore();
    const { res } = await deliver({ id: 'evt_l', type: 'invoice.paid', livemode: true, data: { object: {} } }, billingDeps(store, fakeStripe({}).stripe));
    expect(res.status).toBe(400);
  });
  it('a handler failure asks Stripe to retry', async () => {
    const { store } = fakeStore();
    const { stripe } = fakeStripe({ '/v1/subscriptions/': () => { throw new Error('stripe_api_error'); } });
    const { res } = await deliver({ id: 'evt_f', type: 'customer.subscription.updated', livemode: false, data: { object: { id: 'sub_1', customer: 'cus_known', metadata: {} } } }, billingDeps(store, stripe));
    expect(res.status).toBe(500);
  });
});

describe('createBillingCheckout', () => {
  it('creates product, price, customer and a subscription Checkout; config-only URLs; carries the remaining trial', async () => {
    const { store, calls } = fakeStore();
    const { stripe, requests } = fakeStripe({
      '/v1/products': () => ({ id: 'prod_1' }),
      '/v1/prices': () => ({ id: 'price_1' }),
      '/v1/customers': () => ({ id: 'cus_1' }),
      '/v1/checkout/sessions': (p: any) => (p.mode ? { id: 'cs_1', url: 'https://checkout.stripe.test/c/1' } : { data: [] }),
    });
    const r = await createBillingCheckout(USER, TEAM, flow(store, stripe));
    expect(r).toMatchObject({ url: 'https://checkout.stripe.test/c/1', trialExtendedToMinimum: false });
    const price = requests.find((q) => q.path === '/v1/prices')!;
    expect(price.params).toMatchObject({ unit_amount: 1000, currency: 'usd', recurring: { interval: 'month' }, product: 'prod_1' });
    expect(price.key).toBe(`athleit:billing:price:${VER}`);
    const cust = requests.find((q) => q.path === '/v1/customers')!;
    expect(cust.params.metadata).toEqual({ team_id: TEAM });
    const s = requests.find((q) => q.path === '/v1/checkout/sessions' && q.method === 'post' && q.params.mode)!;
    expect(s.params).toMatchObject({
      mode: 'subscription',
      client_reference_id: TEAM,
      payment_method_collection: 'always',
      allow_promotion_codes: false,
      success_url: `https://app.athleit.test/teams/${TEAM}/billing/success`,
      cancel_url: `https://app.athleit.test/teams/${TEAM}/billing/cancelled`,
    });
    expect(s.params.subscription_data.trial_end).toBe(Date.parse('2026-01-10T00:00:00Z') / 1000);
    expect(s.params.subscription_data.metadata).toEqual({ team_id: TEAM, price_version_id: VER, initiated_by: USER });
    expect(s.params.automatic_tax).toBeUndefined();
    expect(s.params.billing_address_collection).toBeUndefined();
    expect(requests.every((q) => q.account === undefined)).toBe(true);
    expect(calls.setProduct).toEqual(['prod_1']);
    expect(calls.attachPrice).toEqual([[VER, 'price_1']]);
  });

  it('reuses stored ids and never recreates a price or customer', async () => {
    const { store } = fakeStore(ctx({ stripe_product_id: 'prod_9', stripe_customer_id: 'cus_9', price_version: { id: VER, amount_cents: 1000, currency: 'usd', stripe_price_id: 'price_9' } }));
    const { stripe, requests } = fakeStripe({ '/v1/checkout/sessions': (p: any) => (p.mode ? { url: 'https://c.test/1' } : { data: [] }) });
    await createBillingCheckout(USER, TEAM, flow(store, stripe));
    expect(requests.map((q) => q.path)).not.toContain('/v1/products');
    expect(requests.map((q) => q.path)).not.toContain('/v1/prices');
    expect(requests.map((q) => q.path)).not.toContain('/v1/customers');
  });

  it('expires stale open sessions of the team only', async () => {
    const { store } = fakeStore(ctx({ stripe_product_id: 'prod_9', stripe_customer_id: 'cus_9', price_version: { id: VER, amount_cents: 1000, currency: 'usd', stripe_price_id: 'price_9' } }));
    const { stripe, requests } = fakeStripe({
      '/v1/checkout/sessions/cs_old/expire': () => ({}),
      '/v1/checkout/sessions': (p: any) => (p.mode ? { url: 'https://c.test/1' } : { data: [{ id: 'cs_old', client_reference_id: TEAM }, { id: 'cs_other', client_reference_id: 'someone-else' }] }),
    });
    await createBillingCheckout(USER, TEAM, flow(store, stripe));
    expect(requests.filter((q) => q.path.endsWith('/expire')).map((q) => q.path)).toEqual(['/v1/checkout/sessions/cs_old/expire']);
  });

  it('pushes the trial end to the 48 hour minimum and says so; charges immediately for an expired team', async () => {
    const base = { stripe_product_id: 'prod_9', stripe_customer_id: 'cus_9', price_version: { id: VER, amount_cents: 1000, currency: 'usd', stripe_price_id: 'price_9' } };
    const mk = () => fakeStripe({ '/v1/checkout/sessions': (p: any) => (p.mode ? { url: 'https://c.test/1' } : { data: [] }) });
    const a = mk();
    const r = await createBillingCheckout(USER, TEAM, flow(fakeStore(ctx({ ...base, trial_ends_at: '2026-01-02T00:00:00Z' })).store, a.stripe));
    expect(r.trialExtendedToMinimum).toBe(true);
    expect(r.trialEndsAt).toBe('2026-01-02T00:00:00.000Z');
    const sess = a.requests.find((q) => q.params?.mode)!;
    expect(sess.params.subscription_data.trial_end * 1000 - NOW.getTime()).toBeGreaterThanOrEqual(48 * 3_600_000);
    const b = mk();
    await createBillingCheckout(USER, TEAM, flow(fakeStore(ctx({ ...base, state: 'trial_expired', trial_ends_at: '2025-12-01T00:00:00Z' })).store, b.stripe));
    expect(b.requests.find((q) => q.params?.mode)!.params.subscription_data.trial_end).toBeUndefined();
  });

  it('adds address collection and automatic tax only when the setting is on', async () => {
    const { store } = fakeStore(ctx({ automatic_tax: true, stripe_product_id: 'p', stripe_customer_id: 'c', price_version: { id: VER, amount_cents: 1000, currency: 'usd', stripe_price_id: 'pr' } }));
    const { stripe, requests } = fakeStripe({ '/v1/checkout/sessions': (p: any) => (p.mode ? { url: 'https://c.test/1' } : { data: [] }) });
    await createBillingCheckout(USER, TEAM, flow(store, stripe));
    const s = requests.find((q) => q.params?.mode)!;
    expect(s.params).toMatchObject({ billing_address_collection: 'required', automatic_tax: { enabled: true } });
  });

  it('refuses non-admins, a disabled switch and teams that already pay', async () => {
    const { stripe, requests } = fakeStripe({});
    await expect(createBillingCheckout(USER, TEAM, flow(fakeStore().store, stripe, { viewAsUser: async () => ({ state: 'trialing', can_manage: false }) }))).rejects.toThrow('not_authorized');
    await expect(createBillingCheckout(USER, TEAM, flow(fakeStore().store, stripe, { viewAsUser: async () => null }))).rejects.toThrow('not_authorized');
    await expect(createBillingCheckout(USER, TEAM, flow(fakeStore(ctx({ enabled: false, state: 'off' })).store, stripe))).rejects.toThrow('billing_disabled');
    for (const state of ['active', 'cancel_scheduled', 'comped'] as const)
      await expect(createBillingCheckout(USER, TEAM, flow(fakeStore(ctx({ state })).store, stripe))).rejects.toThrow('already_subscribed');
    expect(requests).toHaveLength(0);
  });
});

describe('portal, cancel, resume, reconcile', () => {
  it('opens the portal for the stored customer with a config-only return URL', async () => {
    const { store } = fakeStore(ctx({ stripe_customer_id: 'cus_9', state: 'active' }));
    const { stripe, requests } = fakeStripe({ '/v1/billing_portal/sessions': () => ({ url: 'https://portal.test/p' }) });
    expect(await createPortalSession(TEAM, flow(store, stripe))).toEqual({ url: 'https://portal.test/p' });
    expect(requests[0]!.params).toEqual({ customer: 'cus_9', return_url: `https://app.athleit.test/teams/${TEAM}/billing` });
    await expect(createPortalSession(TEAM, flow(fakeStore(ctx()).store, stripe))).rejects.toThrow('not_subscribed');
  });

  it('cancel sets cancel_at_period_end and applies the snapshot at once; resume reverses it; wrong state is refused', async () => {
    const { store, calls } = fakeStore(ctx({ state: 'active', stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1' }));
    const { stripe, requests } = fakeStripe({ '/v1/subscriptions/sub_1': (p: any) => sub({ cancel_at_period_end: p.cancel_at_period_end }) });
    const r = await updateSubscription(TEAM, 'cancel', flow(store, stripe));
    expect(r.state).toBe('cancel_scheduled');
    expect(requests[0]).toMatchObject({ method: 'post', params: { cancel_at_period_end: true } });
    expect(calls.applySnapshot[0].s.cancel_at_period_end).toBe(true);
    await expect(updateSubscription(TEAM, 'resume', flow(store, stripe))).rejects.toThrow('not_subscribed');
    const resume = fakeStore(ctx({ state: 'cancel_scheduled', stripe_subscription_id: 'sub_1' }));
    expect((await updateSubscription(TEAM, 'resume', flow(resume.store, stripe))).state).toBe('active');
  });

  it('reconcile refreshes every candidate, mirrors recent invoices and survives one failure', async () => {
    const { store, calls } = fakeStore(ctx(), { reconcileCandidates: async () => [{ team_id: TEAM, stripe_subscription_id: 'sub_1' }, { team_id: TEAM, stripe_subscription_id: 'sub_bad' }] });
    const { stripe } = fakeStripe({
      '/v1/subscriptions/sub_bad': () => { throw new Error('stripe_api_error'); },
      '/v1/subscriptions/': () => sub(),
      '/v1/invoices': () => ({ data: [{ id: 'in_1', status: 'paid', amount_due: 1000, amount_paid: 1000, currency: 'usd', created: 1_770_000_000 }] }),
    });
    const out = await reconcileBilling({ store, stripe, log, now: () => NOW });
    expect(out).toEqual({ checked: 2, applied: 1, stale: 0, errors: 1 });
    expect(calls.upsertInvoice).toHaveLength(1);
  });
});

describe('input schemas and parity', () => {
  const TEAM = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b'; // a real v4 uuid (zod 4 checks the version nibble)
  it('rejects any extra field, so a client can never send a price, amount or redirect', () => {
    expect(billingTeamInput.safeParse({ teamId: TEAM }).success).toBe(true);
    expect(billingTeamInput.safeParse({ teamId: TEAM, price: 1 }).success).toBe(false);
    expect(billingTeamInput.safeParse({ teamId: TEAM, success_url: 'https://evil.test' }).success).toBe(false);
    expect(updateSubscriptionInput.safeParse({ teamId: TEAM, action: 'cancel' }).success).toBe(true);
    expect(updateSubscriptionInput.safeParse({ teamId: TEAM, action: 'refund' }).success).toBe(false);
  });
  it('the Edge copy of the checkout trial math agrees with packages/core on every vector', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    for (const state of ['trialing', 'trial_expired', 'lapsed', 'active'] as const)
      for (const end of ['2025-12-31T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', '2026-01-03T00:10:00Z', '2026-01-10T00:00:00Z'])
        expect(edgeTrial(end, state, now)).toEqual(coreTrial(end, state, now));
  });
});

describe('billing notification content', () => {
  const row = (payload: any) => ({ id: 'n', profile_id: USER, category: 'billing', channel: 'push', attempts: 0, payload }) as any;
  it('deep links admins to the billing page and coaches and managers to the team', () => {
    expect(linkFor({ kind: 'billing', team_id: TEAM, audience: 'admin' })).toBe(`/teams/${TEAM}/billing`);
    expect(linkFor({ kind: 'billing', team_id: TEAM, audience: 'staff' })).toBe(`/teams/${TEAM}`);
  });
  it('shows the notice title and body as written (billing notices are never message previews)', () => {
    expect(buildContent(row({ kind: 'billing', team_id: TEAM, title: 'Payment failed', body: 'Update your payment method by Jan 8.' }))).toMatchObject({
      title: 'Payment failed',
      body: 'Update your payment method by Jan 8.',
    });
  });
});
