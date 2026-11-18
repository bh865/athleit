#!/usr/bin/env node
// Stripe TEST-MODE integration check for the payment flow's money mechanics. Not part of CI (needs real test keys).
//
//   STRIPE_SECRET_KEY=sk_test_... CONNECTED_ACCOUNT=acct_... node scripts/payments-integration.mjs
//
// CONNECTED_ACCOUNT must be a test account created by connect-onboarding that finished onboarding in test mode (charges_enabled).
// It exercises exactly what create-payment-intent / refund-payment send: a DIRECT charge created on the connected account
// (Stripe-Account header) with an application fee that is only the Athleit charge, then verifies the actual Stripe fee on
// the connected account's balance transaction (paid by the account, not Athleit), a decline, 3D Secure, and refunds.
// The account must have been created with controller.fees.payer=account (connect-onboarding does this). Refuses live keys.
const key = process.env.STRIPE_SECRET_KEY ?? '';
const acct = process.env.CONNECTED_ACCOUNT ?? '';
if (/^(sk|rk)_live_/.test(key)) {
  console.error('Refusing a live key.');
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

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
