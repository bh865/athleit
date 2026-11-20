// Schedule redesign: the logic web and mobile share so the two never disagree. Everything here is pure; the
// clock and the viewer's time zone are injected. The database stays the authority (docs/scheduling.md).
import type { EventType, RsvpStatus } from './scheduling';
import { MAX_SERIES_DAYS, MAX_SERIES_INTERVAL_WEEKS, MAX_SERIES_OCCURRENCES } from './scheduling';
import { nextUpHeadline, nextUpPhase, rsvpSegments } from './next-up-state';
import type { NextUpPhase } from './next-up-state';
import {
  addDays,
  describeEventTime,
  localDateKey,
  queryRangeForDays,
  weekDays,
  weekdayOf,
  zonedParts,
} from './schedule-time';

// Items ------------------------------------------------------------------------------------------

export interface RsvpCounts {
  going: number;
  not_going: number;
  maybe: number;
  no_reply: number;
}

export interface ScheduleChild {
  player_id: string;
  first_name: string;
  status: RsvpStatus | null;
}

/** The part of a list item the shared logic reads. The apps' own item types extend it. */
export interface ScheduleItemLike {
  id: string;
  team_id: string;
  team_name?: string | undefined;
  type: EventType;
  title: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: 'scheduled' | 'cancelled';
  cancelled_reason: string | null;
  series_id?: string | null | undefined;
  revision?: number | null | undefined;
  seen_revision?: number | null | undefined;
  counts?: RsvpCounts | undefined;
  children?: ScheduleChild[] | undefined;
  result?: { our: number; their: number; outcome: string } | undefined;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Nov 21" for a date key. */
export function shortDate(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

// Agenda grouping --------------------------------------------------------------------------------

/** "Today", "Tomorrow", "Yesterday", else "Sat, Nov 21". Compared on date keys, so DST never shifts a heading. */
export function dayHeading(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return 'Today';
  if (dateKey === addDays(todayKey, 1)) return 'Tomorrow';
  if (dateKey === addDays(todayKey, -1)) return 'Yesterday';
  return `${WEEKDAYS_SHORT[weekdayOf(dateKey)]}, ${shortDate(dateKey)}`;
}

export interface AgendaDay<T> {
  dateKey: string;
  heading: string;
  isToday: boolean;
  items: T[];
}

/**
 * Items grouped by the event-local day of their start, in order (ascending for Upcoming, descending for Past),
 * with the sticky heading text. `todayKey` is today's date key in the viewer's zone.
 */
export function groupAgenda<T extends Pick<ScheduleItemLike, 'starts_at' | 'timezone'>>(
  items: readonly T[],
  todayKey: string,
  order: 'asc' | 'desc' = 'asc',
): AgendaDay<T>[] {
  const sorted = [...items].sort((a, b) =>
    order === 'asc' ? a.starts_at.localeCompare(b.starts_at) : b.starts_at.localeCompare(a.starts_at),
  );
  const days: AgendaDay<T>[] = [];
  for (const it of sorted) {
    const key = localDateKey(it.starts_at, it.timezone);
    let day = days[days.length - 1];
    if (!day || day.dateKey !== key) {
      day = { dateKey: key, heading: dayHeading(key, todayKey), isToday: key === todayKey, items: [] };
      days.push(day);
    }
    day.items.push(it);
  }
  return days;
}

// Ranges -----------------------------------------------------------------------------------------

export const MAX_RANGE_DAYS = 100;

/** The seven days of the week containing a date, and the padded instant range to fetch them. */
export function weekRange(dateKey: string) {
  const days = weekDays(dateKey);
  return { days, ...queryRangeForDays(days[0]!, days[6]!) };
}

/** The visible grid of a month (whole weeks) and the instant range to fetch it. */
export function monthRange(grid: string[][]) {
  const first = grid[0]![0]!;
  const last = grid[grid.length - 1]![6]!;
  return { first, last, ...queryRangeForDays(first, last) };
}

/**
 * Agenda paging: windows kept inside the database's 100 day limit. `forward` walks later from a start date key,
 * `backward` earlier (Past). The range functions return events that overlap the window, so adjacent windows may
 * repeat an event; callers de-duplicate by id with mergeById.
 */
export function agendaWindow(
  fromKey: string,
  direction: 'forward' | 'backward',
  days = 60,
): { from: string; to: string; nextKey: string } {
  // queryRangeForDays pads three days, so the span stays under MAX_RANGE_DAYS.
  const n = Math.min(Math.max(days, 1), MAX_RANGE_DAYS - 4);
  if (direction === 'forward') {
    const lastKey = addDays(fromKey, n - 1);
    return { ...queryRangeForDays(fromKey, lastKey), nextKey: addDays(lastKey, 1) };
  }
  const firstKey = addDays(fromKey, -(n - 1));
  return { ...queryRangeForDays(firstKey, fromKey), nextKey: addDays(firstKey, -1) };
}

/** Merge pages of items, keeping the first copy of each id. */
export function mergeById<T extends { id: string }>(...lists: (readonly T[])[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists)
    for (const it of list) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
    }
  return out;
}

// Filters ----------------------------------------------------------------------------------------

export interface ScheduleFilters {
  types: EventType[];
  childId: string | null;
  teamId: string | null;
  needsReply: boolean;
}
export const NO_FILTERS: ScheduleFilters = { types: [], childId: null, teamId: null, needsReply: false };

const isOpen = (e: Pick<ScheduleItemLike, 'status' | 'ends_at'>, now: Date) =>
  e.status !== 'cancelled' && Date.parse(e.ends_at) >= now.getTime();

/** A parent's row needs a reply when it is still open and at least one child has not answered. */
export function needsReply(item: ScheduleItemLike, now: Date): boolean {
  return isOpen(item, now) && (item.children ?? []).some((c) => c.status == null);
}

export function applyFilters<T extends ScheduleItemLike>(
  items: readonly T[],
  filters: ScheduleFilters,
  now: Date,
): T[] {
  const out: T[] = [];
  for (const it of items) {
    if (filters.types.length > 0 && !filters.types.includes(it.type)) continue;
    if (filters.teamId && it.team_id !== filters.teamId) continue;
    let item = it;
    if (filters.childId) {
      const kids = (it.children ?? []).filter((c) => c.player_id === filters.childId);
      if (kids.length === 0) continue;
      item = { ...it, children: kids };
    }
    if (filters.needsReply && !needsReply(item, now)) continue;
    out.push(item);
  }
  return out;
}

export const hasActiveFilters = (f: ScheduleFilters) =>
  f.types.length > 0 || f.childId != null || f.teamId != null || f.needsReply;

export interface FilterChip {
  key: string;
  label: string;
  /** The filters after the chip is removed. */
  remove: ScheduleFilters;
}

/** Removable chips for the active filters. `names` resolves child and team labels. */
export function filterChips(
  f: ScheduleFilters,
  names: { child?: (id: string) => string | undefined; team?: (id: string) => string | undefined } = {},
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.needsReply)
    chips.push({ key: 'needs-reply', label: 'Needs reply', remove: { ...f, needsReply: false } });
  for (const t of f.types) {
    const label = t === 'game' ? 'Games' : t === 'practice' ? 'Practices' : 'Events';
    chips.push({ key: `type-${t}`, label, remove: { ...f, types: f.types.filter((x) => x !== t) } });
  }
  if (f.childId)
    chips.push({ key: 'child', label: names.child?.(f.childId) ?? 'Child', remove: { ...f, childId: null } });
  if (f.teamId)
    chips.push({ key: 'team', label: names.team?.(f.teamId) ?? 'Team', remove: { ...f, teamId: null } });
  return chips;
}

