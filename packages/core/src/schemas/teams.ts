import { z } from 'zod';

import {
  CLUB_ROLES,
  MAX_INVITE_EXPIRY_DAYS,
  MAX_INVITE_USES,
  MAX_JERSEY_NUMBER,
  MIN_PLAYER_LOGIN_AGE,
  ROSTER_STATUSES,
  SPORTS,
  TEAM_ROLES,
} from '../constants';

/** Inputs for the Phase 1 database functions. Field names mirror the function parameters
 *  without the `p_` prefix; callers map them (e.g. `{ p_name: input.name }`). */

const trimmed = (label: string, max: number) =>
  z.string().trim().min(1, `Enter ${label}`).max(max, `Use at most ${max} characters`);

export const sportSchema = z.enum(SPORTS);
export const teamRoleSchema = z.enum(TEAM_ROLES);
export const clubRoleSchema = z.enum(CLUB_ROLES);
export const rosterStatusSchema = z.enum(ROSTER_STATUSES);

export const clubSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Use at least 3 characters')
  .max(50, 'Use at most 50 characters')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens');

/** Date of birth as `YYYY-MM-DD`, not in the future and not before 1900 (as in the database). */
export const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date as YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date')
  .refine((v) => v >= '1900-01-01', 'Enter a valid date')
  .refine(
    (v) => v <= new Date().toISOString().slice(0, 10),
    'Date of birth cannot be in the future',
  );

/** Whole years between a `YYYY-MM-DD` birth date and `today` (UTC). */
export function ageOn(dateOfBirth: string, today: Date = new Date()): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number) as [number, number, number];
  let age = today.getUTCFullYear() - y;
  const beforeBirthday =
    today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}
export const canHaveOwnLogin = (dateOfBirth: string, today?: Date) =>
  ageOn(dateOfBirth, today) >= MIN_PLAYER_LOGIN_AGE;

export const createClubSchema = z.object({
  name: trimmed('a club name', 100),
  slug: clubSlugSchema,
});
export type CreateClubInput = z.infer<typeof createClubSchema>;

export const createTeamSchema = z.object({
  name: trimmed('a team name', 100),
  sport: sportSchema,
  seasonLabel: trimmed('a season, e.g. Fall 2026', 40),
  clubId: z.uuid().nullish(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const createInviteSchema = z
  .object({
    teamId: z.uuid().nullish(),
    clubId: z.uuid().nullish(),
    role: z.string(),
    expiresInDays: z.number().int().min(1).max(MAX_INVITE_EXPIRY_DAYS).default(7),
    maxUses: z.number().int().min(1).max(MAX_INVITE_USES).default(1),
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.teamId) === Boolean(v.clubId)) {
      ctx.addIssue({ code: 'custom', message: 'Choose a team or a club', path: ['teamId'] });
      return;
    }
    const allowed: readonly string[] = v.teamId ? TEAM_ROLES : CLUB_ROLES;
    if (!allowed.includes(v.role)) {
      ctx.addIssue({ code: 'custom', message: 'Invalid role for this invite', path: ['role'] });
    }
  });
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().trim().min(1, 'Enter the invite code').max(200),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const joinCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{10}$/, 'Team codes are 10 letters and numbers');

export const requestToJoinSchema = z
  .object({
    teamCode: joinCodeSchema.nullish(),
    teamId: z.uuid().nullish(),
    playerId: z.uuid().nullish(),
    message: z.string().trim().max(500, 'Use at most 500 characters').nullish(),
  })
  .refine((v) => Boolean(v.teamCode) !== Boolean(v.teamId), {
    message: 'Provide a team code or a team',
    path: ['teamCode'],
  });
export type RequestToJoinInput = z.infer<typeof requestToJoinSchema>;

export const decideRequestSchema = z.object({ requestId: z.uuid(), approve: z.boolean() });
export type DecideRequestInput = z.infer<typeof decideRequestSchema>;

export const addChildSchema = z.object({
  householdId: z.uuid().nullish(),
  firstName: trimmed('a first name', 60),
  lastName: trimmed('a last name', 60),
  dateOfBirth: dateOfBirthSchema,
});
export type AddChildInput = z.infer<typeof addChildSchema>;

export const placePlayerOnRosterSchema = z.object({
  teamId: z.uuid(),
  playerId: z.uuid(),
  jerseyNumber: z.number().int().min(0).max(MAX_JERSEY_NUMBER).nullish(),
  position: z.string().trim().max(40, 'Use at most 40 characters').nullish(),
  status: rosterStatusSchema.default('active'),
});
export type PlaceOnRosterInput = z.infer<typeof placePlayerOnRosterSchema>;

export const requestClubLinkSchema = z.object({ teamId: z.uuid(), clubId: z.uuid() });
export type RequestClubLinkInput = z.infer<typeof requestClubLinkSchema>;

export const claimPlayerLoginSchema = z.object({ playerId: z.uuid() });
export type ClaimPlayerLoginInput = z.infer<typeof claimPlayerLoginSchema>;
