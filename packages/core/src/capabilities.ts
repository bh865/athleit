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
  | 'family.claimReview';

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
  ],
  'team:coach': STAFF,
  'team:manager': STAFF,
  'team:parent': ['team.view', 'roster.viewLimited'],
  'team:player': ['team.view', 'roster.viewLimited'],
  'club:admin': ['club.view', 'club.decideLink', 'club.invite', 'club.unlinkTeam', 'invites.view'],
  'club:manager': ['club.view'],
  'family:guardian': ['family.manage', 'family.claimReview', 'invites.view'],
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
