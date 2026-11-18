import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { allocateCents, computeFees, type FeeConfig, type FeePolicy } from './fees';

interface Vector {
  base: number;
  policy: FeePolicy;
  cfg: FeeConfig;
  charge: number;
  service: number;
  total: number;
  est: number;
  net: number;
}

/** The vectors live in the SQL test so both implementations are held to the same expectations. */
function loadVectors(): Vector[] {
  const sql = readFileSync(
    join(__dirname, '../../../supabase/tests/database/fn_fee_breakdown.test.sql'),
    'utf8',
  );
  const block = sql.split('-- @vectors-begin')[1]?.split('-- @vectors-end')[0] ?? '';
  const out: Vector[] = [];
  for (const line of block.split('\n')) {
    const m = /\((.+)\)/.exec(line);
    if (!m) continue;
    const c = (m[1] as string).split(',').map((s) => s.trim().replace(/'/g, ''));
    const n = (i: number) => Number(c[i]);
    out.push({
      base: n(0),
      policy: c[1] as FeePolicy,
      cfg: {
        platform_fee_flat_cents: n(2),
        platform_fee_bps: n(3),
        stripe_fee_bps: n(4),
        stripe_fee_fixed_cents: n(5),
      },
      charge: n(6),
      service: n(7),
      total: n(8),
      est: n(9),
      net: n(10),
    });
  }
  return out;
}

const CFG: FeeConfig = {
  platform_fee_flat_cents: 0,
  platform_fee_bps: 0,
  stripe_fee_bps: 290,
  stripe_fee_fixed_cents: 30,
};

describe('fee module vs the shared vectors (kept in sync with SQL)', () => {
  const vectors = loadVectors();
  it('found the vectors', () => expect(vectors.length).toBeGreaterThanOrEqual(15));
  it.each(vectors.map((v, i) => [i, v] as const))('vector %i', (_i, v) => {
    const f = computeFees(v.base, v.policy, v.cfg);
    expect({
      charge: f.platformFeeCents,
      service: f.processingFeeCents,
      total: f.totalCents,
      est: f.estimatedStripeFeeCents,
      net: f.estimatedNetCents,
    }).toEqual({ charge: v.charge, service: v.service, total: v.total, est: v.est, net: v.net });
  });
});

describe('worked examples ($45.00)', () => {
  it('absorb, no Athleit charge: payer pays exactly the base', () => {
    const f = computeFees(4500, 'absorb', CFG);
    expect(f.totalCents).toBe(4500);
    expect(f.processingFeeCents).toBe(0);
  });
  it('pass_on: payer covers the estimated Stripe fee so the team nets the base', () => {
    const f = computeFees(4500, 'pass_on', CFG);
    expect(f.totalCents).toBe(4666);
    expect(f.processingFeeCents).toBe(166);
    expect(f.estimatedNetCents).toBeGreaterThanOrEqual(4500);
  });
});

const cfgArb = fc.record({
  platform_fee_flat_cents: fc.integer({ min: 0, max: 500 }),
  platform_fee_bps: fc.integer({ min: 0, max: 2000 }),
  stripe_fee_bps: fc.integer({ min: 0, max: 1000 }),
  stripe_fee_fixed_cents: fc.integer({ min: 0, max: 100 }),
});
const policyArb = fc.constantFrom<FeePolicy>('absorb', 'pass_on');
const baseArb = fc.integer({ min: 1, max: 5_000_000 });

describe('fee properties', () => {
  it('amounts are never negative and line items sum to the total, to the cent', () => {
    fc.assert(
      fc.property(baseArb, policyArb, cfgArb, (base, policy, cfg) => {
        const f = computeFees(base, policy, cfg);
        expect(f.platformFeeCents).toBeGreaterThanOrEqual(0);
        expect(f.processingFeeCents).toBeGreaterThanOrEqual(0);
        expect(f.totalCents).toBeGreaterThanOrEqual(base);
        expect(f.baseCents + f.platformFeeCents + f.processingFeeCents).toBe(f.totalCents);
        expect(Number.isSafeInteger(f.totalCents)).toBe(true);
      }),
    );
  });

  it('absorb has no service fee', () => {
    fc.assert(
      fc.property(baseArb, cfgArb, (base, cfg) => {
        expect(computeFees(base, 'absorb', cfg).processingFeeCents).toBe(0);
      }),
    );
  });

  it('pass_on nets the base within the estimate model (never short, at most 2c over)', () => {
    fc.assert(
      fc.property(baseArb, cfgArb, (base, cfg) => {
        const f = computeFees(base, 'pass_on', cfg);
        expect(f.estimatedNetCents).toBeGreaterThanOrEqual(base);
        expect(f.estimatedNetCents).toBeLessThanOrEqual(base + 2);
      }),
    );
  });

  it('zero bps and zero flat means no Athleit charge', () => {
    fc.assert(
      fc.property(baseArb, policyArb, (base, policy) => {
        expect(computeFees(base, policy, { ...CFG }).platformFeeCents).toBe(0);
      }),
    );
  });

  it('allocation sums exactly and keeps parts proportional within one cent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.array(fc.integer({ min: 1, max: 5_000_000 }), { minLength: 1, maxLength: 25 }),
        (total, weights) => {
          const parts = allocateCents(total, weights);
          expect(parts.reduce((a, p) => a + p, 0)).toBe(total);
          const sum = weights.reduce((a, w) => a + w, 0);
          parts.forEach((p, i) =>
            expect(Math.abs(p - (total * (weights[i] as number)) / sum)).toBeLessThan(1),
          );
        },
      ),
    );
  });

  it('rejects invalid inputs', () => {
    expect(() => computeFees(0, 'absorb', CFG)).toThrow('invalid_amount');
    expect(() => computeFees(100, 'absorb', { ...CFG, stripe_fee_bps: 10000 })).toThrow(
      'invalid_fee_config',
    );
    expect(() => computeFees(100.5, 'absorb', CFG)).toThrow();
    expect(() => allocateCents(10, [0, 0])).toThrow('invalid_allocation');
  });
});
