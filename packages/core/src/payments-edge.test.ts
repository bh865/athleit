/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for Stripe and the store are deliberately loose */
import { describe, expect, it, vi } from 'vitest';

import { cell, cents, toCsv } from '../../../supabase/functions/_shared/payments/csv';
import {
  applyPaymentIntent,
  handleStripeEvent,
} from '../../../supabase/functions/_shared/payments/handlers';
import { createPaymentIntent } from '../../../supabase/functions/_shared/payments/intents';
import { makeLogger, redact } from '../../../supabase/functions/_shared/payments/log';
import {
  connectOnboarding,
  onboardingUrls,
} from '../../../supabase/functions/_shared/payments/onboarding';
import { reconcile } from '../../../supabase/functions/_shared/payments/reconcile';
import { refundPayment } from '../../../supabase/functions/_shared/payments/refunds';
import {
  createPaymentIntentInput,
  exportInput,
  onboardingInput,
  refundInput,
} from '../../../supabase/functions/_shared/payments/schemas';
import {
  assertTestKey,
  encodeForm,
  signPayload,
  StripeApi,
  verifyStripeSignature,
} from '../../../supabase/functions/_shared/payments/stripe';
import { processWebhook } from '../../../supabase/functions/_shared/payments/webhook';

const SECRET = 'whsec_test_platform';
const CONNECT_SECRET = 'whsec_test_connect';
const PID = '11111111-1111-4111-8111-111111111111';
const quiet = () => {};

async function signed(body: object, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(body);
  return { raw, header: `t=${t},v1=${await signPayload(secret, t, raw)}` };
}

/** A recording store. Every method is a spy with a sensible default. */
function fakeStore(over: Record<string, unknown> = {}): any {
  const base: Record<string, any> = {
    rateLimit: vi.fn(async () => true),
    reservePayment: vi.fn(),
    attachPaymentIntent: vi.fn(async () => {}),
    releasePayment: vi.fn(async () => {}),
    paymentSucceeded: vi.fn(async () => 'applied'),
    paymentStatus: vi.fn(async () => 'applied'),
    refundEvent: vi.fn(async () => 'applied'),
    disputeEvent: vi.fn(async () => 'applied'),
    setAccountStatus: vi.fn(async () => 'applied'),
    ledgerEvent: vi.fn(async () => 'new'),
    finishEvent: vi.fn(async () => {}),
    attachRefund: vi.fn(async () => {}),
    failRefund: vi.fn(async () => {}),
    reconcileCandidates: vi.fn(),
    cleanupRateLimits: vi.fn(async () => {}),
    getConnectedAccount: vi.fn(async () => null),
    insertConnectedAccount: vi.fn(async () => {}),
  };
  return { ...base, ...over };
}

/** A Stripe fake with real idempotency-key semantics. */
function fakeStripe(responses: Record<string, any> = {}) {
  const created = new Map<string, any>();
  const calls: { method: string; path: string; params: any; key?: string }[] = [];
  let n = 0;
  return {
    calls,
    get: vi.fn(async (path: string, query?: any) => {
      calls.push({ method: 'GET', path, params: query });
      if (responses[path])
        return typeof responses[path] === 'function' ? responses[path](query) : responses[path];
      throw new Error(`unexpected GET ${path}`);
    }),
    post: vi.fn(async (path: string, params: any, key?: string) => {
      calls.push({ method: 'POST', path, params, key });
      if (key && created.has(key)) return created.get(key);
      if (responses[`POST ${path}`]) {
        const r =
          typeof responses[`POST ${path}`] === 'function'
            ? responses[`POST ${path}`](params)
            : responses[`POST ${path}`];
        if (key) created.set(key, r);
        return r;
      }
      n += 1;
      const r = {
        id: `pi_${n}`,
        status: 'requires_payment_method',
        client_secret: `pi_${n}_secret_x`,
        url: 'https://connect.stripe.com/setup/x',
      };
      if (key) created.set(key, r);
      return r;
    }),
  };
}

describe('Stripe webhook signature', () => {
  const body = '{"id":"evt_1","type":"x"}';
  const now = 1_800_000_000_000;
  const t = now / 1000;

  it('accepts a correctly signed body', async () => {
    const sig = `t=${t},v1=${await signPayload(SECRET, t, body)}`;
    expect(await verifyStripeSignature(body, sig, [SECRET], now)).toEqual({ ok: true });
  });
  it('accepts the Connect endpoint secret too', async () => {
    const sig = `t=${t},v1=${await signPayload(CONNECT_SECRET, t, body)}`;
    expect((await verifyStripeSignature(body, sig, [SECRET, CONNECT_SECRET], now)).ok).toBe(true);
  });
  it('rejects a wrong secret, a tampered body, a stale timestamp and malformed headers', async () => {
    const good = `t=${t},v1=${await signPayload(SECRET, t, body)}`;
    expect(
      (
        await verifyStripeSignature(
          body,
          `t=${t},v1=${await signPayload('whsec_other', t, body)}`,
          [SECRET],
          now,
        )
      ).ok,
    ).toBe(false);
    expect((await verifyStripeSignature(body + ' ', good, [SECRET], now)).ok).toBe(false);
    expect(await verifyStripeSignature(body, good, [SECRET], now + 10 * 60_000)).toEqual({
      ok: false,
      reason: 'timestamp_out_of_tolerance',
    });
    expect(await verifyStripeSignature(body, null, [SECRET], now)).toEqual({
      ok: false,
      reason: 'missing_header',
    });
    expect(await verifyStripeSignature(body, 'garbage', [SECRET], now)).toEqual({
      ok: false,
      reason: 'malformed_header',
    });
    expect(await verifyStripeSignature(body, good, [], now)).toEqual({
      ok: false,
      reason: 'no_secret',
    });
  });
  it('accepts when any one of several v1 signatures matches (key rotation)', async () => {
    const sig = `t=${t},v1=deadbeef,v1=${await signPayload(SECRET, t, body)}`;
    expect((await verifyStripeSignature(body, sig, [SECRET], now)).ok).toBe(true);
  });
});

