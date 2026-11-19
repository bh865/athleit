import { localDateKey, zonedParts } from './schedule-time';

/**
 * The Next up card's state machine (Home round 2). Pure: `now` and the viewer's zone are injected, so the label
 * can be refreshed on a timer without re-fetching and tests are deterministic.
 *
 *   before     the event has not started: big time + "in 2 days"
 *   live       between start and end: "Live now"
 *   final      the end has passed: the score, and "Enter result" for staff when none is entered
 *   cancelled  status is cancelled: struck title and the reason
 */
export type NextUpPhase = 'before' | 'live' | 'final' | 'cancelled';

export interface NextUpEvent {
  eventId: string;
  type: string;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status?: string | null;
  cancelledReason?: string | null;
  ourScore?: number | null;
  theirScore?: number | null;
  revision?: number | null;
}

/** How long after the end a finished game still holds the card (so staff can enter the result). */
export const FINAL_WINDOW_MS = 6 * 60 * 60 * 1000;

export function nextUpPhase(e: Pick<NextUpEvent, 'startsAt' | 'endsAt' | 'status'>, now: Date): NextUpPhase {
  if (e.status === 'cancelled') return 'cancelled';
  const t = now.getTime();
  if (t < Date.parse(e.startsAt)) return 'before';
  if (t <= Date.parse(e.endsAt)) return 'live';
  return 'final';
}

export const eventNoun = (type: string): string =>
  type === 'game' ? 'Game' : type === 'practice' ? 'Practice' : 'Event';

/**
 * Which event owns the card: a live one, else a game that finished within FINAL_WINDOW_MS, else the soonest
 * upcoming event (a cancelled one still shows, so families see it is off). Null when nothing qualifies.
 */
export function pickNextUp(events: readonly NextUpEvent[], now: Date): NextUpEvent | null {
  const t = now.getTime();
  const by = (a: NextUpEvent, b: NextUpEvent) => Date.parse(a.startsAt) - Date.parse(b.startsAt);
  const live = events
    .filter((e) => nextUpPhase(e, now) === 'live')
    .sort(by)[0];
  if (live) return live;
  const final = events
    .filter(
      (e) =>
        e.type === 'game' &&
        e.status !== 'cancelled' &&
        nextUpPhase(e, now) === 'final' &&
        t - Date.parse(e.endsAt) <= FINAL_WINDOW_MS,
    )
    .sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt))[0];
  if (final) return final;
  return events.filter((e) => Date.parse(e.startsAt) > t).sort(by)[0] ?? null;
}

/** "in 38 min", "in 3 hr", "tomorrow", "in 2 days". Calendar days are counted in the viewer's zone. */
export function relativeStart(startsAt: string, now: Date, zone: string): string {
  const start = new Date(startsAt);
  const diff = start.getTime() - now.getTime();
  if (diff <= 0) return 'now';
  const mins = Math.ceil(diff / 60_000);
  if (mins < 60) return mins <= 1 ? 'in 1 min' : `in ${mins} min`;
  const dayNo = (d: Date) => {
    const [y, m, dd] = localDateKey(d, zone).split('-').map(Number);
    return Math.floor(Date.UTC(y!, m! - 1, dd!) / 86_400_000);
  };
  const days = dayNo(start) - dayNo(now);
  if (days <= 0) return `in ${Math.floor(mins / 60)} hr`;
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const clock = (d: Date, zone: string) => {
  const p = zonedParts(d, zone);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${String(p.minute).padStart(2, '0')} ${p.hour < 12 ? 'AM' : 'PM'}`;
};

export interface NextUpHeadline {
  phase: NextUpPhase;
  /** "10:00 AM" in the viewer's zone. */
  time: string;
  /** Live relative line: "in 2 days"; "Live now"; "Final"; null when cancelled. */
  relative: string | null;
  /** For screen readers: "Game in 2 days, Saturday 10:00 AM", "Live now", "Final 3–2". */
  spoken: string;
  /** "Final" score text, when both scores are entered. */
  score: string | null;
  /** True when a finished game has no result yet (staff get an Enter result action). */
  needsResult: boolean;
}

export function nextUpHeadline(e: NextUpEvent, now: Date, zone: string): NextUpHeadline {
  const phase = nextUpPhase(e, now);
  const start = new Date(e.startsAt);
  const time = clock(start, zone);
  const noun = eventNoun(e.type);
  const score = e.ourScore != null && e.theirScore != null ? `${e.ourScore}–${e.theirScore}` : null;
  const needsResult = phase === 'final' && e.type === 'game' && score === null;
  const day = WEEKDAY[zonedParts(start, zone).weekday]!;
  const spoken =
    phase === 'live'
      ? `${noun} live now`
      : phase === 'final'
        ? score
          ? `${noun} final ${score}`
          : `${noun} final, result not entered`
        : phase === 'cancelled'
          ? `${noun} cancelled, ${day} ${time}`
          : `${noun} ${relativeStart(e.startsAt, now, zone)}, ${day} ${time}`;
  return {
    phase,
    time,
    relative:
      phase === 'live'
        ? 'Live now'
        : phase === 'final'
          ? 'Final'
          : phase === 'cancelled'
            ? null
            : relativeStart(e.startsAt, now, zone),
    spoken,
    score,
    needsResult,
  };
}

/** The "updated" banner: the schedule changed since this viewer last looked. Unknown history shows nothing. */
export const hasUpdate = (revision: number | null | undefined, seen: number | null | undefined): boolean =>
  revision != null && seen != null && revision > seen;

/** Parent-facing RSVP counts bar segments. Zero segments are dropped; widths are proportions of the total. */
export interface RsvpSegment {
  key: 'going' | 'not_going' | 'maybe' | 'no_reply';
  label: string;
  value: number;
}
export function rsvpSegments(c: {
  going: number;
  not_going: number;
  maybe: number;
  no_reply: number;
}): RsvpSegment[] {
  return [
    { key: 'going' as const, label: 'Going', value: c.going },
    { key: 'not_going' as const, label: 'Can’t go', value: c.not_going },
    { key: 'maybe' as const, label: 'Maybe', value: c.maybe },
    { key: 'no_reply' as const, label: 'No reply', value: c.no_reply },
  ];
}
