#!/usr/bin/env node
// Stripe TEST-MODE integration check for the payment flow's money mechanics. Not part of CI (needs real test keys).
//
//   STRIPE_SECRET_KEY=sk_test_... CONNECTED_ACCOUNT=acct_... node scripts/payments-integration.mjs
//
// CONNECTED_ACCOUNT must be a test account created by connect-onboarding that finished onboarding in test mode (charges_enabled).
// It exercises exactly what create-payment-intent / refund-payment send: a DIRECT charge created on the connected account
// (Stripe-Account header) with an application fee that is only the Athleit charge, then verifies the actual Stripe fee on
// the connected account's balance transaction (paid by the account, not Athleit), a decline, 3D Secure, and refunds.
// It then runs a 3-installment plan: first charge with the card saved for later, two off-session charges, a declined and an
// authentication-required saved card, a refund across two installments, and prints the manual webhook-replay check.
// The account must have been created with controller.fees.payer=account (connect-onboarding does this). Refuses live keys.
const key = process.env.STRIPE_SECRET_KEY ?? '';
const acct = process.env.CONNECTED_ACCOUNT ?? '';
if (/^(sk|rk)_live_/.test(key)) {
  console.error('Refusing a live key.');
  process.exit(2);
}
if (/\.\.\.|XXXX|<|>/.test(key + acct) || key.length < 30 || acct.length < 10) {
  console.error('STRIPE_SECRET_KEY or CONNECTED_ACCOUNT still looks like a placeholder. Use the real values (see docs/payments-e2e-todo.md).');
  process.exit(2);
}
if (!/^(sk|rk)_test_/.test(key) || !/^acct_/.test(acct)) {
  console.error('Set STRIPE_SECRET_KEY (test) and CONNECTED_ACCOUNT.');
  process.exit(2);
}

const enc = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? enc(v, p ? `${p}[${k}]` : k)
      : [`${encodeURIComponent(p ? `${p}[${k}]` : k)}=${encodeURIComponent(v)}`],
  );
async function api(method, path, params = {}, idem, onAccount = acct) {
  const qs = method === 'GET' && Object.keys(params).length ? `?${enc(params).join('&')}` : '';
  const res = await fetch(`https://api.stripe.com${path}${qs}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...(idem ? { 'idempotency-key': idem } : {}),
      // Direct charges live ON the connected account: every call for them carries Stripe-Account.
      ...(onAccount ? { 'stripe-account': onAccount } : {}),
    },
    body: method === 'POST' ? enc(params).join('&') : undefined,
  });
  const j = await res.json();
  if (!res.ok) {
    const e = new Error(`${path}: ${j.error?.code ?? j.error?.type}`);
    e.stripe = j.error;
    throw e;
  }
  return j;
}
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`);
  if (!ok) failed++;
};
const run = Date.now();

async function charge(label, pm, total, appFee) {
  const pi = await api(
    'POST',
    '/v1/payment_intents',
    {
      amount: total,
      currency: 'usd',
      application_fee_amount: appFee,
      payment_method: pm,
      confirm: 'true',
      automatic_payment_methods: { enabled: 'true', allow_redirects: 'never' },
      description: `integration ${label}`,
      metadata: { athleit_payment_id: `itest-${run}-${label}` },
    },
    `itest:${run}:${label}`,
  );
  return pi;
}

// 1. Visa 4242: $45.00 absorb with a 50c Athleit charge. Stripe's fee comes out of the TEAM's side, not Athleit's.
const ok = await charge('visa', 'pm_card_visa', 4545, 45);
check('4242 succeeds', ok.status === 'succeeded', ok.status);
check('the intent lives on the connected account', !ok.transfer_data && !ok.on_behalf_of);
check(
  'application fee is only the Athleit charge',
  ok.application_fee_amount === 45,
  `fee=${ok.application_fee_amount}`,
);
const ch = await api('GET', `/v1/charges/${ok.latest_charge}`, {
  'expand[]': 'balance_transaction',
});
const stripeFee = (ch.balance_transaction.fee_details ?? [])
  .filter((d) => d.type === 'stripe_fee')
  .reduce((a, d) => a + d.amount, 0);
console.log(
  '     actual Stripe fee (cents):',
  stripeFee,
  '| fee_details:',
  JSON.stringify(ch.balance_transaction.fee_details),
);
check(
  'the connected account (not the platform) bears the Stripe fee',
  stripeFee > 0 && ch.balance_transaction.net === 4545 - stripeFee - 45,
  `net=${ch.balance_transaction.net}`,
);

// 2. Idempotency: same key, same intent
const again = await charge('visa', 'pm_card_visa', 4545, 45);
check('same idempotency key returns the same intent', again.id === ok.id);

// 3. Decline (4000 0000 0000 9995 = insufficient funds)
try {
  await charge('decline', 'pm_card_chargeDeclinedInsufficientFunds', 4545, 45);
  check('decline is declined', false);
} catch (e) {
  check(
    '4000000000009995 is declined',
    e.stripe?.decline_code === 'insufficient_funds' || e.stripe?.code === 'card_declined',
    e.stripe?.decline_code,
  );
}