describe('Stripe client safety', () => {
  it('refuses live keys and malformed keys, never echoing them', () => {
    expect(() => assertTestKey('sk_live_abc123')).toThrow('live_key_refused');
    expect(() => assertTestKey('rk_live_abc123')).toThrow('live_key_refused');
    expect(() => assertTestKey('pk_test_abc')).toThrow('stripe_key_invalid');
    expect(() => assertTestKey(undefined)).toThrow('stripe_key_missing');
    expect(assertTestKey('sk_test_abc123')).toBe('sk_test_abc123');
    try {
      assertTestKey('sk_live_SECRETVALUE');
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('SECRETVALUE');
    }
  });
  it('form-encodes nested params and sends the idempotency key', async () => {
    expect(encodeForm({ a: 1, m: { x: 'y z' }, l: [1, 2], n: undefined })).toBe(
      'a=1&m%5Bx%5D=y%20z&l%5B0%5D=1&l%5B1%5D=2',
    );
    const f = vi.fn(
      async (_u: string, _init: any) =>
        new Response(JSON.stringify({ id: 'pi_1' }), { status: 200 }),
    );
    const api = new StripeApi({ secretKey: 'sk_test_abc', fetch: f as any });
    await api.post('/v1/payment_intents', { amount: 100 }, 'key-1');
    const init = f.mock.calls[0]![1];
    expect(init.headers['idempotency-key']).toBe('key-1');
    expect(init.body).toBe('amount=100');
  });
  it('turns Stripe errors into type/code only (no message echo)', async () => {
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              type: 'card_error',
              code: 'card_declined',
              message: 'Your card 4242 was declined for Jane',
            },
          }),
          { status: 402 },
        ),
    );
    const api = new StripeApi({ secretKey: 'sk_test_abc', fetch: f as any });
    await expect(api.post('/v1/x', {})).rejects.toMatchObject({
      status: 402,
      code: 'card_declined',
      message: 'stripe_card_error',
    });
  });
});

