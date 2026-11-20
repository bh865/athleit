#!/usr/bin/env node
// Stripe TEST-MODE check of the subscription mechanics the billing Edge Functions rely on, using Stripe TEST CLOCKS.
// Not part of CI (needs a real test key). It talks to Stripe only; it never touches Athleit's database or functions.
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/billing-integration.mjs
//
// Every customer is created with a test clock, so "a month passes" and "the trial ends" are one API call. The script
// creates its own Product and Prices (prefixed athleit-billing-it) and a Checkout Session per scenario; nothing it creates
// is reused by the app. Refuses live keys. Prints exactly what it observed, including anything that did NOT match
// what the app assumes, so the result can be pasted into the PR as is.
//
// Scenarios (the ones the billing spec lists):
//   A  subscribe mid-trial with a valid card; the first charge lands at trial end            (trial_end carried over)
//   B  advance a month: renewal and a paid second invoice                                    (invoice mirror source)
//   C  a card that attaches but then fails (4000 0000 0000 0341): past_due, the retry window, what ends the subscription
//   D  recovery: update the card, pay the open invoice, back to active
//   E  an authentication-required card (4000 0025 0000 3155)
//   F  cancel at period end, then resume
//   G  a price change after one team subscribed and one did not: the paying team keeps its price
//   H  Checkout's minimum trial_end (the app assumes 48 hours)
const key = process.env.STRIPE_SECRET_KEY ?? '';
if (/^(sk|rk)_live_/.test(key)) {
  console.error('Refusing a live key.');
  process.exit(2);
}
if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key) || key.length < 30) {
  console.error('Set STRIPE_SECRET_KEY to a test-mode secret key.');
  process.exit(2);
}

const enc = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    v !== null && typeof v === 'object'
      ? enc(v, p ? `${p}[${k}]` : k)
      : v === undefined
        ? []
        : [`${encodeURIComponent(p ? `${p}[${k}]` : k)}=${encodeURIComponent(v)}`],
  );
