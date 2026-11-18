/**
 * Date-only logic shared by the web and mobile pickers. Dates are ISO `YYYY-MM-DD` strings and are
 * NEVER converted through a local-time `Date` (that is where timezone shifts come from): all arithmetic
 * uses UTC calendar fields, so "2026-03-08" is the same day in every zone.
 */
export interface YMD {
  y: number;
  m: number; // 1..12
  d: number; // 1..31
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
export const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));
export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y: number, m: number) =>
  [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;

export function toIso({ y, m, d }: YMD): string {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** Parses a strict, real calendar date; `null` for anything else (including 2026-02-30). */
export function parseIso(s: string | null | undefined): YMD | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!match) return null;
  const y = +match[1]!;
  const m = +match[2]!;
  const d = +match[3]!;
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

/** 0 = Sunday. Uses UTC so the machine's zone cannot move the day. */
export function weekdayOf({ y, m, d }: YMD): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(iso: string, days: number): string {
  const p = parseIso(iso);
  if (!p) throw new Error(`Invalid date: ${iso}`);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return toIso({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

/** Moves by whole months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(iso: string, months: number): string {
  const p = parseIso(iso);
  if (!p) throw new Error(`Invalid date: ${iso}`);
  const index = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (((index % 12) + 12) % 12) + 1;
  return toIso({ y, m, d: Math.min(p.d, daysInMonth(y, m)) });
}

export interface DateLimits {
  min?: string | undefined;
  max?: string | undefined;
  /** Individual dates that cannot be chosen. */
  disabledDates?: readonly string[] | undefined;
}

export function isDateDisabled(iso: string, { min, max, disabledDates }: DateLimits = {}): boolean {
  if (min && iso < min) return true;
  if (max && iso > max) return true;
  return disabledDates?.includes(iso) ?? false;
}

/** Nearest allowed date inside [min, max] (ISO strings compare correctly as text). */
export function clampIso(iso: string, { min, max }: DateLimits = {}): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

export interface GridDay {
  iso: string;
  day: number;
  inMonth: boolean;
}

/** Always 6 rows of 7 so the popover does not change height between months. `weekStart` 0 = Sunday. */
export function monthGrid(year: number, month: number, weekStart = 0): GridDay[][] {
  const first: YMD = { y: year, m: month, d: 1 };
  const lead = (weekdayOf(first) - weekStart + 7) % 7;
  const start = addDays(toIso(first), -lead);
  const weeks: GridDay[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: GridDay[] = [];
    for (let i = 0; i < 7; i++) {
      const iso = addDays(start, w * 7 + i);
      const p = parseIso(iso)!;
      row.push({ iso, day: p.d, inMonth: p.m === month && p.y === year });
    }
    weeks.push(row);
  }
  return weeks;
}

/** Weekday header order, e.g. weekStart 1 = Mon…Sun. */
export function weekdayOrder(weekStart = 0): number[] {
  return Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);
}

/** "Nov 30, 2026". Empty string for an empty or invalid value. */
export function formatDateFriendly(iso: string | null | undefined): string {
  const p = parseIso(iso);
  return p ? `${MONTH_SHORT[p.m - 1]} ${p.d}, ${p.y}` : '';
}

/** "Monday, November 30, 2026" for screen readers. */
export function formatDateLong(iso: string): string {
  const p = parseIso(iso);
  return p ? `${WEEKDAY_NAMES[weekdayOf(p)]}, ${MONTH_NAMES[p.m - 1]} ${p.d}, ${p.y}` : '';
}

/** Today as a local calendar date (the one place a local `Date` is read). */
export function todayIso(now: Date = new Date()): string {
  return toIso({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}

/** Years to offer in the year chooser, newest first when `descending`. */
export function yearRange(
  limits: DateLimits,
  fallbackSpan: { before: number; after: number },
  current: number,
) {
  const min = parseIso(limits.min)?.y ?? current - fallbackSpan.before;
  const max = parseIso(limits.max)?.y ?? current + fallbackSpan.after;
  const out: number[] = [];
  for (let y = min; y <= max; y++) out.push(y);
  return out;
}

/* ----- time of day ("HH:MM", 24 hour) ----- */

export interface HM {
  h: number;
  min: number;
}

export function parseTime(s: string | null | undefined): HM | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const h = +m[1]!;
  const min = +m[2]!;
  return h > 23 || min > 59 ? null : { h, min };
}
export const toTime = ({ h, min }: HM) => `${pad(h)}:${pad(min)}`;

/** "3:05 PM" */
export function formatTimeFriendly(s: string | null | undefined): string {
  const t = parseTime(s);
  if (!t) return '';
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return `${h12}:${pad(t.min)} ${t.h < 12 ? 'AM' : 'PM'}`;
}