describe('webhook processing', () => {
  const succeeded = {
    id: 'evt_1',
    type: 'payment_intent.succeeded',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'pi_A',
        object: 'payment_intent',
        status: 'succeeded',
        latest_charge: 'ch_A',
        metadata: { athleit_payment_id: PID },
      },
    },
  };
  const stripe = () =>
    fakeStripe({
      '/v1/charges/ch_A': {
        id: 'ch_A',
        balance_transaction: {
          fee_details: [
            { type: 'stripe_fee', amount: 170 },
            { type: 'application_fee', amount: 161 },
          ],
        },
      },
    });

  it('rejects a bad signature before touching the database', async () => {
    const store = fakeStore();
    const r = await processWebhook('{"id":"evt_1"}', 't=1,v1=bad', {
      secrets: [SECRET],
      store,
      stripe: stripe() as any,
      log: quiet,
    });
    expect(r.status).toBe(400);
    expect(Object.values(store).every((f: any) => !f.mock || f.mock.calls.length === 0)).toBe(true);
  });
  it('rejects live-mode events and non-events', async () => {
    const store = fakeStore();
    const live = await signed({ ...succeeded, livemode: true });
    expect(
      (
        await processWebhook(live.raw, live.header, {
          secrets: [SECRET],
          store,
          stripe: stripe() as any,
          log: quiet,
        })
      ).body,
    ).toEqual({ error: 'live_mode_refused' });
    const bad = await signed({ nope: 1 });
    expect(
      (
        await processWebhook(bad.raw, bad.header, {
          secrets: [SECRET],
          store,
          stripe: stripe() as any,
          log: quiet,
        })
      ).status,
    ).toBe(400);
    expect(store.ledgerEvent).not.toHaveBeenCalled();
  });
  it('writes the ledger first, records the ACTUAL fee from the balance transaction, then finishes', async () => {
    const store = fakeStore();
    const { raw, header } = await signed(succeeded);
    const r = await processWebhook(raw, header, {
      secrets: [SECRET],
      store,
      stripe: stripe() as any,
      log: quiet,
    });
    expect(r.status).toBe(200);
    expect(store.ledgerEvent.mock.invocationCallOrder[0]).toBeLessThan(
      store.paymentSucceeded.mock.invocationCallOrder[0],
    );
    expect(store.paymentSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({ pi: 'pi_A', paymentId: PID, charge: 'ch_A', stripeFee: 170 }),
    );
    expect(store.finishEvent).toHaveBeenCalledWith('evt_1');
    // the ledger payload is minimal: no metadata, no card or personal data
    expect(store.ledgerEvent.mock.calls[0][0].payload).toEqual({
      type: 'payment_intent.succeeded',
      object: 'payment_intent',
      object_id: 'pi_A',
    });
  });
  it('a duplicate delivery changes nothing', async () => {
    const store = fakeStore({ ledgerEvent: vi.fn(async () => 'duplicate') });
    const { raw, header } = await signed(succeeded);
    const r = await processWebhook(raw, header, {
      secrets: [SECRET],
      store,
      stripe: stripe() as any,
      log: quiet,
    });
    expect(r.body).toMatchObject({ duplicate: true });
    expect(store.paymentSucceeded).not.toHaveBeenCalled();
    expect(store.finishEvent).not.toHaveBeenCalled();
  });
  it('a retry of an unfinished event is processed again', async () => {
    const store = fakeStore({ ledgerEvent: vi.fn(async () => 'retry') });
    const { raw, header } = await signed(succeeded);
    expect(
      (
        await processWebhook(raw, header, {
          secrets: [SECRET],
          store,
          stripe: stripe() as any,
          log: quiet,
        })
      ).status,
    ).toBe(200);
    expect(store.paymentSucceeded).toHaveBeenCalledTimes(1);
  });
  it('a missing balance transaction does not fail the payment (reconcile fills the fee later)', async () => {
    const store = fakeStore();
    const s = fakeStripe({});
    const { raw, header } = await signed(succeeded);
    await processWebhook(raw, header, { secrets: [SECRET], store, stripe: s as any, log: quiet });
    expect(store.paymentSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({ pi: 'pi_A', paymentId: PID, charge: 'ch_A', stripeFee: null }),
    );
  });
  it('a failing handler answers 500 so Stripe retries, and records the error', async () => {
    const store = fakeStore({
      paymentSucceeded: vi.fn(async () => {
        throw new Error('db_down');
      }),
    });
    const { raw, header } = await signed(succeeded);
    const r = await processWebhook(raw, header, {
      secrets: [SECRET],
      store,
      stripe: stripe() as any,
      log: quiet,
    });
    expect(r.status).toBe(500);
    expect(store.finishEvent).toHaveBeenCalledWith('evt_1', 'db_down');
  });
  it('an unknown payment is retried while young and given up on when old', async () => {
    const store = fakeStore({ paymentSucceeded: vi.fn(async () => 'unknown_payment') });
    const young = await signed(succeeded);
    expect(
      (
        await processWebhook(young.raw, young.header, {
          secrets: [SECRET],
          store,
          stripe: stripe() as any,
          log: quiet,
        })
      ).status,
    ).toBe(500);
    const oldEvent = {
      ...succeeded,
      id: 'evt_old',
      created: Math.floor(Date.now() / 1000) - 2 * 3600,
    };
    const old = await signed(oldEvent);
    const r = await processWebhook(old.raw, old.header, {
      secrets: [SECRET],
      store,
      stripe: stripe() as any,
      log: quiet,
    });
    expect(r.status).toBe(200);
    expect(store.finishEvent).toHaveBeenLastCalledWith('evt_old', 'unknown_payment', true);
  });
  it('out-of-order delivery: a refund before success is handed to the converging handler with the charge id', async () => {
    const store = fakeStore();
    const s = fakeStripe({
      '/v1/refunds': { data: [{ id: 're_1', amount: 1000, status: 'succeeded' }] },
    });
    const ev = {
      id: 'evt_r',
      type: 'charge.refunded',
      livemode: false,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: { id: 'ch_A', payment_intent: 'pi_A', metadata: { athleit_payment_id: PID } },
      },
    };
    const { raw, header } = await signed(ev);
    await processWebhook(raw, header, { secrets: [SECRET], store, stripe: s as any, log: quiet });
    expect(store.refundEvent).toHaveBeenCalledWith({
      pi: 'pi_A',
      refunds: [{ id: 're_1', amount: 1000, status: 'succeeded' }],
      paymentId: PID,
      charge: 'ch_A',
    });
  });
  it('maps failure, cancel, processing, disputes and account events', async () => {
    const store = fakeStore();
    const d = { store, stripe: fakeStripe() as any };
    await handleStripeEvent(
      { type: 'payment_intent.payment_failed', data: { object: { id: 'pi_A', metadata: {} } } },
      d,
    );
    expect(store.paymentStatus).toHaveBeenLastCalledWith({
      pi: 'pi_A',
      status: 'failed',
      paymentId: undefined,
    });
    await handleStripeEvent(
      { type: 'payment_intent.canceled', data: { object: { id: 'pi_A', status: 'canceled' } } },
      d,
    );
    expect(store.paymentStatus).toHaveBeenLastCalledWith({
      pi: 'pi_A',
      status: 'canceled',
      paymentId: undefined,
    });
    await handleStripeEvent(
      { type: 'payment_intent.processing', data: { object: { id: 'pi_A', status: 'processing' } } },
      d,
    );
    expect(store.paymentStatus).toHaveBeenLastCalledWith({
      pi: 'pi_A',
      status: 'processing',
      paymentId: undefined,
    });
    await handleStripeEvent(
      { type: 'charge.dispute.created', data: { object: { id: 'dp_1', payment_intent: 'pi_A' } } },
      d,
    );
    expect(store.disputeEvent).toHaveBeenLastCalledWith({
      pi: 'pi_A',
      disputeId: 'dp_1',
      phase: 'created',
      outcome: undefined,
    });
    await handleStripeEvent(
      {
        type: 'charge.dispute.closed',
        data: { object: { id: 'dp_1', payment_intent: 'pi_A', status: 'won' } },
      },
      d,
    );
    expect(store.disputeEvent).toHaveBeenLastCalledWith({
      pi: 'pi_A',
      disputeId: 'dp_1',
      phase: 'closed',
      outcome: 'won',
    });
    await handleStripeEvent(
      {
        type: 'account.updated',
        data: {
          object: {
            id: 'acct_1',
            details_submitted: true,
            charges_enabled: true,
            payouts_enabled: false,
            requirements: { currently_due: [] },
          },
        },
      },
      d,
    );
    expect(store.setAccountStatus).toHaveBeenLastCalledWith({
      stripeAccountId: 'acct_1',
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: false,
      requirements: { currently_due: [] },
    });
    await handleStripeEvent(
      { type: 'account.application.deauthorized', account: 'acct_1', data: { object: {} } },
      d,
    );
    expect(store.setAccountStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        stripeAccountId: 'acct_1',
        deauthorized: true,
        chargesEnabled: false,
      }),
    );
    expect(await handleStripeEvent({ type: 'customer.created', data: { object: {} } }, d)).toBe(
      'ignored',
    );
  });
  it('ignores a forged payment id in metadata that is not a uuid', async () => {
    const store = fakeStore();
    await applyPaymentIntent(
      {
        id: 'pi_A',
        status: 'processing',
        metadata: { athleit_payment_id: "x'; drop table payments;--" },
      },
      { store, stripe: fakeStripe() as any },
    );
    expect(store.paymentStatus).toHaveBeenCalledWith({
      pi: 'pi_A',
      status: 'processing',
      paymentId: undefined,
    });
  });
});

