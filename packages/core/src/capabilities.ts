import type { AppContext } from './context';

/**
 * Code form of docs/permissions.md. The database is the authority; this only decides what the
 * UI shows. Keep both in sync (there is a unit test per role).
 */
export type Capability =
  | 'team.view'
  | 'team.edit'
  | 'team.requestClubLink'
  | 'team.unlinkClub'
  | 'team.rotateCode'
  | 'roster.viewFull'
  | 'roster.viewLimited'
  | 'roster.edit'
  | 'roster.place'
  | 'contacts.view'
  | 'members.view'
  | 'members.manage'
  | 'invites.createStaff'
  | 'invites.createFamily'
  | 'invites.view'
  | 'joinRequests.decide'
  | 'club.view'
  | 'club.decideLink'
  | 'club.invite'
  | 'club.unlinkTeam'
  | 'family.manage'
  | 'family.claimReview'
  | 'schedule.view'
  | 'schedule.manage'
  | 'schedule.rsvpNames'
  | 'schedule.rsvpOwn'
  | 'payments.view'
  | 'payments.manage'
  | 'payments.refund'
  | 'payments.setup'
  | 'payments.pay';

const STAFF: Capability[] = [
  'team.view',
  'roster.viewFull',
  'roster.viewLimited',
  'roster.edit',
  'roster.place',
  'contacts.view',
  'members.view',
  'invites.createFamily',
  'joinRequests.decide',
  'schedule.view',
  'schedule.manage',
  'schedule.rsvpNames',
  'payments.view',
  'payments.manage',
];

const BY_ROLE: Record<string, Capability[]> = {
  'team:admin': [
    ...STAFF,
    'team.edit',
    'team.requestClubLink',
    'team.unlinkClub',
    'team.rotateCode',
    'members.manage',
    'invites.createStaff',
    'invites.view',
    'payments.refund',
    'payments.setup',
  ],
  'team:coach': STAFF,
  'team:manager': STAFF,
  'team:parent': ['team.view', 'roster.viewLimited', 'schedule.view', 'schedule.rsvpOwn'],
  'team:player': ['team.view', 'roster.viewLimited', 'schedule.view', 'schedule.rsvpOwn'],
  'club:admin': [
    'club.view',
    'club.decideLink',
    'club.invite',
    'club.unlinkTeam',
    'invites.view',
    'payments.view',
    'payments.manage',
    'payments.refund',
    'payments.setup',
  ],
  'club:manager': ['club.view'],
  'family:guardian': [
    'family.manage',
    'family.claimReview',
    'invites.view',
    'schedule.view',
    'schedule.rsvpOwn',
    'payments.pay',
  ],
};

export function capabilitiesFor(ctx: Pick<AppContext, 'kind' | 'role'>): ReadonlySet<Capability> {
  return new Set(BY_ROLE[`${ctx.kind}:${ctx.role}`] ?? []);
}

export function can(
  ctx: Pick<AppContext, 'kind' | 'role'> | null,
  capability: Capability,
): boolean {
  return ctx ? capabilitiesFor(ctx).has(capability) : false;
}

/** Union of capabilities across every role the user holds for one team/club/family. */
export function capabilitiesForPlace(
  contexts: readonly Pick<AppContext, 'kind' | 'role' | 'id'>[],
  kind: AppContext['kind'],
  id: string,
): ReadonlySet<Capability> {
  const out = new Set<Capability>();
  for (const c of contexts) {
    if (c.kind === kind && c.id === id) for (const cap of capabilitiesFor(c)) out.add(cap);
  }
  return out;
}

/** What an admin of the club a team belongs to may do on that team's page: read, never edit. */
export const CLUB_ADMIN_TEAM_VIEW: ReadonlySet<Capability> = new Set<Capability>([
  'team.view',
  'roster.viewFull',
  'roster.viewLimited',
  'schedule.view',
]);
