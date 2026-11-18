import type { ClubRole, Sport, TeamRole } from './constants';

/**
 * A "context" is one PLACE: a team, a club, or the household. A person's roles there are merged
 * (Admin + Parent of one team = one place, "Admin · Parent"); screens are gated by capabilities,
 * the union over those roles (the code form of docs/permissions.md).
 */
export type ContextKind = 'family' | 'team' | 'club';
export type ContextRole = 'guardian' | TeamRole | ClubRole;

export interface AppContext {
  /** Stable key for the PLACE (`team:<id>`, `club:<id>`, `family:<id>`), persisted as "last used". */
  key: string;
  kind: ContextKind;
  /** Household, team or club id. */
  id: string;
  /** The person's highest role here (display and legacy callers). */
  role: ContextRole;
  /** Every role the person holds in this place; capabilities are the union. */
  roles: ContextRole[];
  title: string;
  /** Role label, e.g. "Admin · Parent". */
  subtitle: string;
  sport?: Sport;
  season?: string;
}

export interface ContextSource {
  households: { id: string; name: string }[];
  teams: { team_id: string; role: TeamRole; name: string; sport: Sport; season_label: string }[];
  clubs: { club_id: string; role: ClubRole; name: string }[];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const FAMILY_CONTEXT_PREFIX = 'family:';

/** Roles that exist for display only; Parent/Player live under a team, Guardian under a family. */
export function roleLabel(role: ContextRole): string {
  return role === 'guardian' ? 'Parent' : cap(role);
}

/** Highest first, for display ("Admin · Parent"). */
const ROLE_ORDER: ContextRole[] = ['admin', 'coach', 'manager', 'parent', 'player', 'guardian'];

export function sortRoles(roles: readonly ContextRole[]): ContextRole[] {
  return [...new Set(roles)].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
}

export function rolesLabel(roles: readonly ContextRole[]): string {
  return sortRoles(roles).map(roleLabel).join(' · ');
}

/**
 * One context per PLACE (a team, a club or the household). A person's roles in a place are merged
 * (Admin + Parent of one team is ONE place labelled "Admin · Parent"); capabilities are the union.
 */
export function buildContexts(src: ContextSource): AppContext[] {
  const out: AppContext[] = [];
  for (const h of src.households) {
    out.push({
      key: `${FAMILY_CONTEXT_PREFIX}${h.id}`,
      kind: 'family',
      id: h.id,
      role: 'guardian',
      roles: ['guardian'],
      title: h.name,
      subtitle: 'Parent · family',
    });
  }
  const teams = new Map<string, AppContext>();
  for (const t of src.teams) {
    const prev = teams.get(t.team_id);
    const roles = sortRoles([...(prev?.roles ?? []), t.role]);
    teams.set(t.team_id, {
      key: `team:${t.team_id}`,
      kind: 'team',
      id: t.team_id,
      role: roles[0]!,
      roles,
      title: t.name,
      subtitle: rolesLabel(roles),
      sport: t.sport,
      season: t.season_label,
    });
  }
  out.push(...teams.values());
  const clubs = new Map<string, AppContext>();
  for (const c of src.clubs) {
    const prev = clubs.get(c.club_id);
    const roles = sortRoles([...(prev?.roles ?? []), c.role]);
    clubs.set(c.club_id, {
      key: `club:${c.club_id}`,
      kind: 'club',
      id: c.club_id,
      role: roles[0]!,
      roles,
      title: c.name,
      subtitle: rolesLabel(roles),
    });
  }
  out.push(...clubs.values());
  return out;
}

/** `team:<id>:<role>` (the old per-role key) becomes `team:<id>`. */
export function normalizeContextKey(key: string | null): string | null {
  if (!key) return null;
  const [kind, id] = key.split(':');
  return kind && id ? `${kind}:${id}` : key;
}

/** Places shown in the switcher: teams and clubs; the household only when it is the only place. */
export function switcherPlaces(contexts: AppContext[]): AppContext[] {
  const places = contexts.filter((c) => c.kind !== 'family');
  return places.length > 0 ? places : contexts;
}

/** Pick the persisted place if it still exists, else the first team/club, else the family. */
export function pickContext(contexts: AppContext[], lastKey: string | null): AppContext | null {
  const key = normalizeContextKey(lastKey);
  return contexts.find((c) => c.key === key) ?? switcherPlaces(contexts)[0] ?? null;
}

export type AddRoleAction = 'create-team' | 'create-club' | 'add-family' | 'join-team';

/**
 * "Add a role" entries. Everyone can create a team or club or join a team; a user with no
 * family yet (e.g. a coach) also gets "Add a family", which starts the add-a-child flow.
 */
export function addRoleActions(contexts: AppContext[]): AddRoleAction[] {
  const hasFamily = contexts.some((c) => c.kind === 'family');
  const out: AddRoleAction[] = [];
  if (!hasFamily) out.push('add-family');
  out.push('create-team', 'create-club', 'join-team');
  return out;
}

export function contextPath(ctx: AppContext): string {
  switch (ctx.kind) {
    case 'family':
      return '/family';
    case 'team':
      return `/teams/${ctx.id}`;
    case 'club':
      return `/clubs/${ctx.id}`;
  }
}
