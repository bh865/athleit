/**
 * Money is integer cents + a currency (USD only for now). There are no floats in any money path:
 * parsing and formatting work on strings and integers, never on `Number` fractions.
 */
export const CURRENCY = 'usd' as const;
export type Currency = typeof CURRENCY;

/** An integer number of cents (not enforced by the type system alone; use `toCents`). */
export type Cents = number & { readonly __brand: 'Cents' };

/** Stripe's USD minimum charge, and the per-request ceiling the database enforces. */
export const MIN_CHARGE_CENTS = 50;
export const MAX_REQUEST_CENTS = 5_000_000;

export function toCents(n: number): Cents {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Not an integer number of cents: ${n}`);
  return n as Cents;
}

export function sumCents(values: readonly number[]): Cents {
  let total = 0;
  for (const v of values) total += toCents(v);
  return toCents(total);
}

/** "$45.00", "-$1.05", "$1,234.50". Always two decimals. */
export function formatCents(c: number): string {
  const v = toCents(c);
  const abs = Math.abs(v);
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${v < 0 ? '-' : ''}$${dollars}.${(abs % 100).toString().padStart(2, '0')}`;
}

/** Screen-reader wording: "45 dollars", "45 dollars and 50 cents", "50 cents". */
export function spokenCents(c: number): string {
  const v = Math.abs(toCents(c));
  const d = Math.floor(v / 100);
  const r = v % 100;
  const dollars = `${d} ${d === 1 ? 'dollar' : 'dollars'}`;
  const cents = `${r} ${r === 1 ? 'cent' : 'cents'}`;
  const out = d > 0 && r > 0 ? `${dollars} and ${cents}` : d > 0 ? dollars : cents;
  return c < 0 ? `minus ${out}` : out;
}

/**
 * Parse what a person types ("45", "45.5", "$1,234.50") into cents, with string arithmetic only.
 * Returns null for anything that is not a plain non-negative amount with at most 2 decimals.
 */
export function parseDollarsToCents(input: string): Cents | null {
  const s = input.trim().replace(/^\$/, '').replace(/,/g, '');
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const whole = m[1] as string;
  const frac = (m[2] ?? '').padEnd(2, '0');
  return toCents(Number(whole) * 100 + Number(frac));
}

/** Plain "45.00" for an editable field (no symbol, no grouping). */
export function centsToInputValue(c: number): string {
  const v = toCents(c);
  return `${Math.floor(v / 100)}.${(v % 100).toString().padStart(2, '0')}`;
}
