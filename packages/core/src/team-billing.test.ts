import { describe, expect, it } from 'vitest';
import { can, capabilitiesFor } from './capabilities';
import { friendlyError } from './errors';
import {
  STRIPE_MIN_TRIAL_MS,
  billingAccess,
  billingAttention,
  billingBanner,
  canCancel,
  canResume,
  canSubscribe,
  checkoutTrial,
  daysLeft,
  daysLeftLabel,
  dueTrialReminders,
  formatMonthlyPrice,
  isBillingRestricted,
  teamBillingState,
  trialTermsLine,
  type BillingFacts,
  type TeamBillingView,
} from './team-billing';

const at = (s: string) => new Date(s);
const base = (over: Partial<BillingFacts> = {}): BillingFacts => ({
  enabled: true,
  hasRow: true,
  trialEndsAt: '2026-01-15T00:00:00Z',
  ...over,
});

// The same vectors as supabase/tests/database/fn_team_billing.test.sql ("State vectors").
describe('teamBillingState', () => {
  it('is off when billing is disabled or the team has no billing row', () => {
    expect(teamBillingState(base({ enabled: false }), at('2026-03-01T00:00:00Z'))).toBe('off');
    expect(teamBillingState(base({ hasRow: false }), at('2026-03-01T00:00:00Z'))).toBe('off');
  });

  it('trial boundary to the second', () => {
    expect(teamBillingState(base(), at('2026-01-14T23:59:59Z'))).toBe('trialing');
    expect(teamBillingState(base(), at('2026-01-15T00:00:00Z'))).toBe('trial_expired');
  });

  it('a subscription that is active or Stripe-trialing is active', () => {
    const f = base({ stripeSubscriptionId: 'sub_1', stripeStatus: 'active' });
    expect(teamBillingState(f, at('2026-03-01T00:00:00Z'))).toBe('active');
    expect(teamBillingState({ ...f, stripeStatus: 'trialing' }, at('2026-01-10T00:00:00Z'))).toBe(
      'active',
    );
  });

  it('cancel then resume', () => {
    const f = base({
      stripeSubscriptionId: 'sub_1',
      stripeStatus: 'active',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: '2026-02-15T00:00:00Z',
    });
    expect(teamBillingState(f, at('2026-02-14T23:59:59Z'))).toBe('cancel_scheduled');
    expect(teamBillingState(f, at('2026-02-15T00:00:00Z'))).toBe('lapsed');
    expect(teamBillingState({ ...f, cancelAtPeriodEnd: false }, at('2026-02-10T00:00:00Z'))).toBe(
      'active',
    );
  });

  it('grace starts at the failure and ends at grace_ends_at; a payment recovers at any time', () => {
    const f = base({
      stripeSubscriptionId: 'sub_1',
      stripeStatus: 'past_due',
      graceEndsAt: '2026-02-08T00:00:00Z',
    });
    expect(teamBillingState(f, at('2026-02-07T23:59:59Z'))).toBe('past_due');
    expect(teamBillingState(f, at('2026-02-08T00:00:00Z'))).toBe('lapsed');
    expect(
      teamBillingState(
        { ...f, stripeStatus: 'active', graceEndsAt: null },
        at('2026-02-09T00:00:00Z'),
      ),
    ).toBe('active');
    // A past-due subscription with no recorded grace end is treated as still inside grace.
    expect(teamBillingState({ ...f, graceEndsAt: null }, at('2026-02-09T00:00:00Z'))).toBe(
      'past_due',
    );
    expect(teamBillingState({ ...f, stripeStatus: 'unpaid' }, at('2026-02-07T00:00:00Z'))).toBe(
      'past_due',
    );
  });

  it('canceled, incomplete_expired and paused subscriptions are lapsed; an incomplete first payment falls back to the trial', () => {
    const f = base({ stripeSubscriptionId: 'sub_1' });
    for (const s of ['canceled', 'incomplete_expired', 'paused'] as const)
      expect(teamBillingState({ ...f, stripeStatus: s }, at('2026-02-09T00:00:00Z'))).toBe(
        'lapsed',
      );
    expect(teamBillingState({ ...f, stripeStatus: 'incomplete' }, at('2026-01-10T00:00:00Z'))).toBe(
      'trialing',
    );
    expect(teamBillingState({ ...f, stripeStatus: 'incomplete' }, at('2026-06-10T00:00:00Z'))).toBe(
      'trial_expired',
    );
  });

  it('comp with and without an end date; an expired comp reverts to the underlying state', () => {
    const f = base({ comped: true, compUntil: '2026-06-01T00:00:00Z' });
    expect(teamBillingState(f, at('2026-05-31T00:00:00Z'))).toBe('comped');
    expect(teamBillingState(f, at('2026-06-01T00:00:00Z'))).toBe('trial_expired');
    expect(teamBillingState({ ...f, compUntil: null }, at('2099-01-01T00:00:00Z'))).toBe('comped');
  });

  it('an admin trial extension moves the boundary; a longer trial_days setting elsewhere cannot (the end is stored)', () => {
    expect(
      teamBillingState(base({ trialEndsAt: '2026-01-25T00:00:00Z' }), at('2026-01-20T00:00:00Z')),
    ).toBe('trialing');
  });
});

