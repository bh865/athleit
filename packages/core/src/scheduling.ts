// Phase 2: scheduling, RSVP and game results. Values mirror the database constraints; the
// database is the authority (see docs/scheduling.md) and these exist so the apps validate early.
import type { Sport } from './constants';

export const EVENT_TYPES = ['game', 'practice', 'event'] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  game: 'Game',
  practice: 'Practice',
  event: 'Event',
};

export const EVENT_STATUSES = ['scheduled', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const HOME_AWAY = ['home', 'away', 'neutral'] as const;
export type HomeAway = (typeof HOME_AWAY)[number];

export const RSVP_STATUSES = ['going', 'not_going', 'maybe'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];
export const RSVP_LABELS: Record<RsvpStatus, string> = {
  going: 'Going',
  not_going: 'Can’t go',
  maybe: 'Maybe',
};

/** Which occurrences of a series an edit or cancellation applies to. */
export const EDIT_SCOPES = ['this', 'this_and_following', 'all'] as const;
export type EditScope = (typeof EDIT_SCOPES)[number];
export const EDIT_SCOPE_LABELS: Record<EditScope, string> = {
  this: 'This event',
  this_and_following: 'This and following',
  all: 'All events',
};

export const PERIOD_TYPES = ['half', 'quarter', 'period', 'inning', 'set'] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

/** At most this many occurrences per series; longer rules are rejected, never truncated. */
export const MAX_SERIES_OCCURRENCES = 52;
/** A series may run at most this many days from its first date. */
export const MAX_SERIES_DAYS = 366;
export const MAX_SERIES_INTERVAL_WEEKS = 4;
export const MAX_EVENT_TITLE_LENGTH = 120;
export const MAX_EVENT_NOTES_LENGTH = 2000;
export const MAX_CANCEL_REASON_LENGTH = 300;
export const MAX_RSVP_NOTE_LENGTH = 500;
export const MAX_RESULT_NOTES_LENGTH = 1000;
/** Extra periods allowed beyond the format (overtime, extra innings); sets are best-of-N and get none. */
export const MAX_EXTRA_PERIODS = 10;

export interface SportConfig {
  sport: Sport;
  period_type: PeriodType;
  default_period_count: number;
  /** null for innings and sets (not timed) */
  default_period_minutes: number | null;
  ties_allowed: boolean;
  positions: string[];
  scoring_label: string;
}

export interface PeriodScore {
  us: number;
  them: number;
}

export interface GameFormat {
  period_count?: number;
  period_minutes?: number | null;
}

/** Effective number of periods for a game: the per-game override, else the sport default. */
export function effectivePeriodCount(config: SportConfig, format?: GameFormat | null): number {
  return format?.period_count ?? config.default_period_count;
}

/**
 * Mirror of the database's game-result validation (private.validate_game_result) so forms can
 * explain a problem before submitting. Returns an error message, or null when the result is valid.
 */
export function validateGameResult(
  config: SportConfig,
  result: { our_score: number; their_score: number; period_scores?: PeriodScore[] | null },
  format?: GameFormat | null,
): string | null {
  const { our_score: us, their_score: them } = result;
  if (us === them && !config.ties_allowed) {
    return `${config.sport[0]!.toUpperCase()}${config.sport.slice(1)} games cannot end in a tie.`;
  }
  const periods = result.period_scores;
  if (periods == null) return null;
  const count = effectivePeriodCount(config, format);
  const max = config.period_type === 'set' ? count : count + MAX_EXTRA_PERIODS;
  if (periods.length < 1 || periods.length > max) return `Enter between 1 and ${max} periods.`;
  let sumUs = 0;
  let sumThem = 0;
  let wonUs = 0;
  let wonThem = 0;
  for (const p of periods) {
    sumUs += p.us;
    sumThem += p.them;
    if (p.us > p.them) wonUs += 1;
    else if (p.us < p.them) wonThem += 1;
    else if (config.period_type === 'set') return 'Every set needs a winner.';
  }
  if (config.period_type === 'set') {
    return wonUs === us && wonThem === them ? null : 'Sets won must match the set scores.';
  }
  return sumUs === us && sumThem === them ? null : 'Period scores must add up to the final score.';
}

/** The seeded defaults (see docs/sport-configs.md); the database table is the source of truth. */
export const SPORT_CONFIG_DEFAULTS: Record<Sport, SportConfig> = {
  soccer: {
    sport: 'soccer',
    period_type: 'half',
    default_period_count: 2,
    default_period_minutes: 30,
    ties_allowed: true,
    positions: ['GK', 'DEF', 'MID', 'FWD'],
    scoring_label: 'Goals',
  },
  basketball: {
    sport: 'basketball',
    period_type: 'quarter',
    default_period_count: 4,
    default_period_minutes: 8,
    ties_allowed: false,
    positions: ['PG', 'SG', 'SF', 'PF', 'C'],
    scoring_label: 'Points',
  },
  volleyball: {
    sport: 'volleyball',
    period_type: 'set',
    default_period_count: 3,
    default_period_minutes: null,
    ties_allowed: false,
    positions: ['OH', 'MB', 'OPP', 'S', 'L', 'DS'],
    scoring_label: 'Sets won',
  },
  football: {
    sport: 'football',
    period_type: 'quarter',
    default_period_count: 4,
    default_period_minutes: 12,
    ties_allowed: true,
    positions: ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K'],
    scoring_label: 'Points',
  },
  baseball: {
    sport: 'baseball',
    period_type: 'inning',
    default_period_count: 6,
    default_period_minutes: null,
    ties_allowed: true,
    positions: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'],
    scoring_label: 'Runs',
  },
  softball: {
    sport: 'softball',
    period_type: 'inning',
    default_period_count: 7,
    default_period_minutes: null,
    ties_allowed: true,
    positions: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'],
    scoring_label: 'Runs',
  },
  hockey: {
    sport: 'hockey',
    period_type: 'period',
    default_period_count: 3,
    default_period_minutes: 15,
    ties_allowed: true,
    positions: ['G', 'D', 'C', 'LW', 'RW'],
    scoring_label: 'Goals',
  },
};
