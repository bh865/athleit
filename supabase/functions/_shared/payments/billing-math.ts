// The slice of packages/core/src/team-billing.ts the Edge Functions need (Deno cannot import the workspace package).
// A parity test (packages/core/src/billing-edge.test.ts) runs both against the same vectors so they cannot drift.
export type BillingState =
  | 'off'
  | 'trialing'
  | 'active'
  | 'cancel_scheduled'
  | 'past_due'
  | 'trial_expired'
  | 'lapsed'
  | 'comped';

export const STRIPE_MIN_TRIAL_MS = 48 * 3_600_000;
export const STRIPE_TRIAL_MARGIN_MS = 10 * 60_000;

export type CheckoutTrial =
  | { mode: 'charge_now' }
  | { mode: 'trial'; trialEnd: Date; extendedToMinimum: boolean; realEnd: Date };

export function checkoutTrial(
  trialEndsAt: Date | string,
  state: BillingState,
  now: Date,
): CheckoutTrial {
  const end = (trialEndsAt instanceof Date ? trialEndsAt : new Date(trialEndsAt)).getTime();
  if (state !== 'trialing' || end <= now.getTime()) return { mode: 'charge_now' };
  const min = now.getTime() + STRIPE_MIN_TRIAL_MS + STRIPE_TRIAL_MARGIN_MS;
  return end >= min
    ? { mode: 'trial', trialEnd: new Date(end), extendedToMinimum: false, realEnd: new Date(end) }
    : { mode: 'trial', trialEnd: new Date(min), extendedToMinimum: true, realEnd: new Date(end) };
}