describe('create-payment-intent', () => {
  const reservation = (o: object = {}) => ({
    reused: false,
    payment_id: PID,
    stripe_payment_intent_id: null,
    status: 'requires_payment_method',
    total_cents: 4666,
    application_fee_cents: 166,
    description: 'Jersey fee · PR-3317',
    display_ids: ['PR-3317'],
    request_set_key: 'abc12345',
    stripe_account_id: 'acct_X',
    ...o,
  });

  it('accepts only request ids: any client-supplied amount, fee or destination is rejected', () => {
    const id = '22222222-2222-4222-8222-222222222222';
    expect(createPaymentIntentInput.safeParse({ requestIds: [id] }).success).toBe(true);
    for (const extra of [
      { amount: 1 },
      { amountCents: 1 },
      { destination: 'acct_evil' },
      { application_fee: 0 },
      { feePolicy: 'absorb' },
    ]) {
      expect(createPaymentIntentInput.safeParse({ requestIds: [id], ...extra }).success).toBe(
        false,
      );
    }
    expect(createPaymentIntentInput.safeParse({ requestIds: [] }).success).toBe(false);
    expect(createPaymentIntentInput.safeParse({ requestIds: ['nope'] }).success).toBe(false);
    expect(createPaymentIntentInput.safeParse({ requestIds: Array(26).fill(id) }).success).toBe(
      false,
    );
  });
  it('charges exactly what the database computed, to the connected account, with an idempotency key and id-only metadata', async () => {
    const store = fakeStore({ reservePayment: vi.fn(async () => reservation()) });
    const s = fakeStripe();
    const r = await createPaymentIntent('user-1', ['22222222-2222-4222-8222-222222222222'], {
      store,
      stripe: s as any,
      log: quiet,
    });
    const call = s.calls.find((c) => c.path === '/v1/payment_intents')!;
    expect(call.params).toMatchObject({
      amount: 4666,
      currency: 'usd',
      application_fee_amount: 166,
      transfer_data: { destination: 'acct_X' },
      on_behalf_of: 'acct_X',
      description: 'Jersey fee · PR-3317',
    });
    expect(call.key).toBe(`athleit:pi:${PID}`);
    expect(call.params.metadata).toEqual({
      athleit_payment_id: PID,
      request_set_key: 'abc12345',
      display_ids: 'PR-3317',
    });
    expect(store.attachPaymentIntent).toHaveBeenCalledWith(PID, 'pi_1');
    expect(r).toMatchObject({
      paymentId: PID,
      clientSecret: 'pi_1_secret_x',
      totalCents: 4666,
      reused: false,
    });
  });
  it('re-calling with the same set reuses the open intent instead of creating a second', async () => {
    const store = fakeStore({
      reservePayment: vi.fn(async () =>
        reservation({ reused: true, stripe_payment_intent_id: 'pi_open' }),
      ),
    });
    const s = fakeStripe({
      '/v1/payment_intents/pi_open': {
        id: 'pi_open',
        status: 'requires_payment_method',
        client_secret: 'secret_open',
      },
    });
    const r = await createPaymentIntent('user-1', ['22222222-2222-4222-8222-222222222222'], {
      store,
      stripe: s as any,
      log: quiet,
    });
    expect(s.post).not.toHaveBeenCalled();
    expect(r.clientSecret).toBe('secret_open');
  });
  it('two simultaneous calls produce ONE intent (same payment id -> same idempotency key)', async () => {
    const store = fakeStore({
      reservePayment: vi
        .fn()
        .mockResolvedValueOnce(reservation())
        .mockResolvedValueOnce(reservation({ reused: true })),
    });
    const s = fakeStripe();
    const ids = ['22222222-2222-4222-8222-222222222222'];
    const [a, b] = await Promise.all([
      createPaymentIntent('u', ids, { store, stripe: s as any, log: quiet }),
      createPaymentIntent('u', ids, { store, stripe: s as any, log: quiet }),
    ]);
    expect(a.clientSecret).toBe(b.clientSecret);
    const keys = new Set(s.calls.filter((c) => c.method === 'POST').map((c) => c.key));
    expect(keys.size).toBe(1);
  });
  it('an already-succeeded intent is reported, not re-confirmable', async () => {
    const store = fakeStore({
      reservePayment: vi.fn(async () =>
        reservation({ reused: true, stripe_payment_intent_id: 'pi_done' }),
      ),
    });
    const s = fakeStripe({ '/v1/payment_intents/pi_done': { id: 'pi_done', status: 'succeeded' } });
    const r = await createPaymentIntent('u', ['22222222-2222-4222-8222-222222222222'], {
      store,
      stripe: s as any,
      log: quiet,
    });
    expect(r).toMatchObject({ status: 'succeeded', clientSecret: null });
  });
  it('an intent canceled at Stripe is synced and the caller is told to retry', async () => {
    const store = fakeStore({
      reservePayment: vi.fn(async () =>
        reservation({ reused: true, stripe_payment_intent_id: 'pi_c' }),
      ),
    });
    const s = fakeStripe({ '/v1/payment_intents/pi_c': { id: 'pi_c', status: 'canceled' } });
    await expect(
      createPaymentIntent('u', ['22222222-2222-4222-8222-222222222222'], {
        store,
        stripe: s as any,
        log: quiet,
      }),
    ).rejects.toThrow('request_not_payable');
    expect(store.paymentStatus).toHaveBeenCalledWith({
      pi: 'pi_c',
      status: 'canceled',
      paymentId: PID,
    });
  });
  it('releases the reservation when Stripe refuses to create the intent', async () => {
    const store = fakeStore({ reservePayment: vi.fn(async () => reservation()) });
    const s = fakeStripe({
      'POST /v1/payment_intents': () => {
        throw new Error('stripe_api_error');
      },
    });
    await expect(
      createPaymentIntent('u', ['22222222-2222-4222-8222-222222222222'], {
        store,
        stripe: s as any,
        log: quiet,
      }),
    ).rejects.toThrow('stripe_api_error');
    expect(store.releasePayment).toHaveBeenCalledWith(PID);
  });
  it('database refusals (another family, cancelled, waived, paid, processing) propagate and nothing is sent to Stripe', async () => {
    for (const code of ['not_authorized', 'request_not_payable', 'mixed_checkout']) {
      const store = fakeStore({
        reservePayment: vi.fn(async () => {
          throw new Error(code);
        }),
      });
      const s = fakeStripe();
      await expect(
        createPaymentIntent('u', ['22222222-2222-4222-8222-222222222222'], {
          store,
          stripe: s as any,
          log: quiet,
        }),
      ).rejects.toThrow(code);
      expect(s.post).not.toHaveBeenCalled();
    }
  });
});

