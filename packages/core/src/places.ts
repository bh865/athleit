import { capabilitiesForPlace } from './capabilities';
import type { AppContext } from './context';

type Ctx = Pick<AppContext, 'kind' | 'role' | 'id' | 'title'>;

/** Staff (admin / coach / manager) of a team, whatever other roles the person also holds there. */
export function isTeamStaff(contexts: readonly Ctx[], teamId: string): boolean {
  return capabilitiesForPlace(contexts, 'team', teamId).has('schedule.manage');
}

/**
 * The team a per-team screen (Messages) should use: the active team, or, when the active place is the
 * family or a club, the first team the person belongs to, so a parent is never told "messages are per
 * team" while they have one.
 */
export function teamForScreen(
  contexts: readonly Ctx[],
  active: Pick<AppContext, 'kind' | 'id'> | null,
): { id: string; title: string; isStaff: boolean } | null {
  const team =
    (active?.kind === 'team' && contexts.find((c) => c.kind === 'team' && c.id === active.id)) ||
    contexts.find((c) => c.kind === 'team') ||
    null;
  return team ? { id: team.id, title: team.title, isStaff: isTeamStaff(contexts, team.id) } : null;
}