describe('access', () => {
  it('maps state to full, grace or restricted', () => {
    expect(billingAccess('off')).toBe('full');
    expect(billingAccess('trialing')).toBe('full');
    expect(billingAccess('active')).toBe('full');
    expect(billingAccess('cancel_scheduled')).toBe('full');
    expect(billingAccess('comped')).toBe('full');
    expect(billingAccess('past_due')).toBe('grace');
    expect(billingAccess('trial_expired')).toBe('restricted');
    expect(billingAccess('lapsed')).toBe('restricted');
    expect(isBillingRestricted('lapsed')).toBe(true);
    expect(isBillingRestricted('past_due')).toBe(false);
  });

  it('who may subscribe, cancel and resume', () => {
    expect(canSubscribe('trialing')).toBe(true);
    expect(canSubscribe('trial_expired')).toBe(true);
    expect(canSubscribe('lapsed')).toBe(true);
    expect(canSubscribe('past_due')).toBe(false); // fix the card; a second Checkout would double-charge
    for (const s of ['off', 'active', 'cancel_scheduled', 'comped'] as const)
      expect(canSubscribe(s)).toBe(false);
    expect(canCancel('active')).toBe(true);
    expect(canCancel('cancel_scheduled')).toBe(false);
    expect(canResume('cancel_scheduled')).toBe(true);
  });
});

describe('days and reminders', () => {
  it('rounds days up and never goes negative', () => {
    expect(daysLeft('2026-01-15T00:00:00Z', at('2026-01-01T00:00:00Z'))).toBe(14);
    expect(daysLeft('2026-01-15T00:00:00Z', at('2026-01-14T12:00:00Z'))).toBe(1);
    expect(daysLeft('2026-01-15T00:00:00Z', at('2026-01-16T00:00:00Z'))).toBe(0);
    expect(daysLeftLabel('2026-01-15T00:00:00Z', at('2026-01-01T00:00:00Z'))).toBe('14 days left');
    expect(daysLeftLabel('2026-01-15T00:00:00Z', at('2026-01-14T12:00:00Z'))).toBe('Last day');
    expect(daysLeftLabel('2026-01-15T00:00:00Z', at('2026-01-15T00:00:00Z'))).toBe('Ended');
  });

  it('sends only the closest due reminder and marks the rest, and skips values as long as the trial', () => {
    const start = '2026-01-01T00:00:00Z';
    const end = '2026-01-15T00:00:00Z';
    expect(dueTrialReminders(start, end, [3, 1], at('2026-01-10T00:00:00Z'))).toEqual({
      send: null,
      skipped: [],
    });
    expect(dueTrialReminders(start, end, [3, 1], at('2026-01-12T00:00:00Z'))).toEqual({
      send: 3,
      skipped: [],
    });
    // The sweep was down: both are due; only the closer one is sent.
    expect(dueTrialReminders(start, end, [3, 1], at('2026-01-14T06:00:00Z'))).toEqual({
      send: 1,
      skipped: [3],
    });
    // A 2-day trial never sends a 3-day reminder.
    expect(
      dueTrialReminders(start, '2026-01-03T00:00:00Z', [3, 1], at('2026-01-02T12:00:00Z')),
    ).toEqual({ send: 1, skipped: [] });
    // After the trial ended nothing is due.
    expect(dueTrialReminders(start, end, [3, 1], at('2026-01-16T00:00:00Z'))).toEqual({
      send: null,
      skipped: [],
    });
  });
});