describe('connect onboarding', () => {
  const owner = { teamId: '33333333-3333-4333-8333-333333333333' };
  it('only issuer admins (database decision) may start it', async () => {
    const store = fakeStore();
    await expect(
      connectOnboarding('u', owner, 'web', 'link', {
        store,
        stripe: fakeStripe() as any,
        log: quiet,
        canManage: async () => false,
        appUrl: 'https://app.test',
        appScheme: 'athleit',
      }),
    ).rejects.toThrow('not_authorized');
    expect(store.insertConnectedAccount).not.toHaveBeenCalled();
  });
  it('creates an Express account once, stores it, and returns an Account Link built from configuration', async () => {
    const store = fakeStore();
    const s = fakeStripe({
      '/v1/accounts/acct_new': {
        id: 'acct_new',
        details_submitted: false,
        charges_enabled: false,
        payouts_enabled: false,
        requirements: {},
      },
      'POST /v1/accounts': { id: 'acct_new' },
      'POST /v1/account_links': { url: 'https://connect.stripe.com/setup/s/abc' },
    });
    const r = await connectOnboarding('u', owner, 'mobile', 'link', {
      store,
      stripe: s as any,
      log: quiet,
      canManage: async () => true,
      appUrl: 'https://app.test',
      appScheme: 'athleit',
    });
    expect(r.url).toBe('https://connect.stripe.com/setup/s/abc');
    const create = s.calls.find((c) => c.path === '/v1/accounts')!;
    expect(create.params).toMatchObject({
      type: 'express',
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    });
    expect(create.params.metadata).toEqual({ athleit_owner: `team:${owner.teamId}` });
    expect(create.key).toBe(`athleit:acct:team:${owner.teamId}`);
    expect(store.insertConnectedAccount).toHaveBeenCalledWith(owner, 'acct_new', 'u');
    const link = s.calls.find((c) => c.path === '/v1/account_links')!;
    expect(link.params.return_url).toBe(`athleit://payments/connect/return?team=${owner.teamId}`);
  });
  it('an existing account is reused and its status synced (no second account)', async () => {
    const store = fakeStore({
      getConnectedAccount: vi.fn(async () => ({ stripeAccountId: 'acct_old' })),
    });
    const s = fakeStripe({
      '/v1/accounts/acct_old': {
        id: 'acct_old',
        details_submitted: true,
        charges_enabled: true,
        payouts_enabled: true,
        requirements: {},
      },
    });
    const r = await connectOnboarding('u', owner, 'web', 'sync', {
      store,
      stripe: s as any,
      log: quiet,
      canManage: async () => true,
      appUrl: 'https://app.test',
      appScheme: 'athleit',
    });
    expect(r.onboardingStatus).toBe('ready');
    expect(s.post).not.toHaveBeenCalled();
    expect(store.setAccountStatus).toHaveBeenCalled();
  });
  it('redirect targets cannot come from the client', () => {
    expect(
      onboardingInput.safeParse({ teamId: owner.teamId, return_url: 'https://evil.test' }).success,
    ).toBe(false);
    expect(onboardingInput.safeParse({ teamId: owner.teamId, clubId: owner.teamId }).success).toBe(
      false,
    );
    expect(onboardingInput.safeParse({}).success).toBe(false);
    expect(onboardingUrls(owner, 'web', 'https://app.test/', 'athleit').return_url).toBe(
      `https://app.test/payments/connect/return?team=${owner.teamId}`,
    );
  });
});

