import { formatCents } from './money';

/**
 * Team subscription state. Mirrors private.team_billing_state in
 * supabase/migrations/20260417000100_team_billing.sql: same facts in, same state out, same test vectors
 * (see team-billing.test.ts and supabase/tests/database/fn_team_billing.test.sql).
 *
 * Facts are stored, state is computed: never persist the result of these functions. Every function that depends on
 * time takes `now` explicitly (an injected clock); nothing here reads the system clock. No price, trial length or grace
 * length appears as a literal: callers pass the server's terms (get_billing_terms()).
 */

export type BillingState =
  | 'off'
  | 'trialing'
  | 'active'
  | 'cancel_scheduled'
  | 'past_due'
  | 'trial_expired'
  | 'lapsed'
  | 'comped';

export type BillingAccess = 'full' | 'grace' | 'restricted';

export type StripeSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

/** The stored facts of one team (the columns of team_billing that decide state). Dates are ISO strings or Dates. */
export interface BillingFacts {
  /** From platform_settings (team_subscription.enabled). */
  enabled: boolean;
  /** False when the team has no billing row (treated as off, like the database). */
  hasRow: boolean;
  trialEndsAt: Date | string;
  stripeSubscriptionId?: string | null;
  stripeStatus?: StripeSubscriptionStatus | null;
  currentPeriodEnd?: Date | string | null;
  cancelAtPeriodEnd?: boolean;
  graceEndsAt?: Date | string | null;
  comped?: boolean;
  compUntil?: Date | string | null;
}

const ms = (d: Date | string | null | undefined): number | null =>
  d == null ? null : (d instanceof Date ? d : new Date(d)).getTime();

export function teamBillingState(f: BillingFacts, now: Date): BillingState {
  if (!f.enabled || !f.hasRow) return 'off';
  const t = now.getTime();
  const compUntil = ms(f.compUntil);
  if (f.comped && (compUntil === null || compUntil > t)) return 'comped';
  const status = f.stripeStatus ?? '';
  if (f.stripeSubscriptionId && status !== '' && status !== 'incomplete') {
    if (status === 'active' || status === 'trialing') {
      if (f.cancelAtPeriodEnd) {
        const end = ms(f.currentPeriodEnd);
        return end !== null && end <= t ? 'lapsed' : 'cancel_scheduled';
      }
      return 'active';
    }
    if (status === 'past_due' || status === 'unpaid') {
      const grace = ms(f.graceEndsAt);
      return grace === null || grace > t ? 'past_due' : 'lapsed';
    }
    return 'lapsed'; // canceled, incomplete_expired, paused
  }
  return (ms(f.trialEndsAt) as number) > t ? 'trialing' : 'trial_expired';
}

export function billingAccess(state: BillingState): BillingAccess {
  if (state === 'past_due') return 'grace';
  if (state === 'trial_expired' || state === 'lapsed') return 'restricted';
  return 'full';
}

/** True when the database refuses a growth action (new payment events, registrations, invites, join approvals). */
export const isBillingRestricted = (state: BillingState): boolean =>
  billingAccess(state) === 'restricted';

const DAY = 86_400_000;

/** Whole days left until `end` (rounded up, never negative). 0 means "ends today". */
export function daysLeft(end: Date | string, now: Date): number {
  const diff = (ms(end) as number) - now.getTime();
  return diff <= 0 ? 0 : Math.ceil(diff / DAY);
}

/** "14 days left", "Last day", "Ends today". */
export function daysLeftLabel(end: Date | string, now: Date): string {
  const diff = (ms(end) as number) - now.getTime();
  if (diff <= 0) return 'Ended';
  const n = daysLeft(end, now);
  return n <= 1 ? 'Last day' : `${n} days left`;
}

/**
 * Trial reminders (the sweep): which `reminderDays` are due now. A day value as long as the whole trial is skipped;
 * only the closest due value should be SENT (the others are marked sent silently), so a late sweep never sends two.
 */
export function dueTrialReminders(
  trialStartedAt: Date | string,
  trialEndsAt: Date | string,
  reminderDays: readonly number[],
  now: Date,
): { send: number | null; skipped: number[] } {
  const start = ms(trialStartedAt) as number;
  const end = ms(trialEndsAt) as number;
  const due = [...new Set(reminderDays)]
    .filter((d) => end - d * DAY <= now.getTime() && d * DAY < end - start && end > now.getTime())
    .sort((a, b) => a - b);
  return { send: due[0] ?? null, skipped: due.slice(1) };
}

/** Stripe needs a Checkout trial_end at least 48 hours ahead (confirmed in test mode by scripts/billing-integration.mjs). */
export const STRIPE_MIN_TRIAL_MS = 48 * 3_600_000;
/** Margin so the value is still 48h ahead when Stripe receives it. */
export const STRIPE_TRIAL_MARGIN_MS = 10 * 60_000;

export type CheckoutTrial =
  | { mode: 'charge_now' }
  | { mode: 'trial'; trialEnd: Date; extendedToMinimum: boolean; realEnd: Date };

/**
 * Subscribing early keeps the remaining trial: the first charge happens when the Athleit trial would have ended.
 * Expired or lapsed teams get no trial and are charged immediately. With less than Stripe's minimum left the
 * trial end is pushed to the minimum (and `extendedToMinimum` tells the UI to say so).
 */
