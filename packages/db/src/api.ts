import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

/**
 * Typed data access shared by web and mobile. Every write goes through a Phase 1 database
 * function (RPC); reads use RLS-protected tables or the read functions. Nothing here
 * decides permissions: the database does.
 */
export type Client = SupabaseClient<Database>;
type Enums = Database['public']['Enums'];

export interface ApiError {
  message: string;
  code?: string | undefined;
  details?: string | null | undefined;
}
export type Result<T> = { data: T; error: null } | { data: null; error: ApiError };

// The generated RPC types mark every argument without a SQL default as non-null, even though
// these functions accept NULL (e.g. add_child with no household, create_invite for a club).
const NULL = null as unknown as string;

const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(e: PostgrestError | { message: string } | null): Result<T> => ({
  data: null,
  error: {
    message: e?.message ?? 'Unknown error',
    code: e && 'code' in e ? e.code : undefined,
    details: e && 'details' in e ? e.details : undefined,
  },
});
async function run<T>(
  q: PromiseLike<{ data: T | null; error: PostgrestError | null }>,
  fallback?: T,
): Promise<Result<T>> {
  const { data, error } = await q;
  if (error) return fail(error);
  if (data === null && fallback === undefined) return fail({ message: 'No data returned' });
  return ok((data ?? fallback) as T);
}

// Contexts ---------------------------------------------------------------------------------
export async function loadContextSource(client: Client, userId: string) {
  const [h, t, c] = await Promise.all([
    client
      .from('household_members')
      .select('household_id, households(id, name)')
      .eq('profile_id', userId),
    client
      .from('team_memberships')
      .select('role, team_id, teams(id, name, sport, season_label)')
      .eq('profile_id', userId)
      .eq('status', 'active')
      .order('created_at'),
    client
      .from('club_memberships')
      .select('role, club_id, clubs(id, name)')
      .eq('profile_id', userId)
      .eq('status', 'active')
      .order('created_at'),
  ]);
  const error = h.error ?? t.error ?? c.error;
  if (error) return fail<never>(error);
  return ok({
    households: (h.data ?? []).flatMap((r) => (r.households ? [r.households] : [])),
    teams: (t.data ?? []).flatMap((r) =>
      r.teams
        ? [
            {
              team_id: r.team_id,
              role: r.role,
              name: r.teams.name,
              sport: r.teams.sport,
              season_label: r.teams.season_label,
            },
          ]
        : [],
    ),
    clubs: (c.data ?? []).flatMap((r) =>
      r.clubs ? [{ club_id: r.club_id, role: r.role, name: r.clubs.name }] : [],
    ),
  });
}

// Clubs and teams --------------------------------------------------------------------------
export const createClub = (client: Client, input: { name: string; slug: string }) =>
  run(client.rpc('create_club', { p_name: input.name, p_slug: input.slug }));

export const createTeam = (
  client: Client,
  input: {
    name: string;
    sport: Enums['sport'];
    seasonLabel: string;
    clubId?: string | null | undefined;
  },
) =>
  run(
    client.rpc('create_team', {
      p_name: input.name,
      p_sport: input.sport,
      p_season_label: input.seasonLabel,
      ...(input.clubId ? { p_club_id: input.clubId } : {}),
    }),
  );

export const findClub = (client: Client, slug: string) =>
  run(client.rpc('find_club', { p_slug: slug }), []);

export const getTeam = (client: Client, teamId: string) =>
  run(client.from('teams').select('*').eq('id', teamId).single());

export const updateTeam = (
  client: Client,
  teamId: string,
  patch: { name: string; sport: Enums['sport']; season_label: string },
) => run(client.from('teams').update(patch).eq('id', teamId).select('*').single());

export const getClub = (client: Client, clubId: string) =>
  run(client.from('clubs').select('*').eq('id', clubId).single());

export const getClubTeams = (client: Client, clubId: string) =>
  run(
    client
      .from('teams')
      .select('id, name, sport, season_label')
      .eq('club_id', clubId)
      .order('name'),
    [],
  );

