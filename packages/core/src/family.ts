import { memberSince } from './account';
import { ageOn, canHaveOwnLogin } from './schemas/teams';

/** Shared view-model rules for the Family page (web and mobile). */

export interface GuardianRow {
  profile_id: string;
  display_name: string;
  relationship: string;
  created_at: string;
  is_you: boolean;
}

/** "You" first, then by the date they joined, then by name so the order is stable. */
export function orderGuardians<
  T extends Pick<GuardianRow, 'is_you' | 'created_at' | 'display_name'>,
>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.is_you) - Number(a.is_you) ||
      a.created_at.localeCompare(b.created_at) ||
      a.display_name.localeCompare(b.display_name),
  );
}

export const guardianSince = (createdAt: string) => memberSince(createdAt);

export interface ChildLike {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  profile_id: string | null;
  photo_path?: string | null;
  team_players: readonly { teams: { name: string } | null }[];
}

export type LoginBadge = 'has-login' | 'no-login-under-13' | null;

/** Has login, No login (under 13), or nothing for a 13+ child who has not claimed one yet. */
export function loginBadge(
  c: Pick<ChildLike, 'profile_id' | 'date_of_birth'>,
  today?: Date,
): LoginBadge {
  if (c.profile_id) return 'has-login';
  return canHaveOwnLogin(c.date_of_birth, today) ? null : 'no-login-under-13';
}

export function childCard(c: ChildLike, today?: Date) {
  const teams = [...new Set(c.team_players.flatMap((tp) => (tp.teams ? [tp.teams.name] : [])))];
  return {
    id: c.id,
    name: `${c.first_name} ${c.last_name}`.trim(),
    age: ageOn(c.date_of_birth, today),
    teams,
    notOnTeam: teams.length === 0,
    badge: loginBadge(c, today),
    photoPath: c.photo_path ?? null,
  };
}

/** "K7M2QX9RTA" -> "K7M2Q X9RTA" for display. */
export function formatFamilyCode(code: string): string {
  const c = code.trim().toUpperCase();
  return c.length === 10 ? `${c.slice(0, 5)} ${c.slice(5)}` : c;
}

/** Screen readers get the code character by character: "K 7 M 2 Q X 9 R T A". */
export function spellCode(code: string): string {
  return [...code.replace(/\s+/g, '').toUpperCase()].join(' ');
}

/** "Give Sam access to Ava and Ben?" */
export function approveQuestion(requesterName: string, childNames: readonly string[]): string {
  const names =
    childNames.length === 0
      ? 'your children'
      : childNames.length === 1
        ? childNames[0]!
        : `${childNames.slice(0, -1).join(', ')} and ${childNames[childNames.length - 1]}`;
  return `Give ${requesterName} access to ${names}?`;
}

export type JoinFamilyOutcome = 'invalid_code' | 'already_member' | 'too_many_attempts';

/** The join sheet's state for a failed request; anything else is a generic error. */
export function joinFamilyProblem(message: string | undefined): JoinFamilyOutcome | 'error' {
  return message === 'invalid_code' ||
    message === 'already_member' ||
    message === 'too_many_attempts'
    ? message
    : 'error';
}