describe('checkoutTrial (subscribing early keeps the remaining trial)', () => {
  const now = at('2026-01-01T00:00:00Z');
  it('carries the remaining trial over when at least 48 hours remain', () => {
    const r = checkoutTrial('2026-01-10T00:00:00Z', 'trialing', now);
    expect(r).toMatchObject({ mode: 'trial', extendedToMinimum: false });
    expect(r.mode === 'trial' && r.trialEnd.toISOString()).toBe('2026-01-10T00:00:00.000Z');
  });
  it('pushes the trial end to the 48 hour minimum when less remains and keeps the real end', () => {
    const r = checkoutTrial('2026-01-02T00:00:00Z', 'trialing', now);
    expect(r.mode).toBe('trial');
    if (r.mode === 'trial') {
      expect(r.extendedToMinimum).toBe(true);
      expect(r.trialEnd.getTime() - now.getTime()).toBeGreaterThanOrEqual(STRIPE_MIN_TRIAL_MS);
      expect(r.realEnd.toISOString()).toBe('2026-01-02T00:00:00.000Z');
    }
  });
  it('charges immediately for an expired or lapsed team', () => {
    expect(checkoutTrial('2025-12-01T00:00:00Z', 'trial_expired', now)).toEqual({
      mode: 'charge_now',
    });
    expect(checkoutTrial('2026-02-01T00:00:00Z', 'lapsed', now)).toEqual({ mode: 'charge_now' });
  });
});

describe('copy', () => {
  it('formats the price from cents and builds the terms line from the server terms', () => {
    expect(formatMonthlyPrice(1000)).toBe('$10/month');
    expect(formatMonthlyPrice(1250)).toBe('$12.50/month');
    expect(trialTermsLine({ enabled: true, price_cents: 1000, trial_days: 14 })).toBe(
      '14-day free trial, then $10/month. No card needed to start.',
    );
    expect(trialTermsLine({ enabled: true, price_cents: 2500, trial_days: 30 })).toBe(
      '30-day free trial, then $25/month. No card needed to start.',
    );
    expect(trialTermsLine({ enabled: true, price_cents: 1000, trial_days: 0 })).toBe('$10/month.');
    expect(trialTermsLine({ enabled: false, price_cents: 1000, trial_days: 14 })).toBeNull();
    expect(trialTermsLine(null)).toBeNull();
  });

  const view = (over: Partial<TeamBillingView>): TeamBillingView => ({
    state: 'trialing',
    access: 'full',
    can_manage: true,
    ...over,
  });
  const now = at('2026-01-13T00:00:00Z');

  it('shows the trial banner only inside the last reminder window', () => {
    const v = view({ trial_ends_at: '2026-01-15T00:00:00Z' });
    expect(billingBanner(v, at('2026-01-01T00:00:00Z'), [3, 1])).toBeNull();
    expect(billingBanner(v, now, [3, 1])).toMatchObject({ tone: 'warning', action: 'subscribe' });
    expect(billingBanner(v, now, [])).toBeNull();
  });
  it('staff get a read-only banner that says to ask an admin', () => {
    const b = billingBanner(
      view({ can_manage: false, state: 'trial_expired', access: 'restricted' }),
      now,
    );
    expect(b).toMatchObject({ tone: 'critical', action: null });
    expect(b?.body).toMatch(/ask a team admin/i);
    expect(b?.body).not.toMatch(/\$/);
  });
  it('past due names the grace deadline for admins', () => {
    const b = billingBanner(
      view({ state: 'past_due', access: 'grace', grace_ends_at: '2026-01-20T00:00:00Z' }),
      now,
    );
    expect(b).toMatchObject({ tone: 'critical', action: 'update_payment' });
    expect(b?.body).toContain('Jan 20');
  });
  it('has no banner when off, active or comped; cancel scheduled is admin-only', () => {
    for (const state of ['off', 'active', 'comped'] as const)
      expect(billingBanner(view({ state }), now)).toBeNull();
    expect(
      billingBanner(
        view({ state: 'cancel_scheduled', current_period_end: '2026-02-01T00:00:00Z' }),
        now,
      ),
    ).toMatchObject({ action: 'resume' });
    expect(billingBanner(view({ state: 'cancel_scheduled', can_manage: false }), now)).toBeNull();
  });
  it('the Home attention item is for admins and skips calm states', () => {
    expect(billingAttention(view({ state: 'past_due', access: 'grace' }), now)).toMatchObject({
      tone: 'critical',
    });
    expect(
      billingAttention(view({ state: 'past_due', access: 'grace', can_manage: false }), now),
    ).toBeNull();
    expect(
      billingAttention(
        view({ state: 'cancel_scheduled', current_period_end: '2026-02-01T00:00:00Z' }),
        now,
      ),
    ).toBeNull();
  });
});