// 4. 3D Secure (4000 0025 0000 3155): needs authentication, never succeeds server-side without the customer
const sca = await charge('3ds', 'pm_card_authenticationRequired', 4545, 45);
check('3DS card requires action', sca.status === 'requires_action', sca.status);
await api('POST', `/v1/payment_intents/${sca.id}/cancel`, {}, `itest:${run}:3ds:cancel`);

// 5. Refunds are issued ON the connected account; the partial one keeps the application fee, the final one returns it
const r1 = await api(
  'POST',
  '/v1/refunds',
  { payment_intent: ok.id, amount: 1000, refund_application_fee: 'false' },
  `itest:${run}:r1`,
);
check('partial refund created', ['succeeded', 'pending'].includes(r1.status), r1.status);
const r2 = await api(
  'POST',
  '/v1/refunds',
  { payment_intent: ok.id, amount: 3545, refund_application_fee: 'true' },
  `itest:${run}:r2`,
);
check(
  'rest refunded with the application fee',
  ['succeeded', 'pending'].includes(r2.status),
  r2.status,
);
const after = await api('GET', `/v1/charges/${ok.latest_charge}`);
check(
  'charge fully refunded',
  after.refunded === true && after.amount_refunded === 4545,
  `refunded=${after.amount_refunded}`,
);
const fees = await api('GET', '/v1/application_fees', { charge: ok.latest_charge }, undefined, '');
console.log(
  '     application fee object refunded (cents):',
  fees.data?.[0]?.amount_refunded,
  '(inspect: how much of the 45c fee came back across the two refunds?)',
);


// ---------------------------------------------------------------------------------------------------------------
// Installment plans (docs/split-payments.md). A $90.00 request in 3 installments of $30.00 each; the Athleit charge
// (50c + 1% = 80c) is added to EVERY installment because each one is its own Stripe transaction.
// What this checks is the Stripe side of the flow: the mechanics create-payment-intent and charge-installments rely on.
// The database half (state machine, dunning, refund allocation) is covered by supabase/tests/database/fn_split_payment_*.test.sql.
// ---------------------------------------------------------------------------------------------------------------
console.log('\n-- installment plan: 3 x $30.00 --');
const INST = 3000;
const FEE = 80; // 50c + 1% of $30.00
const TOTAL = INST + FEE;
const feeOf = async (pi) => {
  const c = await api('GET', `/v1/charges/${pi.latest_charge}`, { 'expand[]': 'balance_transaction' });
  return (c.balance_transaction.fee_details ?? [])
    .filter((d) => d.type === 'stripe_fee')
    .reduce((a, d) => a + d.amount, 0);
};

// Installment 1: charged at checkout; the card is saved on a Customer of the CONNECTED account for off-session use.
const cus = await api('POST', '/v1/customers', { metadata: { athleit_household_id: `itest-${run}` } }, `itest:${run}:cus`);
const p1 = await api(
  'POST',
  '/v1/payment_intents',
  {
    amount: TOTAL,
    currency: 'usd',
    application_fee_amount: FEE,
    customer: cus.id,
    payment_method: 'pm_card_visa',
    setup_future_usage: 'off_session',
    confirm: 'true',
    automatic_payment_methods: { enabled: 'true', allow_redirects: 'never' },
    description: 'integration plan installment 1 of 3',
    metadata: { athleit_payment_id: `itest-${run}-plan1` },
  },
  `itest:${run}:plan1`,
);
check('installment 1 succeeds at checkout', p1.status === 'succeeded', p1.status);
check('its application fee is the Athleit charge of THIS installment', p1.application_fee_amount === FEE, `fee=${p1.application_fee_amount}`);
const savedPm = await api('GET', `/v1/payment_methods/${p1.payment_method}`);
check('the card is saved on the connected account customer', savedPm.customer === cus.id, `customer=${savedPm.customer}`);
check('card expiry is readable from Stripe (we store ids only)', Number.isInteger(savedPm.card?.exp_year) && Number.isInteger(savedPm.card?.exp_month));
const fee1 = await feeOf(p1);

// Installments 2 and 3: the scheduler charges the saved card off-session, key = installment id + attempt.
const offSession = (n, pm = savedPm.id, customer = cus.id, attempt = 0) =>
  api(
    'POST',
    '/v1/payment_intents',
    {
      amount: TOTAL,
      currency: 'usd',
      application_fee_amount: FEE,
      customer,
      payment_method: pm,
      off_session: 'true',
      confirm: 'true',
      description: `integration plan installment ${n} of 3`,
      metadata: { athleit_payment_id: `itest-${run}-plan${n}` },
    },
    `athleit:inst:itest-${run}-${n}:${attempt}`,
  );
