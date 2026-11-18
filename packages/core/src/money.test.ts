import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  centsToInputValue,
  formatCents,
  parseDollarsToCents,
  spokenCents,
  sumCents,
  toCents,
} from './money';

describe('money', () => {
  it('rejects non-integers', () => {
    expect(() => toCents(1.5)).toThrow();
    expect(() => toCents(Number.NaN)).toThrow();
    expect(() => sumCents([1, 2.5])).toThrow();
  });

  it('formats cents with two decimals and grouping', () => {
    expect(formatCents(4500)).toBe('$45.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(123450)).toBe('$1,234.50');
    expect(formatCents(-105)).toBe('-$1.05');
  });

  it('speaks amounts for screen readers', () => {
    expect(spokenCents(4500)).toBe('45 dollars');
    expect(spokenCents(4550)).toBe('45 dollars and 50 cents');
    expect(spokenCents(100)).toBe('1 dollar');
    expect(spokenCents(50)).toBe('50 cents');
  });

  it('parses typed dollars without floats', () => {
    expect(parseDollarsToCents('45')).toBe(4500);
    expect(parseDollarsToCents('45.5')).toBe(4550);
    expect(parseDollarsToCents('$1,234.50')).toBe(123450);
    expect(parseDollarsToCents('0.07')).toBe(7);
    expect(parseDollarsToCents('45.123')).toBeNull();
    expect(parseDollarsToCents('-5')).toBeNull();
    expect(parseDollarsToCents('abc')).toBeNull();
    expect(parseDollarsToCents('')).toBeNull();
  });

  it('round-trips through the input value', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5_000_000 }), (c) => {
        expect(parseDollarsToCents(centsToInputValue(c))).toBe(c);
        expect(parseDollarsToCents(formatCents(c))).toBe(c);
      }),
    );
  });
});