const EVENT_TYPE_SET = new Set<string>(['game', 'practice', 'event']);

/** URL form (web): ?type=game,practice&child=<id>&team=<id>&needs=1 */
export function filtersToParams(f: ScheduleFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.types.length) p.type = f.types.join(',');
  if (f.childId) p.child = f.childId;
  if (f.teamId) p.team = f.teamId;
  if (f.needsReply) p.needs = '1';
  return p;
}
export function filtersFromParams(get: (k: string) => string | null | undefined): ScheduleFilters {
  const types = (get('type') ?? '').split(',').filter((t) => EVENT_TYPE_SET.has(t)) as EventType[];
  return {
    types: [...new Set(types)],
    childId: get('child') || null,
    teamId: get('team') || null,
    needsReply: get('needs') === '1',
  };
}

// Row state --------------------------------------------------------------------------------------

export type RowEmphasis = 'live' | 'cancelled' | 'needs_reply' | 'updated' | null;

export interface RowState {
  phase: NextUpPhase;
  live: boolean;
  cancelled: boolean;
  final: boolean;
  needsReply: boolean;
  updated: boolean;
  series: boolean;
  /** The single state that leads when several apply: live, then cancelled, then needs reply, then updated. */
  emphasis: RowEmphasis;
  /** Inline Going and Can't go are offered only for open events. */
  quickActions: boolean;
}