describe('refund-payment', () => {
  const plan = {
    payment_id: PID,
    stripe_payment_intent_id: 'pi_A',
    stripe_account_id: 'acct_X',
    refunds: [
      { refund_id: 'r1', amount_cents: 1000, refund_application_fee: false },
      { refund_id: 'r2', amount_cents: 2764, refund_application_fee: true },
    ],
  };
  it('sends exactly what the database allowed, idempotently, and records Stripe ids', async () => {
    const store = fakeStore();
    const s = fakeStripe({
      'POST /v1/refunds': (p: any) => ({ id: `re_${p.amount}`, status: 'pending' }),
    });
    const r = await refundPayment(
      { paymentId: PID },
      { store, stripe: s as any, log: quiet, prepare: async () => plan },
    );
    expect(
      s.calls.map((c) => [
        c.params.amount,
        c.params.refund_application_fee,
        c.params.reverse_transfer,
        c.key,
      ]),
    ).toEqual([
      [1000, false, true, 'athleit:rf:r1'],
      [2764, true, true, 'athleit:rf:r2'],
    ]);
    expect(store.attachRefund).toHaveBeenCalledWith('r1', 're_1000', 'pending');
    expect(r).toHaveLength(2);
  });
  it('the database refuses non-admins before anything reaches Stripe', async () => {
    const s = fakeStripe();
    await expect(
      refundPayment(
        { paymentId: PID },
        {
          store: fakeStore(),
          stripe: s as any,
          log: quiet,
          prepare: async () => {
            throw new Error('not_authorized');
          },
        },
      ),
    ).rejects.toThrow('not_authorized');
    expect(s.post).not.toHaveBeenCalled();
  });
  it('a Stripe failure marks that refund failed so the amount is available again', async () => {
    const store = fakeStore();
    const s = fakeStripe({
      'POST /v1/refunds': () => {
        throw new Error('stripe_invalid_request_error');
      },
    });
    await expect(
      refundPayment(
        { paymentId: PID },
        { store, stripe: s as any, log: quiet, prepare: async () => plan },
      ),
    ).rejects.toThrow();
    expect(store.failRefund).toHaveBeenCalledWith('r1');
  });
  it('validates input strictly', () => {
    expect(refundInput.safeParse({ paymentId: PID, baseCents: 1.5 }).success).toBe(false);
    expect(refundInput.safeParse({ paymentId: PID, baseCents: -5 }).success).toBe(false);
    expect(refundInput.safeParse({ paymentId: PID, destination: 'acct_evil' }).success).toBe(false);
    expect(exportInput.safeParse({ eventId: PID }).success).toBe(true);
  });
});