export const rotateJoinCode = (client: Client, teamId: string) =>
  run(client.rpc('rotate_team_join_code', { p_team_id: teamId }));

// Club affiliation -------------------------------------------------------------------------
export const requestClubLink = (client: Client, teamId: string, clubId: string) =>
  run(client.rpc('request_club_link', { p_team_id: teamId, p_club_id: clubId }));

export const getLinkRequests = (client: Client, target: { teamId: string } | { clubId: string }) =>
  run(
    client.rpc(
      'get_link_requests',
      'teamId' in target ? { p_team_id: target.teamId } : { p_club_id: target.clubId },
    ),
    [],
  );

export const decideClubLink = (client: Client, requestId: string, approve: boolean) =>
  run(client.rpc('decide_club_link', { p_request_id: requestId, p_approve: approve }), null);

export const unlinkTeamFromClub = (client: Client, teamId: string) =>
  run(client.rpc('unlink_team_from_club', { p_team_id: teamId }), null);

// Household and children -------------------------------------------------------------------
const CHILD_SELECT =
  'id, household_id, first_name, last_name, date_of_birth, profile_id, photo_path, login_invite_email, ' +
  'team_players(id, team_id, jersey_number, position, status, teams(id, name, sport, season_label))';

export const listChildren = (client: Client) =>
  run(client.from('players').select(CHILD_SELECT).order('first_name'), []);

export const getChild = (client: Client, id: string) =>
  run(client.from('players').select(CHILD_SELECT).eq('id', id).single());

export const addChild = (
  client: Client,
  input: {
    householdId?: string | null | undefined;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  },
) =>
  run(
    client.rpc('add_child', {
      p_household_id: input.householdId ?? NULL,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_date_of_birth: input.dateOfBirth,
    }),
  );

export const updateChild = (
  client: Client,
  id: string,
  input: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    loginInviteEmail?: string | null | undefined;
    photoPath?: string | null | undefined;
  },
) =>
  run(
    client
      .from('players')
      .update({
        first_name: input.firstName,
        last_name: input.lastName,
        date_of_birth: input.dateOfBirth,
        login_invite_email: input.loginInviteEmail ?? null,
        ...(input.photoPath !== undefined ? { photo_path: input.photoPath } : {}),
      })
      .eq('id', id)
      .select('id')
      .single(),
  );

export const createHouseholdInvite = (
  client: Client,
  input: { householdId: string; expiresInDays?: number; maxUses?: number },
) =>
  run(
    client.rpc('create_household_invite', {
      p_household_id: input.householdId,
      p_expires_in: `${input.expiresInDays ?? 7} days`,
      p_max_uses: input.maxUses ?? 1,
    }),
  );

// Roster -----------------------------------------------------------------------------------
export const getRoster = (client: Client, teamId: string) =>
  run(client.rpc('get_team_roster', { p_team_id: teamId }), []);

export const getPlayer = (client: Client, playerId: string) =>
  run(
    client
      .from('players')
      .select('id, first_name, last_name, date_of_birth, household_id')
      .eq('id', playerId)
      .single(),
  );

export const getGuardianContacts = (client: Client, playerId: string) =>
  run(client.rpc('get_guardian_contacts', { p_player_id: playerId }), []);

export const placePlayerOnRoster = (
  client: Client,
  input: {
    teamId: string;
    playerId: string;
    jerseyNumber?: number | null | undefined;
    position?: string | null | undefined;
    status?: Enums['roster_status'];
  },
) =>
  run(
    client.rpc('place_player_on_roster', {
      p_team_id: input.teamId,
      p_player_id: input.playerId,
      ...(input.jerseyNumber != null ? { p_jersey_number: input.jerseyNumber } : {}),
      ...(input.position ? { p_position: input.position } : {}),
      p_status: input.status ?? 'active',
    }),
  );

