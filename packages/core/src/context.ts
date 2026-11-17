import type { ClubRole, Sport, TeamRole } from './constants';

/**
 * A "context" is one role in one place: Parent for the family, Coach of U10 Hawks, Admin of
 * Riverside Club. The context switcher lists the user's contexts; every screen is scoped to
 * the active one and gated by `capabilitiesFor` (the code form of docs/permissions.md).
 */
export type ContextKind = 'family' | 'team' | 'club';
export type ContextRole = 'guardian' | TeamRole | ClubRole;

export interface AppContext {
  /** Stable key, persisted as the "last used" context. */
  key: string;
  kind: ContextKind;
  /** Household, team or club id. */
  id: string;
  role: ContextRole;
  title: string;
  subtitle: string;
  sport?: Sport;
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

export function buildContexts(src: ContextSource): AppContext[] {
  const out: AppContext[] = [];
  for (const h of src.households) {
    out.push({
      key: `${FAMILY_CONTEXT_PREFIX}${h.id}`,
      kind: 'family',
      id: h.id,
      role: 'guardian',
      title: h.name,
      subtitle: 'Parent, family',
    });
  }
  for (const t of src.teams) {
    out.push({
      key: `team:${t.team_id}:${t.role}`,
      kind: 'team',
      id: t.team_id,
      role: t.role,
      title: t.name,
      subtitle: `${roleLabel(t.role)}, ${t.season_label}`,
      sport: t.sport,
    });
  }
  for (const c of src.clubs) {
    out.push({
      key: `club:${c.club_id}:${c.role}`,
      kind: 'club',
      id: c.club_id,
      role: c.role,
      title: c.name,
      subtitle: `${roleLabel(c.role)}, club`,
    });
  }
  return out;
}

/** Pick the persisted context if it still exists, else the first one (families first). */
export function pickContext(contexts: AppContext[], lastKey: string | null): AppContext | null {
  return contexts.find((c) => c.key === lastKey) ?? contexts[0] ?? null;
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
