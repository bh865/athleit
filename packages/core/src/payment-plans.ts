/**
 * Installment plans: the pure schedule generator and the fee impact of a plan. It mirrors
 * `private.generate_plan`, `private.plan_fits`, `private.available_plan_sizes` and `private.plan_due_at` in
 * supabase/migrations/20260406000000_split_payment_plans.sql; `payment-plans.test.ts` holds both to the same vectors.
 *
 * Rules: integer cents; the base is split evenly and the remainder cents go on the FIRST installment; installment 1 is
 * due at checkout and the rest every cadence step (weekly 7 days, biweekly 14 days, monthly = calendar month, clamped to
 * month end) counted from the checkout instant in UTC, so daylight saving never moves a due instant; the last
 * installment must be due on or before the event due date; every installment is at least 50 cents.
 *
 * Each installment is its own Stripe transaction, so the Athleit flat charge and Stripe's fixed fee repeat per
 * installment (the intended behaviour). The server is the only place a charge is computed; this module feeds the staff
 * preview and the family's "what this plan costs" display, and the tests.
 */
import { computeFees, type FeeBreakdown, type FeeConfig, type FeePolicy } from './fees';

export const PLAN_SIZES = [1, 2, 3, 4, 5, 6] as const;
export type PlanSize = (typeof PLAN_SIZES)[number];
export const PLAN_CADENCES = ['weekly', 'biweekly', 'monthly'] as const;
export type PlanCadence = (typeof PLAN_CADENCES)[number];
export const PLAN_CADENCE_LABEL: Record<PlanCadence, string> = {
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Every month',
};
/** Stripe's USD minimum charge, so the smallest an installment may be. */
export const MIN_INSTALLMENT_CENTS = 50;

export interface PlanInstallment {
  sequence: number;
  amountCents: number;
  dueAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The instant `k` cadence steps after `start`. Monthly clamps to month end and is computed from the START, never iteratively. */
export function planDueAt(start: Date, cadence: PlanCadence, k: number): Date {
  if (cadence === 'weekly') return new Date(start.getTime() + k * 7 * DAY_MS);
  if (cadence === 'biweekly') return new Date(start.getTime() + k * 14 * DAY_MS);
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + k;
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(start.getUTCDate(), lastDay),
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );
}

export function generatePlan(
  amountCents: number,
  n: number,
  cadence: PlanCadence,
  start: Date,
): PlanInstallment[] {
  if (!Number.isInteger(n) || n < 1 || n > 6) throw new RangeError('invalid_plan_size');
  if (!Number.isInteger(amountCents) || amountCents < MIN_INSTALLMENT_CENTS * n)
    throw new RangeError('invalid_plan_amount');
  const base = Math.floor(amountCents / n);
  const remainder = amountCents % n;
  return Array.from({ length: n }, (_, i) => ({
    sequence: i + 1,
    amountCents: base + (i === 0 ? remainder : 0),
    dueAt: planDueAt(start, cadence, i),
  }));
}

export function planFits(
  amountCents: number,
  n: number,
  cadence: PlanCadence,
  start: Date,
  due: Date,
): boolean {
  if (n === 1) return true;
  return (
    n >= 2 &&
    n <= 6 &&
    Math.floor(amountCents / n) >= MIN_INSTALLMENT_CENTS &&
    planDueAt(start, cadence, n - 1).getTime() <= due.getTime()
  );
}

/** The sizes a family may choose at `start`. If none of the event's options fit, pay in full so nobody is locked out. */
export function availablePlanSizes(
  options: readonly number[],
  amountCents: number,
  cadence: PlanCadence,
  start: Date,
  due: Date,
): number[] {
  const fit = [...options]
    .sort((a, b) => a - b)
    .filter((n) => planFits(amountCents, n, cadence, start, due));
  return fit.length ? fit : [1];
}

export interface PlanFeeImpact {
  installments: (PlanInstallment & { fees: FeeBreakdown })[];
  /** What the family pays across the whole plan, fees included. */
  totalCents: number;
  /** What paying in full would cost. */
  fullPayTotalCents: number;
  /** Extra the family pays with this plan versus paying in full (0 for size 1). */
  extraCents: number;
  /** Sum of the Athleit charges across the plan. */
  athleitChargeCents: number;
}

/** Fee impact of a plan: each installment is its own transaction with its own fee breakdown on the frozen config. */
export function planFeeImpact(
  amountCents: number,
  n: number,
  cadence: PlanCadence,
  start: Date,
  policy: FeePolicy,
  cfg: FeeConfig,
): PlanFeeImpact {
  const installments = generatePlan(amountCents, n, cadence, start).map((i) => ({
    ...i,
    fees: computeFees(i.amountCents, policy, cfg),
  }));
  const totalCents = installments.reduce((s, i) => s + i.fees.totalCents, 0);
  const full = computeFees(amountCents, policy, cfg).totalCents;
  return {
    installments,
    totalCents,
    fullPayTotalCents: full,
    extraCents: totalCents - full,
    athleitChargeCents: installments.reduce((s, i) => s + i.fees.platformFeeCents, 0),
  };
}

/** Version of the autopay consent wording. The server records it with the consent (supabase/functions/_shared/payments/schemas.ts). */
export const AUTOPAY_CONSENT_VERSION = 'autopay-2026-11';
export const autopayConsentText = (payee: string) =>
  `I authorize ${payee} to charge the card I use today for each remaining payment on its due date. I can turn automatic payments off, change the card, or pay early at any time in Pay.`;
export const installmentLabel = (sequence: number, count: number) =>
  `Installment ${sequence} of ${count}`;
