import { describe, expect, it, vi } from 'vitest';

import { chargeDueInstallments } from '../../../supabase/functions/_shared/payments/installments';
import { createPaymentIntent } from '../../../supabase/functions/_shared/payments/intents';
import { createPaymentIntentInput } from '../../../supabase/functions/_shared/payments/schemas';
import { StripeError } from '../../../supabase/functions/_shared/payments/stripe';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const reserve = (over: Record<string, unknown> = {}) => ({
  reused: false,
  payment_id: uuid(10),
  stripe_payment_intent_id: null,
  status: 'requires_payment_method',
  total_cents: 2575,
  application_fee_cents: 75,
  description: 'Season dues · PR-1 · installment 2 of 4',
  display_ids: ['PR-1'],
  request_set_key: 'abc12345',
  stripe_account_id: 'acct_team',
  household_id: uuid(2),
  connected_account_id: uuid(3),
  ...over,
});
const log = vi.fn();

function fakeStore(over: Record<string, unknown> = {}) {
  return {
    claimDueInstallments: vi.fn().mockResolvedValue([
      {
        installment_id: uuid(1),
        request_id: uuid(4),
        payer: uuid(5),
        household_id: uuid(2),
        customer: 'cus_1',
        payment_method: 'pm_1',
        attempt: 0,
      },
    ]),
    reserveInstallments: vi.fn().mockResolvedValue(reserve()),
    reservePlan: vi
      .fn()
      .mockResolvedValue(reserve({ setup_future_usage: true, plan_count: 4, autopay: true })),
    attachPaymentIntent: vi.fn().mockResolvedValue(undefined),
    installmentChargeFailed: vi.fn().mockResolvedValue('applied'),
    releasePayment: vi.fn().mockResolvedValue(undefined),
    getCustomer: vi.fn().mockResolvedValue(null),
    saveCustomer: vi.fn().mockResolvedValue(undefined),
    reservePayment: vi.fn(),
    ...over,
  } as any;
}

describe('input schema', () => {
  it('accepts requests, installments or a plan choice, and nothing with an amount', () => {
    expect(createPaymentIntentInput.safeParse({ requestIds: [uuid(1)] }).success).toBe(true);
    expect(createPaymentIntentInput.safeParse({ installmentIds: [uuid(1)] }).success).toBe(true);
    expect(
      createPaymentIntentInput.safeParse({ plan: { requestId: uuid(1), size: 4, autopay: true } })
        .success,
    ).toBe(true);
    expect(
      createPaymentIntentInput.safeParse({ plan: { requestId: uuid(1), size: 1, autopay: true } })
        .success,
    ).toBe(false);
    expect(
      createPaymentIntentInput.safeParse({ plan: { requestId: uuid(1), size: 7, autopay: true } })
        .success,
    ).toBe(false);
    expect(
      createPaymentIntentInput.safeParse({
        plan: { requestId: uuid(1), size: 3, autopay: true, amount: 1 },
      }).success,
    ).toBe(false);
    expect(createPaymentIntentInput.safeParse({ requestIds: [uuid(1)], amount: 5 }).success).toBe(
      false,
    );
    expect(createPaymentIntentInput.safeParse({ installmentIds: [uuid(1)], fee: 5 }).success).toBe(
      false,
    );
  });
});