const p2 = await offSession(2);
check('installment 2 is charged off-session', p2.status === 'succeeded', p2.status);
const p3 = await offSession(3);
check('installment 3 is charged off-session', p3.status === 'succeeded', p3.status);
check('each installment carries its own application fee', p2.application_fee_amount === FEE && p3.application_fee_amount === FEE);
const fee2 = await feeOf(p2);
const fee3 = await feeOf(p3);
console.log('     Stripe fee per installment (cents):', fee1, fee2, fee3, '| the fixed 30c repeats each time');
check('Stripe charges its own fee on every installment (the fixed fee repeats)', fee1 > 30 && fee2 > 30 && fee3 > 30);

// A crashed scheduler run that retries the same attempt reuses the intent: never a second charge.
const p2again = await offSession(2);
check('retrying the same installment attempt returns the same intent', p2again.id === p2.id);

// A declined saved card (4000 0000 0000 9995): a card error, recorded as a failed attempt; nothing is cancelled.
const cusBad = await api('POST', '/v1/customers', { metadata: { athleit_household_id: `itest-${run}-bad` } }, `itest:${run}:cusbad`);
const bad = await api('POST', '/v1/payment_methods/pm_card_chargeDeclinedInsufficientFunds/attach', { customer: cusBad.id }, `itest:${run}:attachbad`, '');
try {
  await offSession(2, bad.id, cusBad.id, 0);
  check('a declined saved card is declined off-session', false);
} catch (e) {
  check(
    'a declined saved card is a card_error (insufficient funds)',
    e.stripe?.type === 'card_error' && (e.stripe?.decline_code === 'insufficient_funds' || e.stripe?.code === 'card_declined'),
    `${e.stripe?.type}/${e.stripe?.decline_code ?? e.stripe?.code}`,
  );
}

// An authentication-required saved card (4000 0025 0000 3155): off-session cannot complete 3D Secure.
const cusSca = await api('POST', '/v1/customers', { metadata: { athleit_household_id: `itest-${run}-sca` } }, `itest:${run}:cussca`);
const scaPm = await api('POST', '/v1/payment_methods/pm_card_authenticationRequired/attach', { customer: cusSca.id }, `itest:${run}:attachsca`, '');
try {
  const r = await offSession(3, scaPm.id, cusSca.id, 0);
  check('an authentication-required card cannot be charged off-session', r.status !== 'succeeded', r.status);
} catch (e) {
  check(
    'an authentication-required card is a card_error (authentication_required)',
    e.stripe?.type === 'card_error' && e.stripe?.code === 'authentication_required',
    `${e.stripe?.type}/${e.stripe?.code}`,
  );
}

// A $40.00 base refund across two installments: the most recently paid installment first (3, in full), then 2 (the rest).
// Each is its own refund on its own intent; the partial one keeps its application fee, the full one returns it.
const rf3 = await api('POST', '/v1/refunds', { payment_intent: p3.id, amount: INST, refund_application_fee: 'false' }, `itest:${run}:rf3`);
const rf2 = await api('POST', '/v1/refunds', { payment_intent: p2.id, amount: 1000, refund_application_fee: 'false' }, `itest:${run}:rf2`);
check('refund of installment 3 (base amount) accepted', ['succeeded', 'pending'].includes(rf3.status), rf3.status);
check('refund of part of installment 2 accepted', ['succeeded', 'pending'].includes(rf2.status), rf2.status);
const c1 = await api('GET', `/v1/charges/${p1.latest_charge}`);
const c2 = await api('GET', `/v1/charges/${p2.latest_charge}`);
const c3 = await api('GET', `/v1/charges/${p3.latest_charge}`);
check('installment 1 is untouched', c1.amount_refunded === 0, `refunded=${c1.amount_refunded}`);
check('installment 2 is partly refunded', c2.amount_refunded === 1000, `refunded=${c2.amount_refunded}`);
check('installment 3 is refunded to the base amount', c3.amount_refunded === INST, `refunded=${c3.amount_refunded}`);
// A refund that has already been made is not repeated under the same key.
const rf3again = await api('POST', '/v1/refunds', { payment_intent: p3.id, amount: INST, refund_application_fee: 'false' }, `itest:${run}:rf3`);
check('the same refund key returns the same refund (no double refund)', rf3again.id === rf3.id);

console.log(`
-- webhook replay (manual: needs your deployed endpoint) --
This script has no database or webhook access, so replay is a manual check. In the Stripe Dashboard (test mode) open
Developers > Webhooks > your endpoint > an event delivered for the intents above (payment_intent.succeeded for ${p1.id},
${p2.id}, ${p3.id}) and press Resend (or: stripe events resend <evt_...> --webhook-endpoint=<we_...>). Then confirm
 - the function logs show the event as a duplicate / no-op, and
 - no second receipt, refund row or notification appears (select count(*) from payments where receipt_display_id is not null).
The database side of replay is covered by fn_split_payment_checkout.test.sql ("a replayed webhook is a no-op").`);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
