// Time-zone aware helpers for the schedule UI. Events are stored as an instant plus the IANA zone
// they happen in; they are DISPLAYED in that zone, with the viewer's local time added when it
// differs. Everything here is pure (no Date.now), so it is easy to test across DST changes.

const pad = (n: number) => String(n).padStart(2, '0');

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
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

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(zone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
    });
    fmtCache.set(zone, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a zone. */
export function zonedParts(instant: Date | string, zone: string): Parts {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const out: Partial<Parts> = {};
  for (const p of partsFormatter(zone).formatToParts(d)) {
    if (p.type === 'year') out.year = Number(p.value);
    else if (p.type === 'month') out.month = Number(p.value);
    else if (p.type === 'day') out.day = Number(p.value);
    else if (p.type === 'hour') out.hour = Number(p.value);
    else if (p.type === 'minute') out.minute = Number(p.value);
    else if (p.type === 'weekday')
      out.weekday = WEEKDAYS.indexOf(p.value as (typeof WEEKDAYS)[number]);
  }
  return out as Parts;
}

/** 'YYYY-MM-DD' of an instant in a zone. */
export function localDateKey(instant: Date | string, zone: string): string {
  const p = zonedParts(instant, zone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 'HH:MM' (24h) of an instant in a zone, for form inputs. */
export function localTimeKey(instant: Date | string, zone: string): string {
  const p = zonedParts(instant, zone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * The instant at which the wall clock in `zone` reads `date` + `time`. For a time that does not
 * exist (spring-forward gap) this resolves to the instant just after the gap, matching Postgres;
 * for a repeated time (fall back) it takes the first occurrence.
 */
export function zonedTimeToInstant(date: string, time: string, zone: string): Date {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (t: number) => {
    const p = zonedParts(new Date(t), zone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(t / 60000) * 60000;
  };
  let guess = wanted;
  let exact = false;
  for (let i = 0; i < 4; i++) {
    const p = zonedParts(new Date(guess), zone);
    const diff = wanted - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    if (diff === 0) {
      exact = true;
      break;
    }
    guess += diff;
  }
  if (!exact) {
    // The wall-clock time does not exist (spring-forward gap): interpret it with the offset in
    // force before the change, like Postgres does.
    return new Date(wanted - offsetAt(wanted - 86400000));
  }
  // A repeated time (fall back): take the first occurrence.
  const earlier = guess - 3600_000;
  const pe = zonedParts(new Date(earlier), zone);
  if (Date.UTC(pe.year, pe.month - 1, pe.day, pe.hour, pe.minute) === wanted) guess = earlier;
  return new Date(guess);
}

const time12 = (p: Parts) => {
  const h = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h}:${pad(p.minute)} ${p.hour < 12 ? 'AM' : 'PM'}`;
};

export function zoneAbbreviation(instant: Date | string, zone: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? zone;
}

export interface EventTimeLabel {
  /** "SAT" and "21": the date block. */
  weekdayShort: string;
  dayNumber: string;
  /** "Sat, Nov 21" */
  dateLabel: string;
  /** "10:00 AM" in the event's zone */
  startLabel: string;
  /** "10:00 AM – 11:30 AM" */
  rangeLabel: string;
  /** "EST" etc. for the event's zone */
  zoneLabel: string;
  /** The viewer's local time when their zone shows a different clock time ("7:00 AM PST"), else null. */
  viewerLocalLabel: string | null;
}

/** Everything a row, card or drawer needs to show an event's time. */
export function describeEventTime(
  startsAt: string,
  endsAt: string,
  eventZone: string,
  viewerZone?: string | null,
): EventTimeLabel {
  const s = zonedParts(startsAt, eventZone);
  const e = zonedParts(endsAt, eventZone);
  const sameDay = s.year === e.year && s.month === e.month && s.day === e.day;
  const monthShort = MONTHS[s.month - 1]!.slice(0, 3);
  const startLabel = time12(s);
  let viewerLocalLabel: string | null = null;
  if (viewerZone && viewerZone !== eventZone) {
    const v = zonedParts(startsAt, viewerZone);
    if (v.hour !== s.hour || v.minute !== s.minute || v.day !== s.day) {
      const sameDate = v.day === s.day && v.month === s.month;
      viewerLocalLabel = `${sameDate ? '' : `${WEEKDAYS[v.weekday]} `}${time12(v)} ${zoneAbbreviation(startsAt, viewerZone)}`;
    }
  }
  return {
    weekdayShort: WEEKDAYS[s.weekday]!.toUpperCase(),
    dayNumber: String(s.day),
    dateLabel: `${WEEKDAYS[s.weekday]}, ${monthShort} ${s.day}`,
    startLabel,
    rangeLabel: sameDay
      ? `${startLabel} – ${time12(e)}`
      : `${startLabel} – ${monthShort} ${e.day}, ${time12(e)}`,
    zoneLabel: zoneAbbreviation(startsAt, eventZone),
    viewerLocalLabel,
  };
}

// Calendar grids ---------------------------------------------------------------------------------

export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The Sunday-start week containing a date, as seven date keys. */
export function weekDays(dateKey: string): string[] {
  const start = addDays(dateKey, -weekdayOf(dateKey));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Weeks (rows of seven date keys) covering a month, starting on Sunday. */
export function monthGrid(year: number, month1: number): string[][] {
  const first = `${year}-${pad(month1)}-01`;
  const gridStart = addDays(first, -weekdayOf(first));
  const daysIn = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const rows = Math.ceil((weekdayOf(first) + daysIn) / 7);
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: 7 }, (_, c) => addDays(gridStart, r * 7 + c)),
  );
}

export function monthTitle(year: number, month1: number): string {
  return `${MONTHS[month1 - 1]} ${year}`;
}

export function shiftMonth(year: number, month1: number, delta: number) {
  const t = new Date(Date.UTC(year, month1 - 1 + delta, 1));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 };
}

export function weekTitle(days: string[]): string {
  const a = days[0]!;
  const b = days[6]!;
  const [, am, ad] = a.split('-').map(Number) as [number, number, number];
  const [, bm, bd] = b.split('-').map(Number) as [number, number, number];
  const ma = MONTHS[am - 1]!.slice(0, 3);
  const mb = MONTHS[bm - 1]!.slice(0, 3);
  return ma === mb ? `${ma} ${ad} – ${bd}` : `${ma} ${ad} – ${mb} ${bd}`;
}

/** An instant range (padded a day each side so zone differences never drop an event) for a window of date keys. */
export function queryRangeForDays(firstDay: string, lastDay: string): { from: string; to: string } {
  return {
    from: new Date(`${addDays(firstDay, -1)}T00:00:00Z`).toISOString(),
    to: new Date(`${addDays(lastDay, 2)}T00:00:00Z`).toISOString(),
  };
}

/** Group items by the event-local date of their start. */
export function groupByLocalDay<T extends { starts_at: string; timezone: string }>(
  items: readonly T[],
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const k = localDateKey(it.starts_at, it.timezone);
    const list = out.get(k);
    if (list) list.push(it);
    else out.set(k, [it]);
  }
  return out;
}

/** Subscribe URL for a calendar feed token (served by the calendar-feed Edge Function). */
export function calendarFeedUrl(supabaseUrl: string, token: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/calendar-feed/${token}.ics`;
}
