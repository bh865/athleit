import { localDateKey } from './schedule-time';

/**
 * "Needs your attention": derived from the same queries the tiles use, never stored. Callers build
 * AttentionItem[]; this ranks them (the priority rule below), words the time-pressure chip, and splits the list
 * into the visible rows and the "+N more" overflow. Everything is pure: `now` and the viewer's zone are injected.
 *
 * Priority rule (Home round 2):
 *  1. Blocks participation or is overdue: waiver, overdue payment, payouts needing action.
 *  2. Time-boxed and close: a game result to enter, an RSVP for an event within 48 hours, a payment due within 7 days.
 *  3. Decisions others wait on: join requests, login claims, club link requests, registrations to decide.
 *  4. Everything else, soonest first.
 * Within a tier the oldest due date goes first; the first item overall is the lead item.
 */
export type AttentionTier = 1 | 2 | 3 | 4;

export type AttentionKind =
  | 'rsvp'
  | 'result'
  | 'payment'
  | 'waiver'
  | 'registrationStep'
  | 'joinRequests'
  | 'loginClaims'
  | 'linkRequests'
  | 'registrationsToDecide'
  | 'payouts'
  | 'setup';

/** What the trailing control of a row does. Absent: a link action labelled by `attentionActionLabel`. */
export type AttentionAction =
  | { type: 'rsvp'; eventId: string; playerId: string; firstName: string }
  | { type: 'decide'; what: 'join' | 'login'; id: string }
  | { type: 'link'; label: string };

export interface AttentionItem {
  kind: AttentionKind;
  /** Dedupe key: one chip per action per child, e.g. "rsvp:event1:player1". */
  key: string;
  label: string;
  detail?: string;
  href: string;
  /** ISO time the action is due or the event starts. */
  dueAt?: string | null;
  /** 'event': dueAt is a start time ("Game in 2 days"). 'due': a deadline. 'expired': it already lapsed. */
  dueMode?: 'event' | 'due' | 'expired';
  /** "Game", "Practice": the noun of an event chip. */
  eventNoun?: string;
  overdue?: boolean;
  /** Larger counts first on ties. */
  count?: number;
  /** "Household" or a team name; set only when one list merges several places. */
  placeTag?: string;
  action?: AttentionAction;
}

export const ATTENTION_CAP = 4;
export const RSVP_WINDOW_MS = 48 * 60 * 60 * 1000;
/** RSVPs further out than 48 hours still list, but below everything time-boxed. */
export const RSVP_LISTING_MS = 7 * 24 * 60 * 60 * 1000;
const PAYMENT_SOON_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_MODE: Record<AttentionKind, 'event' | 'due'> = {
  rsvp: 'event',
  result: 'event',
  payment: 'due',
  waiver: 'due',
  registrationStep: 'due',
  joinRequests: 'due',
  loginClaims: 'due',
  linkRequests: 'due',
  registrationsToDecide: 'due',
  payouts: 'due',
  setup: 'due',
};

const ms = (s?: string | null) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : null;
};

/** RSVP items only count for an event within 48 hours; `now` is injected for tests. */
export function withinRsvpWindow(startsAt: string, now: Date): boolean {
  const t = Date.parse(startsAt);
  return Number.isFinite(t) && t - now.getTime() <= RSVP_WINDOW_MS;
}

/** Which tier of the priority rule an item falls in. */
export function attentionRank(i: AttentionItem, now: Date): AttentionTier {
  const t = ms(i.dueAt);
  const diff = t === null ? null : t - now.getTime();
  switch (i.kind) {
    case 'waiver':
    case 'payouts':
      return 1;
    case 'payment':
      if (i.overdue || (diff !== null && diff < 0)) return 1;
      return diff !== null && diff <= PAYMENT_SOON_MS ? 2 : 4;
    case 'result':
      return 2;
    case 'rsvp':
      return diff !== null && diff <= RSVP_WINDOW_MS ? 2 : 4;
    case 'joinRequests':
    case 'loginClaims':
    case 'linkRequests':
    case 'registrationsToDecide':
      return 3;
    default:
      return 4;
  }
}

export interface AttentionResult {
  /** At most `cap` rows, in order; `shown[0]` is the lead item. */
  shown: AttentionItem[];
  /** Everything past the cap, for the "+N more" sheet. */
  more: AttentionItem[];
  all: AttentionItem[];
  lead: AttentionItem | null;
}