describe('reconcile-payments (mocked Stripe)', () => {
  it('repairs stuck payments, voids abandoned and canceled intents, fills fees, syncs accounts and replays stuck events', async () => {
    const store = fakeStore({
      reconcileCandidates: vi.fn(async () => ({
        open_payments: [
          { id: 'p1', pi: 'pi_stuck', status: 'processing', abandoned: false },
          { id: 'p2', pi: 'pi_abandoned', status: 'requires_payment_method', abandoned: true },
        ],
        canceled_payments: [{ id: 'p3', pi: 'pi_cancel_me' }],
        missing_fee: [{ id: 'p4', pi: 'pi_nofee' }],
        accounts: ['acct_1'],
        stuck_events: [{ id: 'evt_stuck', account: null }],
      })),
    });
    const s = fakeStripe({
      '/v1/payment_intents/pi_stuck': {
        id: 'pi_stuck',
        status: 'succeeded',
        latest_charge: 'ch_s',
        metadata: {},
      },
      '/v1/charges/ch_s': {
        balance_transaction: { fee_details: [{ type: 'stripe_fee', amount: 99 }] },
      },
      '/v1/payment_intents/pi_abandoned': {
        id: 'pi_abandoned',
        status: 'requires_payment_method',
        metadata: {},
      },
      'POST /v1/payment_intents/pi_abandoned/cancel': {
        id: 'pi_abandoned',
        status: 'canceled',
        metadata: {},
      },
      '/v1/payment_intents/pi_cancel_me': { id: 'pi_cancel_me', status: 'requires_payment_method' },
      'POST /v1/payment_intents/pi_cancel_me/cancel': { id: 'pi_cancel_me', status: 'canceled' },
      '/v1/payment_intents/pi_nofee': {
        id: 'pi_nofee',
        status: 'succeeded',
        latest_charge: 'ch_n',
      },
      '/v1/charges/ch_n': {
        balance_transaction: { fee_details: [{ type: 'stripe_fee', amount: 42 }] },
      },
      '/v1/accounts/acct_1': {
        id: 'acct_1',
        details_submitted: true,
        charges_enabled: true,
        payouts_enabled: true,
        requirements: {},
      },
      '/v1/events/evt_stuck': {
        id: 'evt_stuck',
        type: 'payment_intent.processing',
        livemode: false,
        data: { object: { id: 'pi_x', status: 'processing' } },
      },
    });
    const out = await reconcile({ store, stripe: s as any, log: quiet });
    expect(store.paymentSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({ pi: 'pi_stuck', stripeFee: 99 }),
    );
    expect(store.paymentSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({ pi: 'pi_nofee', stripeFee: 42 }),
    );
    expect(store.paymentStatus).toHaveBeenCalledWith(
      expect.objectContaining({ pi: 'pi_abandoned', status: 'canceled' }),
    );
    expect(s.calls.some((c) => c.path === '/v1/payment_intents/pi_cancel_me/cancel')).toBe(true);
    expect(store.setAccountStatus).toHaveBeenCalledWith(
      expect.objectContaining({ stripeAccountId: 'acct_1', chargesEnabled: true }),
    );
    expect(store.finishEvent).toHaveBeenCalledWith('evt_stuck');
    expect(out).toMatchObject({
      payments: 2,
      abandoned: 1,
      voided: 1,
      fees: 1,
      accounts: 1,
      events: 1,
      errors: 0,
    });
  });
  it('one failing item does not stop the rest', async () => {
    const store = fakeStore({
      reconcileCandidates: vi.fn(async () => ({
        open_payments: [{ id: 'a', pi: 'pi_bad', status: 'processing', abandoned: false }],
        canceled_payments: [],
        missing_fee: [],
        accounts: ['acct_ok'],
        stuck_events: [],
      })),
    });
    const s = fakeStripe({
      '/v1/payment_intents/pi_bad': () => {
        throw new Error('stripe_api_error');
      },
      '/v1/accounts/acct_ok': { id: 'acct_ok', requirements: {} },
    });
    const out = await reconcile({ store, stripe: s as any, log: quiet });
    expect(out).toMatchObject({ errors: 1, accounts: 1 });
  });
});

