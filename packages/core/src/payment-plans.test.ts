import { describe, expect, it } from 'vitest';

import type { FeeConfig } from './fees';
import {
  availablePlanSizes,
  generatePlan,
  planDueAt,
  planFeeImpact,
  planFits,
  type PlanCadence,
} from './payment-plans';

const d = (s: string) => new Date(s);
const iso = (x: Date) => x.toISOString();
const STRIPE: FeeConfig = {
  platform_fee_flat_cents: 0,
  platform_fee_bps: 0,
  stripe_fee_bps: 290,
  stripe_fee_fixed_cents: 30,
};
const ATHLEIT: FeeConfig = { ...STRIPE, platform_fee_flat_cents: 50, platform_fee_bps: 100 };

describe('generatePlan: amounts', () => {
  it('splits evenly and puts the remainder cents on the first installment, for every size', () => {
    for (const amount of [4500, 4501, 10000, 9999, 700]) {
      for (let n = 1; n <= 6; n++) {
        if (amount < 50 * n) continue;
        const p = generatePlan(amount, n, 'weekly', d('2026-01-01T00:00:00Z'));
        expect(p).toHaveLength(n);
        expect(p.reduce((s, i) => s + i.amountCents, 0)).toBe(amount);
        const base = Math.floor(amount / n);
        expect(p[0]!.amountCents).toBe(base + (amount % n));
        for (const i of p.slice(1)) expect(i.amountCents).toBe(base);
        expect(p.map((i) => i.sequence)).toEqual(Array.from({ length: n }, (_, k) => k + 1));
      }
    }
  });
  it('known vectors: $45.01 in 4 and $100.00 in 3', () => {
    expect(
      generatePlan(4501, 4, 'weekly', d('2026-01-01T00:00:00Z')).map((i) => i.amountCents),
    ).toEqual([1126, 1125, 1125, 1125]);
    expect(
      generatePlan(10000, 3, 'weekly', d('2026-01-01T00:00:00Z')).map((i) => i.amountCents),
    ).toEqual([3334, 3333, 3333]);
  });
  it('refuses a size that would make an installment under 50 cents, and bad sizes', () => {
    expect(() => generatePlan(249, 5, 'weekly', d('2026-01-01T00:00:00Z'))).toThrow(
      'invalid_plan_amount',
    );
    expect(() => generatePlan(1000, 7, 'weekly', d('2026-01-01T00:00:00Z'))).toThrow(
      'invalid_plan_size',
    );
    expect(() => generatePlan(1000, 0, 'weekly', d('2026-01-01T00:00:00Z'))).toThrow(
      'invalid_plan_size',
    );
  });
});

describe('planDueAt: dates', () => {
  const start = d('2026-03-01T15:30:00Z');
  it('weekly and biweekly are exact multiples of 7 / 14 days, across a US DST change', () => {
    // Mar 8 2026 is the US spring-forward day: the instants stay exactly 7 days (168h) apart.
    expect(iso(planDueAt(start, 'weekly', 1))).toBe('2026-03-08T15:30:00.000Z');
    expect(iso(planDueAt(start, 'weekly', 2))).toBe('2026-03-15T15:30:00.000Z');
    expect(iso(planDueAt(start, 'biweekly', 3))).toBe('2026-04-12T15:30:00.000Z');
    expect(planDueAt(start, 'weekly', 2).getTime() - planDueAt(start, 'weekly', 1).getTime()).toBe(
      7 * 86400000,
    );
  });
  it('monthly keeps the time of day and clamps to month end from the START, never iteratively', () => {
    const jan31 = d('2026-01-31T10:00:00Z');
    expect(iso(planDueAt(jan31, 'monthly', 1))).toBe('2026-02-28T10:00:00.000Z');
    expect(iso(planDueAt(jan31, 'monthly', 2))).toBe('2026-03-31T10:00:00.000Z');
    expect(iso(planDueAt(jan31, 'monthly', 3))).toBe('2026-04-30T10:00:00.000Z');
    expect(iso(planDueAt(d('2028-01-31T10:00:00Z'), 'monthly', 1))).toBe(
      '2028-02-29T10:00:00.000Z',
    );
    expect(iso(planDueAt(d('2026-11-15T09:00:00Z'), 'monthly', 3))).toBe(
      '2027-02-15T09:00:00.000Z',
    );
  });
  it('installment 1 is due at checkout', () => {
    for (const c of ['weekly', 'biweekly', 'monthly'] as PlanCadence[])
      expect(generatePlan(1000, 2, c, start)[0]!.dueAt.getTime()).toBe(start.getTime());
  });
});