/** A row's "Updated" chip: it changed since this viewer last opened it. */
export function rowUpdated(
  revision: number | null | undefined,
  seen: number | null | undefined,
): boolean {
  return revision != null && revision > 1 && revision > (seen ?? 0);
}

export function rowState(item: ScheduleItemLike, now: Date): RowState {
  const phase = nextUpPhase({ startsAt: item.starts_at, endsAt: item.ends_at, status: item.status }, now);
  const cancelled = phase === 'cancelled';
  const live = phase === 'live';
  const reply = needsReply(item, now);
  const updated = !cancelled && rowUpdated(item.revision, item.seen_revision);
  const emphasis: RowEmphasis = live
    ? 'live'
    : cancelled
      ? 'cancelled'
      : reply
        ? 'needs_reply'
        : updated
          ? 'updated'
          : null;
  return {
    phase,
    live,
    cancelled,
    final: phase === 'final' && item.result != null,
    needsReply: reply,
    updated,
    series: item.series_id != null,
    emphasis,
    quickActions: isOpen(item, now) && (item.children?.length ?? 0) > 0,
  };
}

/** "Maya: Going" for chips and screen readers. */
export function rsvpChipLabel(firstName: string, status: RsvpStatus | null): string {
  const word =
    status === 'going'
      ? 'Going'
      : status === 'not_going'
        ? 'Can’t go'
        : status === 'maybe'
          ? 'Maybe'
          : 'No reply';
  return `${firstName}: ${word}`;
}

/** Whether rows show their team name: households with more than one team only. */
export function showTeamName(items: readonly Pick<ScheduleItemLike, 'team_id'>[]): boolean {
  return new Set(items.map((i) => i.team_id)).size > 1;
}

// Counts bar -------------------------------------------------------------------------------------

export interface CountsBarSegment {
  key: 'going' | 'not_going' | 'maybe' | 'no_reply';
  label: string;
  value: number;
  /** 0 to 100, proportion of the total; segments with no people are dropped. */
  percent: number;
}
export interface CountsBar {
  total: number;
  segments: CountsBarSegment[];
  /** "5 going, 1 can’t go, 2 maybe, 8 no reply" */
  spoken: string;
}

/** Going, Can't go, Maybe and No reply (Maybe included), as proportions of everyone on the roster. */
export function countsBar(c: RsvpCounts): CountsBar {
  const all = rsvpSegments(c);
  const total = all.reduce((n, s) => n + s.value, 0);
  const segments = all
    .filter((s) => s.value > 0)
    .map((s) => ({ ...s, percent: total === 0 ? 0 : (s.value / total) * 100 }));
  const spoken = all.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ');
  return { total, segments, spoken };
}

// Time-aware state (the Home Next up machine, reused) --------------------------------------------

export interface EventStateInput {
  id: string;
  type: string;
  title: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: string;
  cancelled_reason?: string | null;
  our_score?: number | null;
  their_score?: number | null;
  outcome?: string | null;
}
export interface EventStateView {
  phase: NextUpPhase;
  /** "in 2 days", "in 38 min", "Live now", "Final W 3–2", "Ended", "Cancelled" */
  label: string;
  spoken: string;
  /** A finished game with no result yet: staff get "Enter result". */
  needsResult: boolean;
  /** "now" is the only state that earns lime. */
  tone: 'now' | 'neutral';
}

const OUTCOME_LETTER: Record<string, string> = { win: 'W', loss: 'L', tie: 'T' };

export function eventStateView(e: EventStateInput, now: Date, viewerZone: string): EventStateView {
  const head = nextUpHeadline(
    {
      eventId: e.id,
      type: e.type,
      title: e.title,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      timezone: e.timezone,
      status: e.status,
      cancelledReason: e.cancelled_reason ?? null,
      ourScore: e.our_score ?? null,
      theirScore: e.their_score ?? null,
    },
    now,
    viewerZone,
  );
  if (head.phase === 'final') {
    const letter = e.outcome ? (OUTCOME_LETTER[e.outcome] ?? '') : '';
    return {
      phase: 'final',
      label: head.score ? `Final ${letter ? `${letter} ` : ''}${head.score}` : 'Ended',
      spoken: head.score ? head.spoken : `${e.type === 'game' ? 'Game' : e.type === 'practice' ? 'Practice' : 'Event'} ended`,
      needsResult: head.needsResult,
      tone: 'neutral',
    };
  }
  return {
    phase: head.phase,
    label: head.phase === 'cancelled' ? 'Cancelled' : (head.relative ?? ''),
    spoken: head.spoken,
    needsResult: false,
    tone: head.phase === 'live' ? 'now' : 'neutral',
  };
}