describe('logging and export hygiene', () => {
  it('redacts secrets and personal fields, truncates long values, and never prints bodies', () => {
    const lines: string[] = [];
    const log = makeLogger('t', (l) => lines.push(l));
    log('info', 'x', {
      client_secret: 'pi_1_secret_abc',
      email: 'a@b.c',
      display_name: 'Jane',
      stripe_signature: 'v1=abc',
      payload: { card: 4242 },
      id: 'pi_1',
      note: 'x'.repeat(500),
    });
    const out = lines[0]!;
    expect(out).not.toMatch(/secret_abc|a@b\.c|Jane|v1=abc|4242/);
    expect(out).toContain('"id":"pi_1"');
    expect(JSON.parse(out).note.length).toBeLessThan(250);
    expect(redact({ nested: { api_key: 'sk_test_x' } })).toEqual({
      nested: { api_key: '[redacted]' },
    });
  });
  it('CSV: integer-cent money, quoting, and spreadsheet-formula neutralisation', () => {
    expect(cents(4500)).toBe('45.00');
    expect(cents(5)).toBe('0.05');
    expect(cents(null)).toBe('');
    expect(cell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(cell('+1')).toBe(`"'+1"`);
    expect(cell('a "b", c')).toBe('"a ""b"", c"');
    const csv = toCsv([
      {
        household_name: 'Adams family',
        player_name: '=cmd|x',
        display_id: 'PR-1',
        status: 'paid',
        due_at: null,
        paid_at: null,
        paid_via: 'card',
        receipt_display_id: 'RCP-1',
        base_cents: 4500,
        athleit_charge_cents: 95,
        service_fee_cents: 169,
        total_charged_cents: 4764,
        refunded_cents: 0,
      },
    ]);
    const [head, row] = csv.trim().split('\r\n');
    expect(head).toContain('"Receipt ID"');
    expect(row).toContain(`"'=cmd|x"`);
    expect(row).toContain('"47.64"');
    expect(csv).not.toMatch(/card_number|pan|cvc/i);
  });
});

describe('review hardening', () => {
  const evt = (over: object = {}) => ({
    id: 'evt_h',
    type: 'payment_intent.succeeded',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'pi_H',
        status: 'succeeded',
        amount: 4500,
        currency: 'usd',
        application_fee_amount: 161,
        transfer_data: { destination: 'acct_X' },
        latest_charge: 'ch_H',
        metadata: { athleit_payment_id: PID },
      },
    },
    ...over,
  });
  const stripe = () =>
    fakeStripe({ '/v1/charges/ch_H': { balance_transaction: { fee_details: [] } } });

  it('passes amount, currency, destination and application fee so the database can refuse a mismatch', async () => {
    const store = fakeStore();
    await handleStripeEvent(evt(), { store, stripe: stripe() as any });
    expect(store.paymentSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 4500,
        currency: 'usd',
        destination: 'acct_X',
        applicationFee: 161,
      }),
    );
  });
  it('a mismatch is refused, recorded as final, never retried, and applies nothing', async () => {
    const store = fakeStore({
      paymentSucceeded: vi.fn(async () => {
        throw new Error('payment_mismatch');
      }),
    });
    const { raw, header } = await signed(evt());
    const r = await processWebhook(raw, header, {
      secrets: [SECRET],
      store,
      stripe: stripe() as any,
      log: quiet,
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ refused: 'payment_mismatch' });
    expect(store.finishEvent).toHaveBeenCalledWith('evt_h', 'payment_mismatch', true);
  });
  it('payment events scoped to a connected account are ignored', async () => {
    const store = fakeStore();
    expect(
      await handleStripeEvent(evt({ account: 'acct_other' }), { store, stripe: stripe() as any }),
    ).toBe('ignored');
    expect(store.paymentSucceeded).not.toHaveBeenCalled();
  });
  it('an unknown payment that is not ours (no athleit metadata) is acknowledged, not retried for an hour', async () => {
    const store = fakeStore({ paymentSucceeded: vi.fn(async () => 'unknown_payment') });
    const e = evt();
    (e.data.object as any).metadata = {};
    const { raw, header } = await signed(e);
    const r = await processWebhook(raw, header, {
      secrets: [SECRET],
      store,
      stripe: stripe() as any,
      log: quiet,
    });
    expect(r.status).toBe(200);
  });
  it('refund events carry our refund id from metadata so the reserved row is adopted, not duplicated', async () => {
    const store = fakeStore();
    const s = fakeStripe({
      '/v1/refunds': {
        data: [
          { id: 're_1', amount: 1000, status: 'succeeded', metadata: { athleit_refund_id: 'abc' } },
        ],
      },
    });
    await handleStripeEvent(
      { type: 'charge.refunded', data: { object: { id: 'ch_A', payment_intent: 'pi_A' } } },
      { store, stripe: s as any },
    );
    expect(store.refundEvent.mock.calls[0][0].refunds[0]).toEqual({
      id: 're_1',
      amount: 1000,
      status: 'succeeded',
      ref: 'abc',
    });
  });
  it('a refund Stripe accepted is never marked failed, even if recording its id fails', async () => {
    const store = fakeStore({
      attachRefund: vi.fn(async () => {
        throw new Error('db_blip');
      }),
    });
    const s = fakeStripe({ 'POST /v1/refunds': { id: 're_ok', status: 'pending' } });
    const plan = {
      payment_id: PID,
      stripe_payment_intent_id: 'pi_A',
      stripe_account_id: 'acct_X',
      refunds: [{ refund_id: 'r1', amount_cents: 500, refund_application_fee: false }],
    };
    const out = await refundPayment(
      { paymentId: PID },
      { store, stripe: s as any, log: quiet, prepare: async () => plan },
    );
    expect(out).toHaveLength(1);
    expect(store.failRefund).not.toHaveBeenCalled();
  });
  it('reconcile re-fetches Connect-scoped events as that account and counts failures', async () => {
    const store = fakeStore({
      reconcileCandidates: vi.fn(async () => ({
        open_payments: [],
        canceled_payments: [],
        missing_fee: [],
        accounts: [],
        stuck_events: [{ id: 'evt_c', account: 'acct_c' }],
      })),
    });
    const s = fakeStripe({
      '/v1/events/evt_c': () => {
        throw new Error('stripe_invalid_request_error');
      },
    });
    const out = await reconcile({ store, stripe: s as any, log: quiet });
    expect(s.get).toHaveBeenCalledWith('/v1/events/evt_c', undefined, 'acct_c');
    expect(store.finishEvent).toHaveBeenCalledWith('evt_c', 'refetch_failed');
    expect(out.errors).toBe(1);
  });
});