describe('planFits / availablePlanSizes', () => {
  const start = d('2026-01-01T00:00:00Z');
  it('the last installment must be due on or before the due date', () => {
    // weekly, 6 splits -> last at +35 days
    expect(planFits(6000, 6, 'weekly', start, d('2026-02-05T00:00:00Z'))).toBe(true);
    expect(planFits(6000, 6, 'weekly', start, d('2026-02-04T23:59:59Z'))).toBe(false);
    expect(planFits(6000, 6, 'weekly', start, d('2026-01-11T00:00:00Z'))).toBe(false); // 10 days left
  });
  it('size 1 always fits and options that do not fit are dropped', () => {
    const due = d('2026-01-20T00:00:00Z'); // 19 days: weekly fits up to 3 installments (last at +14)
    expect(availablePlanSizes([1, 2, 3, 4, 6], 6000, 'weekly', start, due)).toEqual([1, 2, 3]);
    expect(availablePlanSizes([6, 4], 6000, 'weekly', start, due)).toEqual([1]);
    expect(availablePlanSizes([1], 6000, 'weekly', start, due)).toEqual([1]);
  });
  it('an option whose installments would be under 50 cents is not offered', () => {
    expect(availablePlanSizes([1, 2, 3], 149, 'weekly', start, d('2027-01-01T00:00:00Z'))).toEqual([
      1, 2,
    ]);
  });
  it('monthly at month end', () => {
    expect(planFits(3000, 3, 'monthly', d('2026-01-31T00:00:00Z'), d('2026-03-31T00:00:00Z'))).toBe(
      true,
    );
    expect(planFits(3000, 3, 'monthly', d('2026-01-31T00:00:00Z'), d('2026-03-30T23:59:59Z'))).toBe(
      false,
    );
  });
});

describe('planFeeImpact: fees repeat per installment', () => {
  const start = d('2026-01-01T00:00:00Z');
  it('absorb with an Athleit charge: the flat charge repeats on every installment', () => {
    // $45.00 in 3 = 3 x $15.00. Per installment: charge = 50 + round(1500*100/10000) = 65.
    const p = planFeeImpact(4500, 3, 'weekly', start, 'absorb', ATHLEIT);
    expect(p.installments.map((i) => i.amountCents)).toEqual([1500, 1500, 1500]);
    expect(p.installments.map((i) => i.fees.platformFeeCents)).toEqual([65, 65, 65]);
    expect(p.totalCents).toBe(4500 + 195);
    // In full: charge = 50 + 45 = 95, total 4595.
    expect(p.fullPayTotalCents).toBe(4595);
    expect(p.extraCents).toBe(100);
    expect(p.athleitChargeCents).toBe(195);
  });
  it('pass_on repeats Stripe fixed fee and rounds up per installment', () => {
    const p = planFeeImpact(4500, 3, 'weekly', start, 'pass_on', STRIPE);
    // Each $15.00: total = ceil((1500 + 30) / 0.971) = ceil(1575.69) = 1576.
    expect(p.installments.map((i) => i.fees.totalCents)).toEqual([1576, 1576, 1576]);
    expect(p.totalCents).toBe(4728);
    // In full (the documented worked example): $46.66.
    expect(p.fullPayTotalCents).toBe(4666);
    expect(p.extraCents).toBe(62);
  });
  it('remainder cents land on installment 1 and each installment is quoted on its own amount', () => {
    const p = planFeeImpact(4501, 4, 'weekly', start, 'pass_on', STRIPE);
    expect(p.installments.map((i) => i.amountCents)).toEqual([1126, 1125, 1125, 1125]);
    expect(p.installments[0]!.fees.totalCents).toBeGreaterThanOrEqual(
      p.installments[1]!.fees.totalCents,
    );
    expect(p.installments.reduce((s, i) => s + i.amountCents, 0)).toBe(4501);
  });
  it('size 1 costs exactly what paying in full costs', () => {
    const p = planFeeImpact(4500, 1, 'monthly', start, 'absorb', ATHLEIT);
    expect(p.extraCents).toBe(0);
  });
  it('worked 4-installment example for the docs: $100.00, absorb, 50c + 1%', () => {
    const p = planFeeImpact(10000, 4, 'biweekly', start, 'absorb', ATHLEIT);
    expect(p.installments.map((i) => i.amountCents)).toEqual([2500, 2500, 2500, 2500]);
    expect(p.installments.map((i) => i.fees.platformFeeCents)).toEqual([75, 75, 75, 75]);
    expect(p.totalCents).toBe(10300);
    expect(p.fullPayTotalCents).toBe(10150);
    expect(p.extraCents).toBe(150);
  });
});
