import { capabilitiesForPlace, type Capability } from './capabilities';
import type { AppContext } from './context';
import { payViewsFor } from './pay-views';
import { teamForScreen } from './places';

/**
 * Home tile registry (docs: design brief "capability to tile matrix"). Shared by web and mobile so the two
 * cannot drift. Visibility comes from capabilitiesForPlace, never from `active.kind` or a single role.
 * The database stays the authority; this only decides what Home shows.
 */
export type HomeTileId =
  | 'attention'
  | 'nextUp'
  | 'thisWeek'
  | 'scheduleChanges'
  | 'teamRecord'
  | 'messages'
  | 'announcement'
  | 'amountDue'
  | 'collection'
  | 'payouts'
  | 'registrations'
  | 'waivers'
  | 'approvals'
  | 'roster'
  | 'documents'
  | 'family'
  | 'places'
  | 'members'
  | 'club'
  | 'calendar'
  | 'notificationHealth'
  | 'setup';

/** "team" tiles are staff work, "family" tiles are per child, "shared" tiles merge both. */
export type HomeTileGroup = 'top' | 'shared' | 'team' | 'family' | 'more';

export interface HomeTile {
  id: HomeTileId;
  group: HomeTileGroup;
  /** Lower first. Matches the order of the matrix. */
  priority: number;
  /** Narrowed variant, when the person sees less than the full tile. */
  mode?: 'full' | 'limited';
}

type Ctx = Pick<AppContext, 'kind' | 'role' | 'id' | 'title'> & {
  roles?: readonly AppContext['role'][];
};
type Active = Pick<AppContext, 'kind' | 'id'> | null;

interface Scope {
  contexts: readonly Ctx[];
  teamId: string | null;
  teamCaps: ReadonlySet<Capability>;
  clubCaps: ReadonlySet<Capability>;
  guardian: boolean;
  /** Only a team player role (13+), no household: sees payments read-only. */
  playerOnly: boolean;
  staffPayments: boolean;
  payoutsAdmin: boolean;
  placeCount: number;
}

interface Def {
  id: HomeTileId;
  group: HomeTileGroup;
  visible: (s: Scope) => boolean | 'limited';
}

const has = (s: Scope, ...caps: Capability[]) => caps.some((c) => s.teamCaps.has(c));

const DEFS: Def[] = [
  { id: 'attention', group: 'top', visible: (s) => s.placeCount > 0 },
  // A guardian with no team yet has no schedule: the schedule tiles need a team the person sits on.
  { id: 'nextUp', group: 'shared', visible: (s) => has(s, 'schedule.view') },
  { id: 'thisWeek', group: 'shared', visible: (s) => has(s, 'schedule.view') },
  { id: 'scheduleChanges', group: 'shared', visible: (s) => has(s, 'schedule.view') },
  { id: 'teamRecord', group: 'shared', visible: (s) => has(s, 'schedule.view') },
  { id: 'messages', group: 'shared', visible: (s) => s.teamId !== null },
  { id: 'announcement', group: 'shared', visible: (s) => s.teamId !== null },
  {
    id: 'amountDue',
    group: 'family',
    visible: (s) => (s.guardian ? true : s.playerOnly ? 'limited' : false),
  },
  { id: 'collection', group: 'team', visible: (s) => s.staffPayments },
  {
    id: 'payouts',
    group: 'team',
    visible: (s) => (s.staffPayments ? (s.payoutsAdmin ? true : 'limited') : false),
  },
  {
    id: 'registrations',
    group: 'team',
    visible: (s) =>
      has(s, 'registration.view')
        ? true
        : has(s, 'registration.register') || s.clubCaps.has('registration.view')
          ? 'limited'
          : false,
  },
  {
    id: 'waivers',
    group: 'family',
    visible: (s) => has(s, 'registration.view') || s.guardian,
  },
  {
    id: 'approvals',
    group: 'team',
    visible: (s) =>
      has(s, 'joinRequests.decide') || s.guardian || s.clubCaps.has('club.decideLink'),
  },
  { id: 'roster', group: 'team', visible: (s) => has(s, 'roster.viewFull', 'roster.viewLimited') },
  { id: 'documents', group: 'more', visible: (s) => has(s, 'documents.view') },
  {
    id: 'family',
    group: 'family',
    visible: (s) => s.guardian,
  },
  { id: 'places', group: 'more', visible: (s) => s.placeCount >= 2 },
  {
    id: 'members',
    group: 'more',
    visible: (s) => has(s, 'members.manage', 'invites.createFamily'),
  },
  { id: 'club', group: 'team', visible: (s) => s.clubCaps.has('club.view') },
  { id: 'calendar', group: 'more', visible: (s) => has(s, 'schedule.view') },
  { id: 'notificationHealth', group: 'more', visible: (s) => s.placeCount > 0 },
  { id: 'setup', group: 'team', visible: (s) => has(s, 'team.edit', 'registration.manage') },
];

const PRIORITY = new Map(DEFS.map((d, i) => [d.id, i]));

function scopeFor(contexts: readonly Ctx[], active: Active): Scope {
  const team = teamForScreen(contexts, active);
  const club =
    (active?.kind === 'club' && contexts.find((c) => c.kind === 'club' && c.id === active.id)) ||
    contexts.find((c) => c.kind === 'club') ||
    null;
  const teamCaps: ReadonlySet<Capability> = team
    ? capabilitiesForPlace(contexts, 'team', team.id)
    : new Set<Capability>();
  const clubCaps: ReadonlySet<Capability> = club
    ? capabilitiesForPlace(contexts, 'club', club.id)
    : new Set<Capability>();
  const pay = payViewsFor(contexts, active);
  const staffCaps = pay.staff ? capabilitiesForPlace(contexts, pay.staff.kind, pay.staff.id) : null;
  const roles = team
    ? contexts
        .filter((c) => c.kind === 'team' && c.id === team.id)
        .flatMap((c) => c.roles ?? [c.role])
    : [];
  return {
    contexts,
    teamId: team?.id ?? null,
    teamCaps,
    clubCaps,
    guardian: pay.payer,
    playerOnly: !pay.payer && roles.length > 0 && roles.every((r) => r === 'player'),
    staffPayments: pay.staff !== null,
    payoutsAdmin: Boolean(staffCaps?.has('payments.setup')),
    placeCount: contexts.length,
  };
}

/**
 * The tiles to render for this person, in order. A person holding several roles in one place gets the union.
 * An empty list means "no place": show onboarding instead.
 */
export function homeTilesFor(contexts: readonly Ctx[], active: Active): HomeTile[] {
  if (contexts.length === 0) return [];
  const scope = scopeFor(contexts, active);
  const out: HomeTile[] = [];
  for (const d of DEFS) {
    const v = d.visible(scope);
    if (!v) continue;
    out.push({
      id: d.id,
      group: d.group,
      priority: PRIORITY.get(d.id) ?? 0,
      mode: v === 'limited' ? 'limited' : 'full',
    });
  }
  return out;
}

export const homeTileIds = (contexts: readonly Ctx[], active: Active): HomeTileId[] =>
  homeTilesFor(contexts, active).map((t) => t.id);
