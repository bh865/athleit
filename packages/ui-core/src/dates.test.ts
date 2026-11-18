import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  clampIso,
  daysInMonth,
  formatDateFriendly,
  formatDateLong,
  formatTimeFriendly,
  isDateDisabled,
  monthGrid,
  parseIso,
  parseTime,
  toIso,
  weekdayOf,
} from './dates';

describe('parseIso / toIso', () => {
  it('round-trips real dates and rejects impossible ones', () => {
    expect(toIso(parseIso('2026-11-30')!)).toBe('2026-11-30');
    expect(parseIso('2026-02-30')).toBeNull();
    expect(parseIso('2025-02-29')).toBeNull();
    expect(parseIso('2024-02-29')).toEqual({ y: 2024, m: 2, d: 29 });
    expect(parseIso('2100-02-29')).toBeNull(); // century, not a leap year
    expect(parseIso('2000-02-29')).not.toBeNull();
    expect(parseIso('2026-1-5')).toBeNull();
    expect(parseIso('')).toBeNull();
  });
  it('knows month lengths', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});

describe('date arithmetic never shifts with the timezone', () => {
  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08'); // US DST starts
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });
  it('adds months clamping the day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15');
  });
  it('weekday is stable', () => {
    expect(weekdayOf(parseIso('2026-11-30')!)).toBe(1); // Monday
    expect(formatDateLong('2026-11-30')).toBe('Monday, November 30, 2026');
  });
});

describe('limits', () => {
  it('disables outside min/max and listed dates', () => {
    const l = { min: '2026-11-10', max: '2026-11-20', disabledDates: ['2026-11-15'] };
    expect(isDateDisabled('2026-11-09', l)).toBe(true);
    expect(isDateDisabled('2026-11-10', l)).toBe(false);
    expect(isDateDisabled('2026-11-20', l)).toBe(false);
    expect(isDateDisabled('2026-11-21', l)).toBe(true);
    expect(isDateDisabled('2026-11-15', l)).toBe(true);
    expect(clampIso('2026-12-01', l)).toBe('2026-11-20');
    expect(clampIso('2026-01-01', l)).toBe('2026-11-10');
  });
});

describe('monthGrid', () => {
  it('is 6 weeks of 7, starting on the chosen weekday', () => {
    const g = monthGrid(2026, 11, 0); // Nov 1 2026 is a Sunday
    expect(g).toHaveLength(6);
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0]![0]).toEqual({ iso: '2026-11-01', day: 1, inMonth: true });
    const mon = monthGrid(2026, 11, 1);
    expect(mon[0]![0]!.iso).toBe('2026-10-26');
    expect(mon[0]![0]!.inMonth).toBe(false);
  });
  it('handles leap February', () => {
    const days = monthGrid(2024, 2)
      .flat()
      .filter((d) => d.inMonth);
    expect(days).toHaveLength(29);
  });
});

describe('formatting', () => {
  it('friendly date and time', () => {
    expect(formatDateFriendly('2026-11-30')).toBe('Nov 30, 2026');
    expect(formatDateFriendly('nope')).toBe('');
    expect(formatTimeFriendly('15:05')).toBe('3:05 PM');
    expect(formatTimeFriendly('00:00')).toBe('12:00 AM');
    expect(parseTime('24:00')).toBeNull();
  });
});