export function deriveAttention(
  items: readonly AttentionItem[],
  now: Date = new Date(),
  cap = ATTENTION_CAP,
): AttentionResult {
  const seen = new Set<string>();
  const uniq = items.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
  const rank = new Map(uniq.map((i) => [i.key, attentionRank(i, now)]));
  const all = [...uniq].sort(
    (a, b) =>
      rank.get(a.key)! - rank.get(b.key)! ||
      (ms(a.dueAt) ?? Number.POSITIVE_INFINITY) - (ms(b.dueAt) ?? Number.POSITIVE_INFINITY) ||
      (b.count ?? 1) - (a.count ?? 1) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  return { shown: all.slice(0, cap), more: all.slice(cap), all, lead: all[0] ?? null };
}

// Chip wording ---------------------------------------------------------------------------------

export type AttentionChipTone = 'urgent' | 'soon' | 'calm';
export interface AttentionChip {
  text: string;
  tone: AttentionChipTone;
  /** Always paired with the text: status is never colour alone. */
  icon: 'warning' | 'clock';
}

const dayNumber = (instant: Date, zone: string) => {
  const [y, m, d] = localDateKey(instant, zone).split('-').map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 86_400_000);
};
const shortDate = (instant: Date, zone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric' }).format(
    instant,
  );
const localHour = (instant: Date, zone: string) =>
  Number(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', hour: 'numeric' }).format(
      instant,
    ),
  );

/**
 * The time-pressure chip: "Closes in 40 min", "Closes tonight", "Due in 3 days", "Game in 2 days", "Due Dec 1",
 * "Overdue 5 days", "Expired Nov 15". Days are calendar days in the viewer's zone, so a 9 pm deadline is
 * "tonight" at 3 pm and "Due tomorrow" the evening before, across a DST change too. Null when the item has no
 * date to word.
 */
export function attentionChip(i: AttentionItem, now: Date, zone: string): AttentionChip | null {
  const t = ms(i.dueAt);
  if (t === null) return null;
  const due = new Date(t);
  const mode = i.dueMode ?? DEFAULT_MODE[i.kind];
  const noun = i.eventNoun ?? 'Event';
  const diff = t - now.getTime();
  if (mode === 'expired')
    return { text: `Expired ${shortDate(due, zone)}`, tone: 'urgent', icon: 'warning' };
  const days = dayNumber(due, zone) - dayNumber(now, zone);
  if (diff < 0) {
    if (mode === 'event')
      return { text: `Played ${shortDate(due, zone)}`, tone: 'urgent', icon: 'warning' };
    const late = -days;
    return {
      text: late <= 0 ? 'Overdue today' : `Overdue ${late} day${late === 1 ? '' : 's'}`,
      tone: 'urgent',
      icon: 'warning',
    };
  }
  const lead = mode === 'event' ? noun : 'Due';
  const tone: AttentionChipTone = days <= 2 ? 'soon' : 'calm';
  const mins = Math.max(1, Math.ceil(diff / 60_000));
  if (mins < 60)
    return {
      text: mode === 'event' ? `${noun} in ${mins} min` : `Closes in ${mins} min`,
      tone: 'soon',
      icon: 'clock',
    };
  if (days <= 0) {
    const night = localHour(due, zone) >= 17;
    if (mode === 'event')
      return { text: `${noun} ${night ? 'tonight' : 'today'}`, tone: 'soon', icon: 'clock' };
    return { text: night ? 'Closes tonight' : 'Closes today', tone: 'soon', icon: 'clock' };
  }
  if (days === 1)
    return { text: mode === 'event' ? `${noun} tomorrow` : 'Due tomorrow', tone, icon: 'clock' };
  if (days <= 7) return { text: `${lead} in ${days} days`, tone, icon: 'clock' };
  return { text: `${lead} ${shortDate(due, zone)}`, tone: 'calm', icon: 'clock' };
}

const ACTION_LABEL: Record<AttentionKind, string> = {
  rsvp: 'Respond',
  result: 'Enter result',
  payment: 'Pay',
  waiver: 'Sign',
  registrationStep: 'Finish',
  joinRequests: 'Review',
  loginClaims: 'Review',
  linkRequests: 'Review',
  registrationsToDecide: 'Review',
  payouts: 'Set up',
  setup: 'Continue',
};

/** Label of the trailing control for a deep-link row. */
export const attentionActionLabel = (i: AttentionItem): string =>
  i.action?.type === 'link' ? i.action.label : ACTION_LABEL[i.kind];