describe('capabilities and errors', () => {
  it('only team admins manage billing; coaches and managers view status; nobody else sees anything', () => {
    expect(can({ kind: 'team', role: 'admin' }, 'billing.manage')).toBe(true);
    expect(can({ kind: 'team', role: 'admin' }, 'billing.view')).toBe(true);
    for (const role of ['coach', 'manager'] as const) {
      expect(can({ kind: 'team', role }, 'billing.view')).toBe(true);
      expect(can({ kind: 'team', role }, 'billing.manage')).toBe(false);
    }
    for (const role of ['parent', 'player'] as const) {
      expect(capabilitiesFor({ kind: 'team', role }).has('billing.view')).toBe(false);
      expect(capabilitiesFor({ kind: 'team', role }).has('billing.manage')).toBe(false);
    }
    expect(can({ kind: 'club', role: 'admin' }, 'billing.view')).toBe(false);
    expect(can({ kind: 'family', role: 'guardian' }, 'billing.view')).toBe(false);
  });
  it('maps billing_restricted to a sentence that names what to do', () => {
    expect(friendlyError({ message: 'billing_restricted' })).toMatch(/team admin can subscribe/);
    expect(friendlyError({ message: 'already_subscribed' })).toBe(
      'This team is already subscribed.',
    );
  });
});

describe('Home attention and alerts', () => {
  it('turns a billing banner into an urgent or calm attention item for admins', async () => {
    const { buildAttentionItems } = await import('./home-data');
    const { attentionRank, attentionActionLabel } = await import('./home-attention');
    const { notificationSummary } = await import('./notifications');
    const items = buildAttentionItems({
      now: new Date('2026-01-13T00:00:00Z'),
      billing: {
        title: 'Payment problem',
        detail: 'Update the card.',
        href: '/teams/t/billing',
        urgent: true,
      },
    });
    expect(items).toHaveLength(1);
    expect(attentionRank(items[0]!, new Date('2026-01-13T00:00:00Z'))).toBe(1);
    expect(attentionActionLabel(items[0]!)).toBe('Open billing');
    const calm = buildAttentionItems({
      now: new Date(),
      billing: { title: 'Trial ending', detail: 'x', href: '/h', urgent: false },
    });
    expect(attentionRank(calm[0]!, new Date())).toBe(3);
    expect(buildAttentionItems({ now: new Date(), billing: null })).toEqual([]);
    expect(
      notificationSummary('billing', { team_id: 't', audience: 'admin', title: 'Payment failed' })
        .href,
    ).toBe('/teams/t/billing');
    expect(notificationSummary('billing', { team_id: 't', audience: 'staff' }).href).toBe(
      '/teams/t',
    );
  });
});
