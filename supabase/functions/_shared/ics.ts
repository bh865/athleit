// iCalendar (RFC 5545) feed generation. Pure and dependency-free so it runs in Deno (the
// calendar-feed Edge Function) and in vitest, where the output is parsed back.
//
// Choices, all from RFC 5545:
//  - CRLF line ends and content lines folded at 75 OCTETS (3.1); TEXT values escaped (3.3.11).
//  - DTSTAMP is required on every VEVENT (3.8.7.2); we use the row's updated_at so output is stable
//    between requests (clients and ETag caching see no change unless the event changed).
//  - UID is stable per event ("event-<id>@athleit") so a changed event updates in place (3.8.4.7).
//  - SEQUENCE = revision - 1 (3.8.7.4): it rises only when time or place changes, exactly the changes
//    that bump events.revision.
//  - STATUS:CANCELLED for cancelled events (3.8.1.11); they stay in the feed so clients strike them.
//  - DTSTART/DTEND carry the event's own TZID with a matching VTIMEZONE (3.6.5) computed from the
//    platform tz database, so DST is right on both sides. Occurrences are materialized rows, so no
//    RRULE is needed and nothing in the feed depends on a client's recurrence engine.

export interface FeedEvent {
  id: string;
  team_name: string;
  type: string;
  title: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location_name: string | null;
  location_address: string | null;
  location_text: string | null;
  opponent_name: string | null;
  home_away: string | null;
  notes: string | null;
  arrive_early_minutes: number | null;
  status: 'scheduled' | 'cancelled';
  cancelled_reason: string | null;
  revision: number;
  updated_at: string;
}

const enc = new TextEncoder();
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** TEXT escaping: backslash, semicolon, comma and newlines (RFC 5545 3.3.11). */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold one content line at 75 octets, never splitting a multi-byte character (3.1). */
export function foldLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
      limit = 75;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out;
}

const utcStamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};

function wall(ms: number, zone: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms)))
    if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}
const localStamp = (ms: number, zone: string) => {
  const w = wall(ms, zone);
  return `${w.year}${pad(w.month)}${pad(w.day)}T${pad(w.hour)}${pad(w.minute)}${pad(w.second)}`;
};
/** Offset from UTC in minutes at an instant. */
function offsetMin(ms: number, zone: string): number {
  const w = wall(ms, zone);
  return (
    (Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) -
      Math.floor(ms / 1000) * 1000) /
    60000
  );
}
const fmtOffset = (min: number) =>
  `${min < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(min) / 60))}${pad(Math.abs(min) % 60)}`;
function tzName(ms: number, zone: string): string {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
      .formatToParts(new Date(ms))
      .find((p) => p.type === 'timeZoneName')?.value ?? zone
  );
}
export const isKnownZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/** VTIMEZONE lines for a zone covering [fromMs, toMs]: the offset at the start plus every transition. */
export function vtimezone(zone: string, fromMs: number, toMs: number): string[] {
  const DAY = 86_400_000;
  const start = fromMs - 2 * DAY;
  const end = toMs + 2 * DAY;
  type Obs = { atMs: number; from: number; to: number };
  const obs: Obs[] = [];
  let prev = offsetMin(start, zone);
  const initial = prev;
  for (let t = start; t < end; t += DAY) {
    const next = offsetMin(Math.min(t + DAY, end), zone);
    if (next !== prev) {
      // binary search the minute of the change inside (t, t + DAY]
      let lo = t;
      let hi = Math.min(t + DAY, end);
      while (hi - lo > 60_000) {
        const mid = Math.floor((lo + hi) / 2 / 60_000) * 60_000;
        if (offsetMin(mid, zone) === prev) lo = mid;
        else hi = mid;
      }
      obs.push({ atMs: hi, from: prev, to: next });
      prev = next;
    }
  }
  const lines = ['BEGIN:VTIMEZONE', `TZID:${zone}`];
  const offsets = [initial, ...obs.map((o) => o.to)];
  const standard = Math.min(...offsets);
  const block = (
    kind: 'STANDARD' | 'DAYLIGHT',
    dtstart: string,
    from: number,
    to: number,
    name: string,
  ) => {
    lines.push(
      `BEGIN:${kind}`,
      `DTSTART:${dtstart}`,
      `TZOFFSETFROM:${fmtOffset(from)}`,
      `TZOFFSETTO:${fmtOffset(to)}`,
      `TZNAME:${name}`,
      `END:${kind}`,
    );
  };
  block(
    initial === standard ? 'STANDARD' : 'DAYLIGHT',
    '19700101T000000',
    initial,
    initial,
    tzName(start, zone),
  );
  for (const o of obs) {
    // DTSTART is the local time in the OLD offset (RFC 5545 3.6.5).
    const wallOld = new Date(o.atMs + o.from * 60_000);
    const dt = `${wallOld.getUTCFullYear()}${pad(wallOld.getUTCMonth() + 1)}${pad(wallOld.getUTCDate())}T${pad(wallOld.getUTCHours())}${pad(wallOld.getUTCMinutes())}00`;
    block(
      o.to === standard ? 'STANDARD' : 'DAYLIGHT',
      dt,
      o.from,
      o.to,
      tzName(o.atMs + 60_000, zone),
    );
  }
  lines.push('END:VTIMEZONE');
  return lines;
}