describe('chargeDueInstallments', () => {
  it('charges off-session on the connected account with an idempotency key from the installment and attempt', async () => {
    const store = fakeStore();
    const post = vi.fn().mockResolvedValue({ id: 'pi_x', status: 'succeeded' });
    const out = await chargeDueInstallments({ store, stripe: { get: vi.fn(), post }, log });
    expect(out).toMatchObject({ claimed: 1, charged: 1, failed: 0 });
    expect(store.reserveInstallments).toHaveBeenCalledWith(uuid(5), [uuid(1)], true);
    const [path, params, key, acct] = post.mock.calls[0]!;
    expect(path).toBe('/v1/payment_intents');
    expect(params).toMatchObject({
      amount: 2575,
      currency: 'usd',
      application_fee_amount: 75,
      customer: 'cus_1',
      payment_method: 'pm_1',
      off_session: true,
      confirm: true,
    });
    expect(key).toBe(`athleit:inst:${uuid(1)}:0`);
    expect(acct).toBe('acct_team');
    expect(JSON.stringify(params)).not.toMatch(/Ava|Adams|@/); // ids only in metadata
    expect(store.attachPaymentIntent).toHaveBeenCalledWith(uuid(10), 'pi_x');
  });
  it('a retry uses a new key (the attempt number moved), so a declined charge can be tried again', async () => {
    const store = fakeStore({
      claimDueInstallments: vi.fn().mockResolvedValue([
        {
          installment_id: uuid(1),
          request_id: uuid(4),
          payer: uuid(5),
          household_id: uuid(2),
          customer: 'cus_1',
          payment_method: 'pm_1',
          attempt: 1,
        },
      ]),
    });
    const post = vi.fn().mockResolvedValue({ id: 'pi_y', status: 'succeeded' });
    await chargeDueInstallments({ store, stripe: { get: vi.fn(), post }, log });
    expect(post.mock.calls[0]![2]).toBe(`athleit:inst:${uuid(1)}:1`);
  });
  it('a declined card is recorded as a failed attempt and never throws or cancels anything', async () => {
    const store = fakeStore();
    const post = vi
      .fn()
      .mockRejectedValue(new StripeError(402, 'card_error', 'card_declined', 'declined'));
    const out = await chargeDueInstallments({ store, stripe: { get: vi.fn(), post }, log });
    expect(out).toMatchObject({ charged: 0, failed: 1, errors: 0 });
    expect(store.installmentChargeFailed).toHaveBeenCalledWith(uuid(10));
    expect(store.releasePayment).not.toHaveBeenCalled();
  });
  it('authentication required is a failed attempt too (the family gets a link to pay by hand)', async () => {
    const store = fakeStore();
    const post = vi
      .fn()
      .mockRejectedValue(new StripeError(402, 'card_error', 'authentication_required', 'auth'));
    const out = await chargeDueInstallments({ store, stripe: { get: vi.fn(), post }, log });
    expect(out.failed).toBe(1);
  });
  it('a Stripe outage releases the reservation and counts an error, not a failed attempt', async () => {
    const store = fakeStore();
    const post = vi.fn().mockRejectedValue(new StripeError(500, 'api_error', null, 'boom'));
    const out = await chargeDueInstallments({ store, stripe: { get: vi.fn(), post }, log });
    expect(out).toMatchObject({ failed: 0, errors: 1 });
    expect(store.releasePayment).toHaveBeenCalledWith(uuid(10));
    expect(store.installmentChargeFailed).not.toHaveBeenCalled();
  });
  it('skips a payment that already has an intent (a crashed run being retried)', async () => {
    const store = fakeStore({
      reserveInstallments: vi
        .fn()
        .mockResolvedValue(reserve({ reused: true, stripe_payment_intent_id: 'pi_exists' })),
    });
    const post = vi.fn();
    const out = await chargeDueInstallments({ store, stripe: { get: vi.fn(), post }, log });
    expect(out.skipped).toBe(1);
    expect(post).not.toHaveBeenCalled();
  });
  it('passes the test clock override to the claim', async () => {
    const store = fakeStore({ claimDueInstallments: vi.fn().mockResolvedValue([]) });
    await chargeDueInstallments(
      { store, stripe: { get: vi.fn(), post: vi.fn() }, log },
      { now: '2027-01-01T00:00:00Z' },
    );
    expect(store.claimDueInstallments).toHaveBeenCalledWith('2027-01-01T00:00:00Z', 25);
  });
});

describe('createPaymentIntent with a plan', () => {
  it('starts the plan, creates the customer on the connected account and asks Stripe to save the card for later', async () => {
    const store = fakeStore();
    const post = vi.fn().mockResolvedValueOnce({ id: 'cus_new' }).mockResolvedValueOnce({
      id: 'pi_new',
      client_secret: 'secret',
      status: 'requires_payment_method',
    });
    const r = await createPaymentIntent(
      uuid(5),
      { plan: { requestId: uuid(4), size: 4, autopay: true } },
      { store, stripe: { get: vi.fn(), post }, log },
      { ip: '203.0.113.5', userAgent: 'UA' },
    );
    expect(store.reservePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: uuid(5),
        requestId: uuid(4),
        size: 4,
        autopay: true,
        ip: '203.0.113.5',
        userAgent: 'UA',
      }),
    );
    expect(post.mock.calls[0]![0]).toBe('/v1/customers');
    expect(post.mock.calls[0]![3]).toBe('acct_team');
    expect(JSON.stringify(post.mock.calls[0]![1])).not.toMatch(/@|name/i);
    const piParams = post.mock.calls[1]![1];
    expect(piParams).toMatchObject({
      amount: 2575,
      customer: 'cus_new',
      setup_future_usage: 'off_session',
      application_fee_amount: 75,
    });
    expect(store.saveCustomer).toHaveBeenCalled();
    expect(r.clientSecret).toBe('secret');
  });
  it('a plan without autopay never touches customers or saves a card', async () => {
    const store = fakeStore({
      reservePlan: vi
        .fn()
        .mockResolvedValue(reserve({ plan_count: 3, autopay: false, setup_future_usage: false })),
    });
    const post = vi
      .fn()
      .mockResolvedValue({ id: 'pi_n', client_secret: 's', status: 'requires_payment_method' });
    await createPaymentIntent(
      uuid(5),
      { plan: { requestId: uuid(4), size: 3, autopay: false } },
      { store, stripe: { get: vi.fn(), post }, log },
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![1]).not.toHaveProperty('setup_future_usage');
    expect(post.mock.calls[0]![1]).not.toHaveProperty('customer');
  });
  it('reuses an existing customer', async () => {
    const store = fakeStore({ getCustomer: vi.fn().mockResolvedValue('cus_old') });
    const post = vi
      .fn()
      .mockResolvedValue({ id: 'pi_n', client_secret: 's', status: 'requires_payment_method' });
    await createPaymentIntent(
      uuid(5),
      { plan: { requestId: uuid(4), size: 4, autopay: true } },
      { store, stripe: { get: vi.fn(), post }, log },
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![1]).toMatchObject({ customer: 'cus_old' });
  });
  it('installment checkout goes through reserveInstallments', async () => {
    const store = fakeStore();
    const post = vi
      .fn()
      .mockResolvedValue({ id: 'pi_i', client_secret: 's', status: 'requires_payment_method' });
    await createPaymentIntent(
      uuid(5),
      { installmentIds: [uuid(1), uuid(2)] },
      { store, stripe: { get: vi.fn(), post }, log },
    );
    expect(store.reserveInstallments).toHaveBeenCalledWith(uuid(5), [uuid(1), uuid(2)]);
  });
});