export function checkoutTrial(
  trialEndsAt: Date | string,
  state: BillingState,
  now: Date,
): CheckoutTrial {
  const end = ms(trialEndsAt) as number;
  if (state !== 'trialing' || end <= now.getTime()) return { mode: 'charge_now' };
  const min = now.getTime() + STRIPE_MIN_TRIAL_MS + STRIPE_TRIAL_MARGIN_MS;
  return end >= min
    ? { mode: 'trial', trialEnd: new Date(end), extendedToMinimum: false, realEnd: new Date(end) }
    : { mode: 'trial', trialEnd: new Date(min), extendedToMinimum: true, realEnd: new Date(end) };
}

/** Teams that can start Checkout: billing on, not already paying and not in a payment problem (past_due always has a live subscription: fix the card instead). */
export function canSubscribe(state: BillingState): boolean {
  return !['off', 'active', 'cancel_scheduled', 'comped', 'past_due'].includes(state);
}
/** Cancel is offered for an active subscription; Resume while cancellation is scheduled. */
export const canCancel = (state: BillingState) => state === 'active';
export const canResume = (state: BillingState) => state === 'cancel_scheduled';

/** Price text from cents: "$10/month", "$12.50/month". Never a literal price: pass the server's value. */
export function formatMonthlyPrice(cents: number): string {
  const whole = cents % 100 === 0;
  return `${whole ? `$${cents / 100}` : formatCents(cents)}/month`;
}

export interface BillingTerms {
  enabled: boolean;
  price_cents: number;
  trial_days: number;
  /** Days before the trial ends to remind admins (also the window of the trial banner). */
  trial_reminder_days?: number[];
}

/** The one-line note on team creation: "14-day free trial, then $10/month. No card needed to start." Null when billing is off. */
export function trialTermsLine(terms: BillingTerms | null | undefined): string | null {
  if (!terms?.enabled) return null;
  const price = formatMonthlyPrice(terms.price_cents);
  if (terms.trial_days <= 0) return `${price}.`;
  return `${terms.trial_days}-day free trial, then ${price}. No card needed to start.`;
}

/** What `get_team_billing` returns (admins get everything; coaches and managers only the status fields). */
export interface TeamBillingView {
  state: BillingState;
  access: BillingAccess;
  can_manage: boolean;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  grace_ends_at?: string | null;
  comp_until?: string | null;
  has_subscription?: boolean;
  /** Stripe is still billing this subscription: fix the card (portal); a second Checkout would double-charge. */
  subscription_live?: boolean;
  price_cents?: number;
  price_mismatch?: boolean;
}

export type BannerTone = 'info' | 'warning' | 'critical';
export interface BillingBanner {
  tone: BannerTone;
  title: string;
  body: string;
  /** Admins get an action; everyone else is told to ask an admin. */
  action: 'subscribe' | 'update_payment' | 'resume' | null;
}

/**
 * The calm shared banner. `reminderDays` come from the server's setting; the trial banner shows only inside the
 * last reminder window (the largest reminder day). Returns null when nothing needs saying.
 */
export function billingBanner(
  view: TeamBillingView | null | undefined,
  now: Date,
  reminderDays: readonly number[] = [],
): BillingBanner | null {
  if (!view || view.state === 'off') return null;
  const admin = view.can_manage;
  const subscribe = admin ? ('subscribe' as const) : null;
  switch (view.state) {
    case 'trialing': {
      if (!view.trial_ends_at || reminderDays.length === 0) return null;
      const window = Math.max(...reminderDays);
      if (daysLeft(view.trial_ends_at, now) > window) return null;
      return {
        tone: 'warning',
        title: 'Your free trial is ending',
        body: admin
          ? `${daysLeftLabel(view.trial_ends_at, now)}. Subscribe to keep creating payment requests, registrations and invites.`
          : `${daysLeftLabel(view.trial_ends_at, now)}. Ask a team admin to subscribe.`,
        action: subscribe,
      };
    }
    case 'past_due':
      return {
        tone: 'critical',
        title: 'Payment problem',
        body: admin
          ? `We could not charge the card${view.grace_ends_at ? `. Update it by ${billingDate(view.grace_ends_at)} to avoid pauses` : ''}.`
          : 'There is a problem with the team’s subscription payment. Ask a team admin to fix it.',
        action: admin ? 'update_payment' : null,
      };
    case 'trial_expired':
    case 'lapsed':
      return {
        tone: 'critical',
        title: 'Some team actions are paused',
        body: admin
          ? 'New payment requests, registrations, invites and join approvals are paused. Everything else, including your families’ payments and messages, keeps working.'
          : 'New payment requests, registrations, invites and join approvals are paused. Ask a team admin to subscribe.',
        action: subscribe,
      };
    case 'cancel_scheduled':
      return admin && view.current_period_end
        ? {
            tone: 'info',
            title: 'Subscription ends soon',
            body: `Your subscription ends ${billingDate(view.current_period_end)}. You can resume any time before then.`,
            action: 'resume',
          }
        : null;
    default:
      return null;
  }
}

/** Items for the Home attention strip (admins only; the same facts as the banner). */
export function billingAttention(
  view: TeamBillingView | null | undefined,
  now: Date,
  reminderDays: readonly number[] = [],
): { title: string; detail: string; tone: BannerTone } | null {
  if (!view?.can_manage) return null;
  const b = billingBanner(view, now, reminderDays);
  return b && b.tone !== 'info' ? { title: b.title, detail: b.body, tone: b.tone } : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Mar 14" in UTC (the database formats dates the same way in its notices). */
export function billingDate(d: Date | string): string {
  const dt = d instanceof Date ? d : new Date(d);
  return `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}
