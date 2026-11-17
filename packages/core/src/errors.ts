export interface DbErrorLike {
  message?: string | undefined;
  code?: string | undefined;
  details?: string | null | undefined;
}

const BY_MESSAGE: [RegExp, string][] = [
  [/last_admin/, 'A team or club must keep at least one admin. Make someone else an admin first.'],
  [/invite_invalid/, 'This invite link is not valid.'],
  [/invite_expired/, 'This invite has expired. Ask for a new one.'],
  [/invite_revoked/, 'This invite was cancelled. Ask for a new one.'],
  [/invite_exhausted/, 'This invite has already been used.'],
  [/already_member/, 'You are already a member.'],
  [/team_not_found/, 'No team matches that code.'],
  [/club_not_found/, 'No club matches that.'],
  [/already_affiliated/, 'This team already belongs to a club. Unlink it first.'],
  [/not_affiliated/, 'This team is not linked to a club.'],
  [/request_not_pending/, 'That request was already decided.'],
  [/player_under_13/, 'Children under 13 cannot have their own login.'],
  [/player_not_found/, 'That player could not be found. Check the link you were given.'],
  [/player_already_linked/, 'This player already has a login.'],
  [/player_not_eligible/, 'Approve this child’s join request before adding them to the roster.'],
  [
    /player_role_requires_linked_player/,
    'Only a player with their own login can hold the player role.',
  ],
  [/invalid_date_of_birth/, 'Enter a valid date of birth.'],
  [/invalid_expiry/, 'Choose an expiry between 1 and 90 days.'],
  [/not_authenticated/, 'Please sign in again.'],
  [/team_players_active_jersey_unique/, 'That jersey number is already taken by an active player.'],
  [/clubs_slug_key/, 'That club web address is taken. Try another.'],
  [
    /join_requests_one_pending|team_club_link_requests_one_pending|player_login_claims_one_pending/,
    'You already have a pending request for this.',
  ],
  [/forbidden/, 'You do not have permission to do that.'],
];

/** Turn a Postgres/PostgREST error into a sentence a parent or coach can act on. */
export function friendlyError(error: DbErrorLike | null | undefined): string {
  if (!error) return 'Something went wrong. Try again.';
  const text = `${error.message ?? ''} ${error.details ?? ''}`;
  for (const [re, msg] of BY_MESSAGE) if (re.test(text)) return msg;
  if (error.code === '42501') return 'You do not have permission to do that.';
  if (error.code === '23505') return 'That already exists.';
  if (error.code === '23514') return 'Check the values you entered and try again.';
  return 'Something went wrong. Try again.';
}