async function api(method, path, params = {}, idem) {
  const qs = method === 'GET' && Object.keys(params).length ? `?${enc(params).join('&')}` : '';
  const res = await fetch(`https://api.stripe.com${path}${qs}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...(idem ? { 'idempotency-key': idem } : {}),
    },
    body: method === 'POST' ? enc(params).join('&') : undefined,
  });
  const j = await res.json();
  if (!res.ok) {
    const e = new Error(`${path}: ${j.error?.code ?? j.error?.type}: ${j.error?.message ?? ''}`.slice(0, 300));
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
const note = (s) => console.log(`note ${s}`);
const run = Date.now();
const DAY = 86_400;
const t0 = Math.floor(Date.now() / 1000);

async function advance(clock, to) {
  await api('POST', `/v1/test_helpers/test_clocks/${clock}/advance`, { frozen_time: to });
  for (let i = 0; i < 60; i++) {
    const c = await api('GET', `/v1/test_helpers/test_clocks/${clock}`);
    if (c.status === 'ready') return c;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('test clock did not become ready');
}
async function team(label, pm) {
  const clock = await api('POST', '/v1/test_helpers/test_clocks', { frozen_time: t0, name: `athleit-billing-it ${label} ${run}` });
  const cust = await api('POST', '/v1/customers', { name: `Billing IT ${label}`, test_clock: clock.id, metadata: { team_id: `it-${label}-${run}` } });
  const attached = await api('POST', `/v1/payment_methods/${pm}/attach`, { customer: cust.id });
  await api('POST', `/v1/customers/${cust.id}`, { invoice_settings: { default_payment_method: attached.id } });
  return { clock: clock.id, customer: cust.id, pm: attached.id, now: t0 };
}
const sub = (id) => api('GET', `/v1/subscriptions/${id}`, { expand: ['latest_invoice.payment_intent'] });
const periodEnd = (s) => s.current_period_end ?? s.items?.data?.[0]?.current_period_end;

const product = await api('POST', '/v1/products', { name: `athleit-billing-it ${run}` });
const price = (cents) =>
  api('POST', '/v1/prices', { product: product.id, unit_amount: cents, currency: 'usd', recurring: { interval: 'month' } });
const p1000 = await price(1000);

// A + B ------------------------------------------------------------------------------------------------------------
const a = await team('A', 'pm_card_visa');
const trialEnd = t0 + 10 * DAY;
let sA = await api('POST', '/v1/subscriptions', { customer: a.customer, items: [{ price: p1000.id }], trial_end: trialEnd, metadata: { team_id: `it-A-${run}` } });
check('A: subscribing mid-trial gives a trialing subscription (no charge yet)', sA.status === 'trialing', `status=${sA.status}`);
check('A: the first invoice is $0 and no charge exists yet', (await api('GET', '/v1/invoices', { subscription: sA.id })).data.every((i) => i.amount_paid === 0));
await advance(a.clock, trialEnd + 3600);
sA = await sub(sA.id);
check('A: at trial end the subscription is active and the first charge landed', sA.status === 'active' && sA.latest_invoice?.amount_paid === 1000, `status=${sA.status} paid=${sA.latest_invoice?.amount_paid}`);
check('A: the first paid invoice carries a hosted URL (mirrored for the admin)', !!sA.latest_invoice?.hosted_invoice_url);
await advance(a.clock, trialEnd + 31 * DAY + 3600);
sA = await sub(sA.id);
const invs = (await api('GET', '/v1/invoices', { subscription: sA.id })).data.filter((i) => i.amount_paid > 0);
check('B: a month later the subscription renewed and a second invoice was paid', sA.status === 'active' && invs.length >= 2, `paid invoices=${invs.length}`);

// F: cancel then resume -----------------------------------------------------------------------------------------------
sA = await api('POST', `/v1/subscriptions/${sA.id}`, { cancel_at_period_end: true });
check('F: cancel sets cancel_at_period_end and keeps the subscription active (service continues)', sA.cancel_at_period_end === true && sA.status === 'active');
sA = await api('POST', `/v1/subscriptions/${sA.id}`, { cancel_at_period_end: false });
check('F: resume clears it', sA.cancel_at_period_end === false && sA.status === 'active');
note(`current period end field present as ${sA.current_period_end ? 'sub.current_period_end' : 'items.data[0].current_period_end'} (the snapshot reads either)`);

// G: price change -------------------------------------------------------------------------------------------------------
const p1500 = await price(1500);
const g = await team('G', 'pm_card_visa');
const sG = await api('POST', '/v1/subscriptions', { customer: g.customer, items: [{ price: p1500.id }] });
const sAFresh = await sub(sA.id);
check('G: a team that subscribed at $10 keeps its price after the list price becomes $15', sAFresh.items.data[0].price.unit_amount === 1000);
check('G: the team that subscribes later is on $15', sG.items?.data?.[0]?.price?.unit_amount === 1500);

// C + D: a card that attaches but then fails ---------------------------------------------------------------------------
const c = await team('C', 'pm_card_chargeCustomerFail');
let sC = await api('POST', '/v1/subscriptions', { customer: c.customer, items: [{ price: p1000.id }], trial_end: t0 + 3 * DAY, metadata: { team_id: `it-C-${run}` } });
await advance(c.clock, t0 + 3 * DAY + 3600);
sC = await sub(sC.id);
check('C: a failing card puts the subscription past_due at trial end', sC.status === 'past_due', `status=${sC.status}`);
const failedInv = sC.latest_invoice;
check('C: the open invoice exists for the team to fix', failedInv?.status === 'open', `invoice=${failedInv?.status}`);
note(`C: next_payment_attempt=${failedInv?.next_payment_attempt ? new Date(failedInv.next_payment_attempt * 1000).toISOString() : 'none'} (Smart Retries setting of THIS account decides the schedule)`);
// Walk three weeks and report what the account's retry rules do (the app assumes: retries ~3 weeks, then the subscription is canceled).
let last = sC.status;
for (const days of [7, 14, 21, 28]) {
  await advance(c.clock, t0 + 3 * DAY + days * DAY);
  const s = await sub(sC.id);
  note(`C: +${days} days after the first failure: status=${s.status}`);
  last = s.status;
  if (['canceled', 'unpaid'].includes(s.status)) break;
}
check(`C: after the retry window the subscription ended (${last}); the app treats canceled/unpaid as lapsed`, ['canceled', 'unpaid'].includes(last), last === 'past_due' ? 'Retries are still running: set the Dashboard retry rule to cancel the subscription after the final attempt (docs/billing.md)' : '');

// D: recovery on a fresh failing team (the one above may already be canceled) ------------------------------------------------
const d = await team('D', 'pm_card_chargeCustomerFail');
let sD = await api('POST', '/v1/subscriptions', { customer: d.customer, items: [{ price: p1000.id }], trial_end: t0 + 3 * DAY });
await advance(d.clock, t0 + 3 * DAY + 3600);
sD = await sub(sD.id);
check('D: starts past_due', sD.status === 'past_due');
const good = await api('POST', '/v1/payment_methods/pm_card_visa/attach', { customer: d.customer });
await api('POST', `/v1/customers/${d.customer}`, { invoice_settings: { default_payment_method: good.id } });
await api('POST', `/v1/subscriptions/${sD.id}`, { default_payment_method: good.id });
await api('POST', `/v1/invoices/${sD.latest_invoice.id}/pay`, { payment_method: good.id });
sD = await sub(sD.id);
check('D: updating the card and paying the open invoice returns the subscription to active', sD.status === 'active' && sD.latest_invoice?.status === 'paid', `status=${sD.status}`);

// E: authentication required ---------------------------------------------------------------------------------------------------
const e = await team('E', 'pm_card_authenticationRequired');
let sE = await api('POST', '/v1/subscriptions', { customer: e.customer, items: [{ price: p1000.id }], trial_end: t0 + 3 * DAY });
await advance(e.clock, t0 + 3 * DAY + 3600);
sE = await sub(sE.id);
const piStatus = sE.latest_invoice?.payment_intent?.status;
check('E: an authentication-required card leaves the invoice needing action (the app sends payment_action_required)', sE.status === 'past_due' && piStatus === 'requires_action', `status=${sE.status} payment_intent=${piStatus}`);

// H: Checkout's minimum trial_end ------------------------------------------------------------------------------------------------
const cust = await api('POST', '/v1/customers', { name: 'Billing IT checkout' });
const session = (trial_end) =>
  api('POST', '/v1/checkout/sessions', {
    mode: 'subscription',
    customer: cust.id,
    line_items: [{ price: p1000.id, quantity: 1 }],
    payment_method_collection: 'always',
    subscription_data: { trial_end },
    success_url: 'https://example.test/success',
    cancel_url: 'https://example.test/cancel',
  });
const nowS = Math.floor(Date.now() / 1000);
let shortErr = null;
try { await session(nowS + 24 * 3600); } catch (err) { shortErr = err; }
check('H: a Checkout trial_end 24 hours ahead is refused', !!shortErr, shortErr ? `(${shortErr.stripe?.code ?? shortErr.stripe?.type})` : 'Stripe ACCEPTED it: the 48 hour minimum in core/edge is stricter than needed');
let okErr = null;
try { await session(nowS + 49 * 3600); } catch (err) { okErr = err; }
check('H: a Checkout trial_end 49 hours ahead is accepted', !okErr, okErr?.message ?? '');
let borderErr = null;
try { await session(nowS + 48 * 3600 + 600); } catch (err) { borderErr = err; }
check('H: 48 hours + the 10 minute margin the app uses is accepted', !borderErr, borderErr?.message ?? '');

console.log('\nManual checks that need the deployed webhook (not run by this script):');
console.log('  - Replay: resend any customer.subscription.updated from Dashboard > Developers > Webhooks; the second delivery must return {duplicate:true}.');
console.log('  - Out of order: deliver invoice.paid before customer.subscription.updated; state must end active either way (every event refetches).');
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
