export const APP_NAME = 'Athleit';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72; // bcrypt limit used by Supabase Auth
export const MAX_DISPLAY_NAME_LENGTH = 80; // matches profiles_display_name_length

/** OAuth providers wired up in Phase 0 (credentials supplied later). */
export const OAUTH_PROVIDERS = ['google', 'apple'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

// Phase 1: people, households, clubs, teams and rosters. Values mirror the database enums.
export const SPORTS = [
  'soccer',
  'basketball',
  'volleyball',
  'football',
  'baseball',
  'softball',
  'hockey',
] as const;
export type Sport = (typeof SPORTS)[number];

export const TEAM_ROLES = ['admin', 'coach', 'manager', 'parent', 'player'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
/** Roles with write/roster access to a team. */
export const TEAM_STAFF_ROLES = ['admin', 'coach', 'manager'] as const;
export type TeamStaffRole = (typeof TEAM_STAFF_ROLES)[number];

export const CLUB_ROLES = ['admin', 'manager'] as const;
export type ClubRole = (typeof CLUB_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['active', 'inactive'] as const;
export const REQUEST_STATUSES = ['pending', 'approved', 'declined'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const ROSTER_STATUSES = ['active', 'inactive'] as const;
export type RosterStatus = (typeof ROSTER_STATUSES)[number];

/** Children under this age never have their own login (also enforced in the database). */
export const MIN_PLAYER_LOGIN_AGE = 13;
export const MAX_INVITE_EXPIRY_DAYS = 90;
export const DEFAULT_INVITE_EXPIRY_DAYS = 7;
export const MAX_INVITE_USES = 1000;
export const MAX_JERSEY_NUMBER = 99;

/** Display names for the roles shown in invites and menus. */
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  coach: 'Coach',
  manager: 'Manager',
  parent: 'Parent',
  player: 'Player',
  guardian: 'Guardian',
};
