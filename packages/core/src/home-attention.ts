/**
 * "Needs your attention" strip: derived from the same queries the tiles use, never stored.
 * Callers build AttentionItem[]; this orders, dedupes and caps them (design brief "Attention strip priority").
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

export interface AttentionItem {
  kind: AttentionKind;
  /** Dedupe key: one chip per action per child, e.g. "rsvp:event1:player1". */
  key: string;
  label: string;
  detail?: string;
  href: string;
  /** ISO time the action is due or the event starts; soonest first within a tier. */
  dueAt?: string | null;
  overdue?: boolean;
  /** Larger counts first on ties. */
  count?: number;
}

export const ATTENTION_CAP = 4;
export const RSVP_WINDOW_MS = 48 * 60 * 60 * 1000;

const TIER: Record<AttentionKind, AttentionTier> = {
  rsvp: 1,
  result: 1,
  payment: 2,
  waiver: 2,
  registrationStep: 2,
  joinRequests: 3,
  loginClaims: 3,
  linkRequests: 3,
  registrationsToDecide: 3,
  payouts: 4,
  setup: 4,
};

export const attentionTier = (k: AttentionKind): AttentionTier => TIER[k];

/** RSVP and result items only count for an event within 48 hours; `now` is injected for tests. */
export function withinRsvpWindow(startsAt: string, now: Date): boolean {
  const t = Date.parse(startsAt);
  return Number.isFinite(t) && t - now.getTime() <= RSVP_WINDOW_MS;
}

export interface AttentionResult {
  shown: AttentionItem[];
  /** Everything past the cap, for the "+N more" sheet. */
  more: AttentionItem[];
  all: AttentionItem[];
}

const time = (s?: string | null) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

export function deriveAttention(
  items: readonly AttentionItem[],
  cap = ATTENTION_CAP,
): AttentionResult {
  const seen = new Set<string>();
  const uniq = items.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
  const all = [...uniq].sort(
    (a, b) =>
      TIER[a.kind] - TIER[b.kind] ||
      Number(Boolean(b.overdue)) - Number(Boolean(a.overdue)) ||
      time(a.dueAt) - time(b.dueAt) ||
      (b.count ?? 1) - (a.count ?? 1),
  );
  // More than `cap` items: the last visible slot becomes the "+N more" chip.
  if (all.length <= cap) return { shown: all, more: [], all };
  return { shown: all.slice(0, cap - 1), more: all.slice(cap - 1), all };
}
