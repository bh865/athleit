/**
 * The fee module: the ONE place the charge for a payment is computed in TypeScript. It mirrors
 * `private.fee_breakdown` / `private.allocate_cents` in SQL; `fees.test.ts` parses the vectors from
 * supabase/tests/database/fn_fee_breakdown.test.sql and asserts both implementations agree.
 *
 * To change a rule (who pays the Athleit charge, how the gross-up works) edit this file and the SQL
 * function, then update the vectors: the tests will not pass until they agree.
 *
 *   athleit_charge = flat + round_half_up(base * bps / 10000)        added on top, paid by the payer,
 *                                                                    collected as the application fee
 *   absorb : total = base + athleit_charge                          the team absorbs Stripe's fee
 *   pass_on: total = ceil((base + athleit_charge + stripe_fixed) / (1 - stripe_bps/10000))
 *            service_fee = total - base - athleit_charge            the payer covers Stripe's estimated fee
 *   estimated_stripe_fee = round_half_up(total * stripe_bps / 10000) + stripe_fixed
 *
 * The client NEVER sends these numbers to the server; the server recomputes from database rows.
 * This module exists for the live preview in the issuing form and for tests.
 */
import { toCents, type Cents } from './money';

export type FeePolicy = 'absorb' | 'pass_on';

export interface FeeConfig {
  platform_fee_flat_cents: number;
  platform_fee_bps: number;
  /** Estimate only: sizes the pass-through. The real fee is read from Stripe's balance transaction. */
  stripe_fee_bps: number;
  stripe_fee_fixed_cents: number;
}

export interface FeeBreakdown {
  baseCents: Cents;
  /** The Athleit charge (application fee). */
  platformFeeCents: Cents;
  /** The pass-through "service fee" (0 under absorb). */
  processingFeeCents: Cents;
  totalCents: Cents;
  estimatedStripeFeeCents: Cents;
  /** What the team nets after Stripe's estimated fee (under absorb: base - fee; pass_on: ~base). */
  estimatedNetCents: Cents;
}

/** Integer round-half-up of (a * b) / d for non-negative integers. */
function mulDivRound(a: number, b: number, d: number): number {
  return Math.floor((a * b + Math.floor(d / 2)) / d);
}

export function computeFees(baseCents: number, policy: FeePolicy, cfg: FeeConfig): FeeBreakdown {
  const base = toCents(baseCents);
  const {
    platform_fee_flat_cents: flat,
    platform_fee_bps: bps,
    stripe_fee_bps: sbps,
    stripe_fee_fixed_cents: sfix,
  } = cfg;
  if (base <= 0) throw new RangeError('invalid_amount');
  if (policy !== 'absorb' && policy !== 'pass_on') throw new RangeError('invalid_fee_policy');
  for (const n of [flat, bps, sbps, sfix]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('invalid_fee_config');
  }
  if (sbps >= 10000) throw new RangeError('invalid_fee_config');

  const charge = flat + mulDivRound(base, bps, 10000);
  const denom = 10000 - sbps;
  const total =
    policy === 'absorb'
      ? base + charge
      : Math.floor(((base + charge + sfix) * 10000 + denom - 1) / denom);
  const est = mulDivRound(total, sbps, 10000) + sfix;
  return {
    baseCents: base,
    platformFeeCents: toCents(charge),
    processingFeeCents: toCents(total - base - charge),
    totalCents: toCents(total),
    estimatedStripeFeeCents: toCents(est),
    estimatedNetCents: toCents(total - charge - est),
  };
}

/**
 * Split `total` across `weights` so the parts sum exactly to `total` (largest remainder; ties go to the
 * lowest index). Used to allocate the fee lines across the requests of one payment.
 */
export function allocateCents(total: number, weights: readonly number[]): Cents[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (total < 0 || weights.length === 0 || sum <= 0 || weights.some((w) => w < 0)) {
    throw new RangeError('invalid_allocation');
  }
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  let left = total - parts.reduce((a, p) => a + p, 0);
  const order = weights
    .map((w, i) => ({ i, rem: (total * w) % sum }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] = (parts[i] as number) + 1;
    left -= 1;
  }
  return parts.map(toCents);
}

export interface QuoteLine {
  kind: 'item' | 'athleit_charge' | 'service_fee';
  label: string;
  amountCents: Cents;
  requestId?: string;
}

/** Label shown to payers for the pass-through fee. Legal review pending: see docs/payments-compliance.md. */
export const SERVICE_FEE_LABEL = 'Service fee';
export const ATHLEIT_CHARGE_LABEL = 'Athleit charge';