// Week grid layout -------------------------------------------------------------------------------

export interface WeekBlock<T> {
  item: T;
  /** Minutes from the top of the grid, and the height in minutes, already clamped to the visible hours. */
  top: number;
  height: number;
  /** Column within the overlap cluster, and how many columns the cluster has. */
  column: number;
  columns: number;
}

export interface WeekGridOptions {
  zone: string;
  /** Visible hours, [startHour, endHour). */
  startHour: number;
  endHour: number;
  /** Blocks shorter than this still get a readable height. */
  minMinutes?: number;
}

const minutesOfDay = (instant: Date | string, zone: string) => {
  const p = zonedParts(instant, zone);
  return p.hour * 60 + p.minute;
};

/** The hour range that shows every event of the week (default 7am to 9pm, widened when needed). */
export function weekGridHours(
  items: readonly Pick<ScheduleItemLike, 'starts_at' | 'ends_at'>[],
  zone: string,
  base: [number, number] = [7, 21],
): [number, number] {
  let [start, end] = base;
  for (const it of items) {
    start = Math.min(start, Math.floor(minutesOfDay(it.starts_at, zone) / 60));
    const e = zonedParts(it.ends_at, zone);
    const sameDay = localDateKey(it.starts_at, zone) === localDateKey(it.ends_at, zone);
    end = Math.max(end, sameDay ? e.hour + (e.minute > 0 ? 1 : 0) : 24);
  }
  return [Math.max(0, start), Math.min(24, end)];
}

/**
 * Positions the events of one day as blocks: top and height by start and end in `zone`, and overlapping events
 * share the width (a cluster of events that overlap, directly or through a chain, is split into the fewest
 * columns that keep them apart). Output is in start order, which is also the keyboard order.
 */
export function layoutDayBlocks<T extends Pick<ScheduleItemLike, 'starts_at' | 'ends_at'>>(
  items: readonly T[],
  dateKey: string,
  opts: WeekGridOptions,
): WeekBlock<T>[] {
  const min = opts.minMinutes ?? 30;
  const gridStart = opts.startHour * 60;
  const gridEnd = opts.endHour * 60;
  const placed: { item: T; start: number; end: number }[] = [];
  for (const item of items) {
    const startKey = localDateKey(item.starts_at, opts.zone);
    const endKey = localDateKey(item.ends_at, opts.zone);
    if (startKey > dateKey || endKey < dateKey) continue;
    const rawStart = startKey === dateKey ? minutesOfDay(item.starts_at, opts.zone) : 0;
    const rawEnd = endKey === dateKey ? minutesOfDay(item.ends_at, opts.zone) : 24 * 60;
    const start = Math.max(rawStart, gridStart);
    const end = Math.min(Math.max(rawEnd, rawStart + min), gridEnd);
    if (end <= start) continue;
    placed.push({ item, start, end });
  }
  placed.sort((a, b) => a.start - b.start || a.end - b.end);

  const out: WeekBlock<T>[] = [];
  let cluster: { item: T; start: number; end: number; column: number }[] = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];
  const flush = () => {
    const columns = Math.max(columnEnds.length, 1);
    for (const c of cluster)
      out.push({ item: c.item, top: c.start - gridStart, height: c.end - c.start, column: c.column, columns });
    cluster = [];
    columnEnds = [];
    clusterEnd = -1;
  };
  for (const p of placed) {
    if (cluster.length > 0 && p.start >= clusterEnd) flush();
    let column = columnEnds.findIndex((end) => end <= p.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(p.end);
    } else columnEnds[column] = p.end;
    cluster.push({ ...p, column });
    clusterEnd = Math.max(clusterEnd, p.end);
  }
  flush();
  return out;
}

// Revision notice (3b) ---------------------------------------------------------------------------