export interface CalendarOptions {
  /** Shown as the calendar's name in clients. */
  name?: string;
  /** Public origin of the web app, for a link back to each event (omit to leave out URL). */
  appUrl?: string | undefined;
}

function eventLines(e: FeedEvent, useTz: boolean, appUrl?: string): string[] {
  const place = [e.location_name ?? e.location_text, e.location_address].filter(Boolean).join(', ');
  const desc: string[] = [];
  if (e.status === 'cancelled')
    desc.push(`CANCELLED${e.cancelled_reason ? `: ${e.cancelled_reason}` : ''}`);
  if (e.type === 'game' && e.opponent_name)
    desc.push(`vs. ${e.opponent_name}${e.home_away ? ` (${e.home_away})` : ''}`);
  if (e.arrive_early_minutes) desc.push(`Arrive ${e.arrive_early_minutes} minutes early.`);
  if (e.notes) desc.push(e.notes);
  desc.push(e.team_name);
  const s = new Date(e.starts_at).getTime();
  const en = new Date(e.ends_at).getTime();
  const dt = (name: string, ms: number, iso: string) =>
    useTz ? `${name};TZID=${e.timezone}:${localStamp(ms, e.timezone)}` : `${name}:${utcStamp(iso)}`;
  const lines = [
    'BEGIN:VEVENT',
    `UID:event-${e.id}@athleit`,
    `DTSTAMP:${utcStamp(e.updated_at)}`,
    `LAST-MODIFIED:${utcStamp(e.updated_at)}`,
    dt('DTSTART', s, e.starts_at),
    dt('DTEND', en, e.ends_at),
    `SEQUENCE:${Math.max(0, e.revision - 1)}`,
    `STATUS:${e.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    `SUMMARY:${escapeText(e.title)}`,
  ];
  if (place) lines.push(`LOCATION:${escapeText(place)}`);
  lines.push(
    `DESCRIPTION:${escapeText(desc.join('\n'))}`,
    `CATEGORIES:${escapeText(e.type.toUpperCase())}`,
  );
  if (appUrl) lines.push(`URL:${appUrl.replace(/\/+$/, '')}/events/${e.id}`);
  lines.push('END:VEVENT');
  return lines;
}

/** A complete VCALENDAR document (CRLF-terminated). */
export function buildCalendar(events: readonly FeedEvent[], opts: CalendarOptions = {}): string {
  const name = opts.name ?? 'Athleit schedule';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Athleit//Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  // One VTIMEZONE per zone used, covering that zone's event range.
  const ranges = new Map<string, { from: number; to: number }>();
  for (const e of events) {
    if (!isKnownZone(e.timezone)) continue;
    const s = new Date(e.starts_at).getTime();
    const en = new Date(e.ends_at).getTime();
    const r = ranges.get(e.timezone);
    ranges.set(
      e.timezone,
      r ? { from: Math.min(r.from, s), to: Math.max(r.to, en) } : { from: s, to: en },
    );
  }
  for (const [zone, r] of [...ranges].sort(([a], [b]) => a.localeCompare(b)))
    lines.push(...vtimezone(zone, r.from, r.to));
  for (const e of events) lines.push(...eventLines(e, ranges.has(e.timezone), opts.appUrl));
  lines.push('END:VCALENDAR');
  return lines.flatMap(foldLine).join('\r\n') + '\r\n';
}