export const updateRosterRow = (
  client: Client,
  teamPlayerId: string,
  patch: { jersey_number: number | null; position: string | null; status: Enums['roster_status'] },
) => run(client.from('team_players').update(patch).eq('id', teamPlayerId).select('id').single());

export const removeFromRoster = (client: Client, teamPlayerId: string) =>
  run(client.from('team_players').delete().eq('id', teamPlayerId).select('id'), []);

// Members ----------------------------------------------------------------------------------
export const getTeamMembers = (client: Client, teamId: string) =>
  run(client.rpc('get_team_members', { p_team_id: teamId }), []);

export const setMemberRole = (client: Client, membershipId: string, role: Enums['team_role']) =>
  run(
    client.from('team_memberships').update({ role }).eq('id', membershipId).select('id').single(),
  );

export const removeMember = (client: Client, membershipId: string) =>
  run(client.from('team_memberships').delete().eq('id', membershipId).select('id'), []);

// Invites ----------------------------------------------------------------------------------
export type InviteTarget = { teamId: string } | { clubId: string } | { householdId: string };

export const createInvite = (
  client: Client,
  input: {
    target: { teamId: string } | { clubId: string };
    role: string;
    expiresInDays?: number;
    maxUses?: number;
  },
) =>
  run(
    client.rpc('create_invite', {
      p_team_id: 'teamId' in input.target ? input.target.teamId : NULL,
      p_club_id: 'clubId' in input.target ? input.target.clubId : NULL,
      p_role: input.role,
      p_expires_in: `${input.expiresInDays ?? 7} days`,
      p_max_uses: input.maxUses ?? 1,
    }),
  );

export const listInvites = (client: Client, target: InviteTarget) => {
  const q = client
    .from('invites')
    .select('id, role, expires_at, max_uses, use_count, revoked_at, created_at')
    .order('created_at', { ascending: false });
  const filtered =
    'teamId' in target
      ? q.eq('team_id', target.teamId)
      : 'clubId' in target
        ? q.eq('club_id', target.clubId)
        : q.eq('household_id', target.householdId);
  return run(filtered, []);
};

export const revokeInvite = (client: Client, inviteId: string) =>
  run(client.rpc('revoke_invite', { p_invite_id: inviteId }), null);

export const previewInvite = (client: Client, token: string) =>
  run(client.rpc('preview_invite', { p_token: token }), []);

export const acceptInvite = (client: Client, token: string) =>
  run(client.rpc('accept_invite', { p_token: token }), []);

// Join requests ----------------------------------------------------------------------------
export const requestToJoin = (
  client: Client,
  input: {
    teamCode?: string | null | undefined;
    teamId?: string | null | undefined;
    playerId?: string | null | undefined;
    message?: string | null | undefined;
  },
) =>
  run(
    client.rpc('request_to_join', {
      ...(input.teamCode ? { p_team_code: input.teamCode } : {}),
      ...(input.teamId ? { p_team_id: input.teamId } : {}),
      ...(input.playerId ? { p_player_id: input.playerId } : {}),
      ...(input.message ? { p_message: input.message } : {}),
    }),
  );

export const getJoinRequests = (client: Client, teamId: string) =>
  run(client.rpc('get_join_requests', { p_team_id: teamId }), []);

export const decideJoinRequest = (client: Client, requestId: string, approve: boolean) =>
  run(client.rpc('decide_join_request', { p_request_id: requestId, p_approve: approve }), null);

// Player logins ----------------------------------------------------------------------------
export const claimPlayerLogin = (client: Client, playerId: string) =>
  run(client.rpc('claim_player_login', { p_player_id: playerId }));

export const getPlayerLoginClaims = (client: Client) =>
  run(client.rpc('get_player_login_claims'), []);

export const decidePlayerLoginClaim = (client: Client, claimId: string, approve: boolean) =>
  run(client.rpc('decide_player_login_claim', { p_claim_id: claimId, p_approve: approve }), null);