/** What update_event records in events.last_change. */
export interface LastChange {
  kind: 'time' | 'place' | 'both';
  prev_starts_at: string;
  prev_ends_at: string;
  prev_timezone?: string | null;
  prev_place: string | null;
  revision: number;
  changed_at?: string;
}

export const GENERIC_REVISION_NOTICE = 'The time or place changed';

/**
 * Show the revision notice only while it is news: the event has not started, the viewer has not opened this
 * revision yet, and it has been changed at least once. (The apps keep the seen revision they loaded with for as
 * long as the event stays open, so opening the event does not make the notice vanish under the reader.)
 */
export function shouldShowRevisionNotice(
  e: { revision: number; seen_revision: number | null | undefined; starts_at: string },
  now: Date,
): boolean {
  return e.revision > 1 && e.revision > (e.seen_revision ?? 0) && now.getTime() < Date.parse(e.starts_at);
}

const clockOf = (d: Date | string, zone: string) => {
  const p = zonedParts(d, zone);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${String(p.minute).padStart(2, '0')} ${p.hour < 12 ? 'AM' : 'PM'}`;
};

/**
 * "Time moved from 9:00 AM to 10:00 AM", "Place changed from Field 3 to Field 5", and a generic fallback when
 * the previous values are not recorded (older events) or belong to an earlier revision. Times are shown in the
 * event's zone; a date is added only when the day changed. Never contains a name.
 */
export function revisionNotice(
  change: LastChange | null | undefined,
  current: { revision: number; starts_at: string; timezone: string; place: string | null },
): string {
  if (!change || change.revision !== current.revision) return GENERIC_REVISION_NOTICE;
  const zone = current.timezone;
  const prevKey = localDateKey(change.prev_starts_at, zone);
  const nowKey = localDateKey(current.starts_at, zone);
  const fmt = (iso: string, key: string) =>
    prevKey === nowKey
      ? clockOf(iso, zone)
      : `${WEEKDAYS_SHORT[weekdayOf(key)]}, ${shortDate(key)} at ${clockOf(iso, zone)}`;
  const timeText = `from ${fmt(change.prev_starts_at, prevKey)} to ${fmt(current.starts_at, nowKey)}`;
  const placeText =
    change.prev_place && current.place
      ? `from ${change.prev_place} to ${current.place}`
      : current.place
        ? `to ${current.place}`
        : '';
  if (change.kind === 'time') return `Time moved ${timeText}`;
  if (change.kind === 'place') return placeText ? `Place changed ${placeText}` : 'The place changed';
  return placeText ? `Time moved ${timeText}. Place changed ${placeText}` : `Time moved ${timeText}`;
}

// Repeat preview (create_event recurrence) -------------------------------------------------------

export interface RepeatInput {
  /** Event-local date of the first occurrence, 'YYYY-MM-DD'. */
  startDate: string;
  /** ISO weekdays, 1 = Monday ... 7 = Sunday. */
  weekdays: number[];
  intervalWeeks?: number;
  count?: number | null;
  until?: string | null;
  /** For the sentence. */
  type: EventType;
}
export interface RepeatPreview {
  dates: string[];
  count: number;
  /** The sentence under the form, or null while the rule is incomplete. */
  line: string | null;
  /** A reason the rule cannot be saved, shown before saving; null when it is valid. */
  error: string | null;
  /** Which cap was hit, if any. */
  cap: 'occurrences' | 'days' | null;
}

const isoWeekday = (key: string) => (weekdayOf(key) === 0 ? 7 : weekdayOf(key));
const daysBetween = (a: string, b: string) => {
  const t = (k: string) => {
    const [y, m, d] = k.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b) - t(a)) / 86_400_000);
};

export const pluralNoun = (type: EventType, n: number) =>
  `${type === 'game' ? 'game' : type === 'practice' ? 'practice' : 'event'}${n === 1 ? '' : 's'}`;

/**
 * The same expansion create_event runs (walk week by week from the Monday of the start week, skip days before
 * the first date, stop at the count or the until date), plus the caps: 52 occurrences and 366 days. Returned
 * before saving so the form can say so instead of the database refusing afterwards.
 */
export function previewRepeat(r: RepeatInput): RepeatPreview {
  const fail = (error: string, cap: RepeatPreview['cap'] = null): RepeatPreview => ({
    dates: [],
    count: 0,
    line: null,
    error,
    cap,
  });
  const weekdays = [...new Set(r.weekdays)].sort((a, b) => a - b);
  const interval = r.intervalWeeks ?? 1;
  if (weekdays.length === 0) return fail('Choose at least one weekday.');
  if (weekdays.some((w) => !Number.isInteger(w) || w < 1 || w > 7)) return fail('Choose valid weekdays.');
  if (interval < 1 || interval > MAX_SERIES_INTERVAL_WEEKS)
    return fail(`Repeat every 1 to ${MAX_SERIES_INTERVAL_WEEKS} weeks.`);
  const hasCount = r.count != null;
  const hasUntil = r.until != null && r.until !== '';
  if (hasCount === hasUntil) return fail('Choose how the series ends: after a number of events or on a date.');
  if (hasCount && (r.count! < 1 || !Number.isInteger(r.count!)))
    return fail('Enter how many events, at least 1.');
  if (hasCount && r.count! > MAX_SERIES_OCCURRENCES)
    return fail(`A series can have at most ${MAX_SERIES_OCCURRENCES} events.`, 'occurrences');
  if (hasUntil) {
    if (r.until! < r.startDate) return fail('The end date is before the first event.');
    if (daysBetween(r.startDate, r.until!) > MAX_SERIES_DAYS)
      return fail(`A series can run at most ${MAX_SERIES_DAYS} days.`, 'days');
  }

  const monday = addDays(r.startDate, -(isoWeekday(r.startDate) - 1));
  const dates: string[] = [];
  let week = 0;
  gen: while (week <= 60) {
    for (const wd of weekdays) {
      const d = addDays(monday, week * 7 + (wd - 1));
      if (d < r.startDate) continue;
      if (hasUntil && d > r.until!) break gen;
      if (dates.length + 1 > MAX_SERIES_OCCURRENCES)
        return fail(`That is more than ${MAX_SERIES_OCCURRENCES} events. End it sooner.`, 'occurrences');
      dates.push(d);
      if (hasCount && dates.length === r.count) break gen;
    }
    week += interval;
  }
  if (dates.length === 0) return fail('No dates match. Check the weekdays and the end date.');
  return {
    dates,
    count: dates.length,
    line: `Creates ${dates.length} ${pluralNoun(r.type, dates.length)}, ${shortDate(dates[0]!)} to ${shortDate(dates[dates.length - 1]!)}`,
    error: null,
    cap: null,
  };
}

// Nudge (3c) -------------------------------------------------------------------------------------

export type NudgeState = { canNudge: true; confirm: string } | { canNudge: false; reason: string };

export const nudgeResultText = (n: number) =>
  n === 0 ? 'Nobody to remind' : `Reminded ${n} ${n === 1 ? 'family' : 'families'}`;

/**
 * Whether the Nudge button is enabled, from what the client knows. The 6 hour rate limit lives in the database
 * and arrives as an error after the attempt ("Already reminded recently. Try again later.").
 */
export function nudgeState(
  e: Pick<ScheduleItemLike, 'status' | 'ends_at'> & { no_reply: number },
  now: Date,
): NudgeState {
  if (e.status === 'cancelled') return { canNudge: false, reason: 'This event was cancelled.' };
  if (Date.parse(e.ends_at) < now.getTime()) return { canNudge: false, reason: 'This event is over.' };
  if (e.no_reply <= 0) return { canNudge: false, reason: 'Everyone has replied.' };
  const n = e.no_reply;
  return { canNudge: true, confirm: `Remind ${n} ${n === 1 ? 'family' : 'families'} who haven’t replied?` };
}

// Time range on a row ----------------------------------------------------------------------------

/** "5:30 PM – 7:00 PM" in the event's zone, and the viewer's own clock only when it differs. */
export function rowTimeLabel(
  item: Pick<ScheduleItemLike, 'starts_at' | 'ends_at' | 'timezone'>,
  viewerZone?: string | null,
): { range: string; yourTime: string | null; zone: string } {
  const t = describeEventTime(item.starts_at, item.ends_at, item.timezone, viewerZone);
  return { range: t.rangeLabel, yourTime: t.viewerLocalLabel, zone: t.zoneLabel };
}

/** "Arrive 9:30 AM, 30 minutes early": the time to be there, in the event's zone. */
export function arriveEarlyLabel(startsAt: string, minutes: number, zone: string): string {
  const at = new Date(Date.parse(startsAt) - minutes * 60_000);
  return `Arrive ${clockOf(at, zone)}, ${minutes} minutes early`;
}
