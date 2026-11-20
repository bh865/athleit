import { MAX_JERSEY_NUMBER, type RosterStatus } from './constants';
import { SPORT_CONFIG_DEFAULTS } from './scheduling';
import type { Sport } from './constants';

/**
 * Pure roster logic shared by web and mobile: search, status filter, sort, summary counts, the
 * jersey conflict check and display strings. The database stays the authority (unique active-jersey
 * index on team_players); these only make the screens answer before the round trip.
 */

export type RosterStatusFilter = RosterStatus | 'all';
export type RosterSort = 'jersey' | 'name' | 'position';

export const ROSTER_SORTS: readonly { value: RosterSort; label: string }[] = [
  { value: 'jersey', label: 'Jersey' },
  { value: 'name', label: 'Name' },
  { value: 'position', label: 'Position' },
];

export const ROSTER_STATUS_FILTERS: readonly { value: RosterStatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
];

/** One row of `get_team_roster`. Last name and player id are null for limited viewers. */
export interface RosterRowLike {
  team_player_id: string;
  player_id: string | null;
  first_name: string;
  last_name: string | null;
  jersey_number: number | null;
  position: string | null;
  status: RosterStatus;
}

export const fullName = (r: Pick<RosterRowLike, 'first_name' | 'last_name'>) =>
  `${r.first_name} ${r.last_name ?? ''}`.trim();

const norm = (s: string) => s.trim().toLowerCase();

/** Text search over name, position and jersey number ("7" or "#7"), plus the status filter. */
export function filterRoster<T extends RosterRowLike>(
  rows: readonly T[],
  opts: { query?: string; status?: RosterStatusFilter },
): T[] {
  const q = norm(opts.query ?? '').replace(/^#/, '');
  const status = opts.status ?? 'all';
  return rows.filter((r) => {
    if (status !== 'all' && r.status !== status) return false;
    if (!q) return true;
    if (r.jersey_number != null && String(r.jersey_number) === q) return true;
    return (
      norm(fullName(r)).includes(q) ||
      norm(r.first_name).includes(q) ||
      norm(r.position ?? '').includes(q)
    );
  });
}

const byName = (a: RosterRowLike, b: RosterRowLike) =>
  norm(a.last_name ?? '').localeCompare(norm(b.last_name ?? '')) ||
  norm(a.first_name).localeCompare(norm(b.first_name));

/** Jersey sorts ascending with no-number players last; name falls back to first name only. */
export function sortRoster<T extends RosterRowLike>(rows: readonly T[], sort: RosterSort): T[] {
  const jerseyKey = (r: RosterRowLike) => r.jersey_number ?? Number.POSITIVE_INFINITY;
  const cmp: Record<RosterSort, (a: T, b: T) => number> = {
    jersey: (a, b) =>
      (jerseyKey(a) === jerseyKey(b) ? 0 : jerseyKey(a) < jerseyKey(b) ? -1 : 1) ||
      norm(a.first_name).localeCompare(norm(b.first_name)),
    name: (a, b) =>
      (a.last_name != null || b.last_name != null
        ? byName(a, b)
        : norm(a.first_name).localeCompare(norm(b.first_name))) ||
      jerseyKey(a) - jerseyKey(b) ||
      0,
    position: (a, b) => {
      const pa = norm(a.position ?? '');
      const pb = norm(b.position ?? '');
      if (!pa !== !pb) return pa ? -1 : 1; // players without a position last
      return pa.localeCompare(pb) || cmp.jersey(a, b);
    },
  };
  return [...rows].sort((a, b) => {
    const r = cmp[sort](a, b);
    return Number.isNaN(r) ? 0 : r;
  });
}

export interface RosterCounts {
  active: number;
  inactive: number;
  ready: number;
}

export function rosterCounts(rows: readonly RosterRowLike[], readyCount = 0): RosterCounts {
  let active = 0;
  let inactive = 0;
  for (const r of rows) r.status === 'active' ? (active += 1) : (inactive += 1);
  return { active, inactive, ready: readyCount };
}

export interface JerseyConflict {
  /** Display name of the active player who holds the number. */
  name: string;
  teamPlayerId: string;
}

export const isValidJersey = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_JERSEY_NUMBER;

/**
 * Who already holds `jersey`? Conflicts exist only among **active** players (the database's unique
 * index is partial on status = 'active'), the row being edited is ignored, and a player being set
 * inactive takes no number. Returns the first name of the holder (limited names are never needed here).
 */
export function jerseyConflict(
  rows: readonly RosterRowLike[],
  jersey: number | null | undefined,
  opts: { ignoreTeamPlayerId?: string | null; status?: RosterStatus } = {},
): JerseyConflict | null {
  if (!isValidJersey(jersey)) return null;
  if ((opts.status ?? 'active') !== 'active') return null;
  const hit = rows.find(
    (r) =>
      r.status === 'active' &&
      r.jersey_number === jersey &&
      r.team_player_id !== (opts.ignoreTeamPlayerId ?? null),
  );
  return hit ? { name: hit.first_name, teamPlayerId: hit.team_player_id } : null;
}

export const jerseyConflictMessage = (jersey: number, c: JerseyConflict) =>
  `#${jersey} is taken by ${c.name}.`;

/** Parse a jersey text field: '' → null, otherwise a number (validated by the zod schema). */
export const parseJersey = (v: string): number | null => (v.trim() === '' ? null : Number(v));

// Display strings ----------------------------------------------------------------------------------

export const jerseyLabel = (n: number | null | undefined) => (n == null ? '–' : `#${n}`);
export const jerseyDigits = (n: number | null | undefined) => (n == null ? '–' : String(n));
/** What a screen reader says: "number 7" / "no number". */
export const jerseySpoken = (n: number | null | undefined) =>
  n == null ? 'no number' : `number ${n}`;
export const ageLabel = (age: number | null | undefined) =>
  age == null ? '' : `${age} ${age === 1 ? 'yr' : 'yrs'}`;
export const statusLabel = (s: RosterStatus) => (s === 'active' ? 'Active' : 'Inactive');

/** "Mar 4, 2016" from a YYYY-MM-DD date of birth (no time zone shifts). */
export function birthDateLabel(dateOfBirth: string, locale = 'en-US'): string {
  const [y, m, d] = dateOfBirth.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "9 years old · born Mar 4, 2016". */
export const ageSummary = (age: number, dateOfBirth: string) =>
  `${age} ${age === 1 ? 'year' : 'years'} old · born ${birthDateLabel(dateOfBirth)}`;

/** Positions offered as quick-picks for a sport (the field itself stays free text). */
export const positionOptions = (sport: Sport | null | undefined): string[] =>
  sport ? [...(SPORT_CONFIG_DEFAULTS[sport]?.positions ?? [])] : [];

/** How a row reads in lists: "Ava Chen, number 7, DEF, Active". */
export const rosterRowSpoken = (r: RosterRowLike) =>
  [fullName(r), jerseySpoken(r.jersey_number), r.position, statusLabel(r.status)]
    .filter(Boolean)
    .join(', ');

/** The jersey wall (and squad) orders by number. Same as `sortRoster(rows, 'jersey')`. */
export const squadRows = <T extends RosterRowLike>(rows: readonly T[]): T[] =>
  sortRoster(
    rows.filter((r) => r.status === 'active'),
    'jersey',
  );

export const playerCountLabel = (n: number) => `${n} ${n === 1 ? 'player' : 'players'}`;
