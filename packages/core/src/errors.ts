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
  [/too_many_attempts/, 'Too many attempts. Try again in a few minutes.'],
  [/invalid_code/, 'That code is invalid or has been replaced. Ask for the current one.'],
  [/team_not_found/, 'No team matches that code.'],
  [/club_not_found/, 'No club matches that.'],
  [/already_affiliated/, 'This team already belongs to a club. Unlink it first.'],
  [/not_affiliated/, 'This team is not linked to a club.'],
  [/request_not_pending/, 'That request was already decided.'],
  [/request_not_found/, 'That request could not be found.'],
  [/player_under_13/, 'Children under 13 cannot have their own login.'],
  [/player_not_found/, 'That player could not be found. Check the link you were given.'],
  [/player_already_linked/, 'This player already has a login.'],
  [/player_not_eligible/, 'Approve this child’s join request before adding them to the roster.'],
  [
    /player_role_requires_linked_player/,
    'Only a player with their own login can hold the player role.',
  ],
  [/charges_not_enabled/, 'Finish payout setup before sending payment requests.'],
  [/empty_audience/, 'There is nobody on the active roster to send this to.'],
  [/not_draft/, 'Only a draft payment request can be changed or sent.'],
  [/payment_event_locked/, 'Amount, audience and fees cannot change after sending.'],
  [/request_not_unpaid/, 'This request is no longer unpaid.'],
  [
    /request_not_payable/,
    'This request can’t be paid right now. Someone in your household may have just paid it, or it was cancelled.',
  ],
  [/payment_in_flight/, 'A payment is being processed for this request. Try again in a moment.'],
  [/payment_disputed/, 'This payment is disputed. Resolve the dispute in Stripe before refunding.'],
  [/refund_exceeds_payment|nothing_to_refund/, 'There is nothing more to refund on this payment.'],
  [/not_refundable/, 'This payment can’t be refunded.'],
  [/invalid_amount/, 'Enter a valid amount.'],
  [
    /stripe_not_configured/,
    'Payments aren’t set up on the server yet (Stripe key missing or invalid).',
  ],
  [/payment_provider_error/, 'Payments are unavailable right now. Please try again shortly.'],
  [/mixed_checkout|mixed_household/, 'Those requests have to be paid separately.'],
  [/account_not_ready/, 'This team can’t take payments yet.'],
  [/invalid_request_set/, 'Choose between 1 and 25 requests to pay.'],
  [/invalid_date_of_birth/, 'Enter a valid date of birth.'],
  [/invalid_expiry/, 'Choose an expiry between 1 and 90 days.'],
  [/not_authenticated/, 'Please sign in again.'],
  [/team_players_active_jersey_unique/, 'That jersey number is already taken by an active player.'],
  [/clubs_slug_key/, 'That club web address is taken. Try another.'],
  [
    /join_requests_one_pending|team_club_link_requests_one_pending|player_login_claims_one_pending/,
    'You already have a pending request for this.',
  ],
  [
    /minor_group_needs_two_adults/,
    'A group that includes a minor needs two coaches or managers, or a coach and that child’s parent.',
  ],
  [
    /direct_minor_guardian_only/,
    'Children and teens can only be messaged one-to-one by their own parent or guardian. Message their parent instead.',
  ],
  [/direct_needs_one_participant/, 'Choose one person to message.'],
  [/group_needs_participants/, 'Add at least one person to the group.'],
  [/participant_not_in_team/, 'That person is not on this team.'],
  [/title_required/, 'Give this thread a title.'],
  [/thread_archived/, 'This conversation is archived.'],
  [/rate_limited/, 'You are sending messages too quickly. Wait a moment and try again.'],
  [
    /places_unavailable|not_configured/,
    'Address search is not available right now. You can still type the address.',
  ],
  [/empty_message/, 'Write a message or attach a file.'],
  [/body_too_long/, 'That message is too long.'],
  [/message_removed/, 'That message was removed.'],
  [/cannot_report_own_message/, 'You cannot report your own message.'],
  [/invalid_attachment_path/, 'That attachment could not be sent. Try uploading it again.'],
  [/invalid_timezone/, 'Choose a valid timezone.'],
  [/not_a_participant/, 'You are not part of this conversation.'],
  [
    /events_location_id_fkey/,
    'This place is used by events, so it can’t be removed. Change those events first.',
  ],
  [
    /events_opponent_id_fkey/,
    'This opponent is used by games, so it can’t be removed. Change those games first.',
  ],
  [/event_cancelled/, 'This event was cancelled.'],
  [/nudged_recently/, 'Already reminded recently. Try again later.'],
  [/already_cancelled/, 'This event is already cancelled.'],
  [/event_over/, 'This event has already finished.'],
  [/event_not_started/, 'You can enter a result once the game has started.'],
  [/event_has_rsvps/, 'This event has RSVPs. Cancel it instead of deleting it.'],
  [/event_has_result/, 'This game has a result. Clear the result first.'],
  [/reason_required/, 'Say why the event is cancelled.'],
  [/player_not_on_roster/, 'That player is not on this team’s active roster.'],
  [/ties_not_allowed/, 'This sport does not allow ties. Enter a winner.'],
  [
    /period_scores_mismatch|invalid_period_scores/,
    'The period scores do not match the final score.',
  ],
  [/results_only_for_games/, 'Results can only be entered for games.'],
  [/series_cap_exceeded/, 'A repeating event can have at most 52 dates, within one year.'],
  [/invalid_recurrence|recurrence_empty/, 'Check the repeat settings.'],
  [/ends_before_start/, 'The end time must be after the start.'],
  [/location_wrong_team|opponent_wrong_team/, 'That location or opponent belongs to another team.'],
  [/token_exists/, 'You already have a calendar link. Reset it to get a new one.'],
  // Registration (Phase 5). The database names the rule; the UI says what to do about it.
  [/form_required/, 'Choose a published form for this registration first.'],
  [/window_required/, 'Set when registration opens and closes before publishing.'],
  [/window_in_past/, 'The closing time has already passed. Pick a later closing time.'],
  [
    /required_waivers_missing/,
    'This team requires waivers that are not attached to the registration. Add them first.',
  ],
  [/payments_not_ready/, 'Finish payout setup (Payments tab) before opening a paid registration.'],
  [/invalid_status_transition/, 'That is not possible in the registration’s current state.'],
  [/capacity_full|registration_full/, 'This registration is full.'],
  [/capacity_below_taken/, 'You cannot set fewer spots than are already taken.'],
  [/registration_closed|not_open_yet/, 'Registration is not open.'],
  [
    /not_verified|unverified|verification_required/,
    'The family has not confirmed their email yet.',
  ],
  [/payment_required/, 'This registration needs payment before it can be accepted.'],
  [/placement_disabled/, 'This registration is not set up to place players on a roster.'],
  [/already_placed/, 'That player is already on a roster.'],
  [/placed_withdraw_first/, 'This player is on a roster. Remove them from the roster first.'],
  [/not_accepted/, 'Accept the registration before placing the player.'],
  [/waiver_version_outdated/, 'A newer version of this waiver exists. Reload and sign the latest.'],
  [/sensitive_forbidden/, 'You do not have access to medical information.'],
  [/slug_locked/, 'The web address cannot change after registrations arrive.'],
  [/terms_locked/, 'Price and payment terms cannot change after registrations arrive.'],
  [/event_archived/, 'This registration is archived.'],
  // Team subscription (billing). The database names the rule; the UI says what to do about it.
  [
    /billing_restricted/,
    'This is paused because the team’s free trial or subscription has ended. A team admin can subscribe to turn it back on.',
  ],
  [/billing_disabled|billing_off/, 'Team billing is not turned on yet.'],
  [/already_subscribed/, 'This team is already subscribed.'],
  [/not_subscribed|no_subscription/, 'This team does not have a subscription to change.'],
  [/billing_unavailable/, 'Billing is unavailable right now. Please try again shortly.'],
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

// Sign-in, sign-up and reset ---------------------------------------------------------------------
// Supabase Auth errors carry a stable `code` (and an HTTP `status`); the message is backend text
// and must never reach the screen. Every row of the design's copy deck is a kind here.

export interface AuthErrorLike {
  message?: string | undefined;
  code?: string | undefined;
  status?: number | undefined;
  name?: string | undefined;
}

export type AuthErrorKind =
  | 'wrong_credentials'
  | 'email_in_use'
  | 'registered_social'
  | 'weak_password'
  | 'too_many_attempts'
  | 'offline'
  | 'server'
  | 'link_expired'
  | 'social_cancelled'
  | 'email_not_confirmed'
  | 'invalid_input';

export interface AuthErrorOptions {
  /**
   * Providers the existing account was created with (for example ['google']), only when the app can
   * truly tell. Without it a clash is reported as the generic "already registered".
   */
  providers?: readonly string[] | undefined;
  /** Seconds the server asked the caller to wait, when it said so. Never guessed. */
  retryAfterSeconds?: number | undefined;
}

const PROVIDER_LABEL: Record<string, string> = { google: 'Google', apple: 'Apple' };

/** Which social provider (if any) an account can sign in with and has no password for. */
export function socialOnlyProvider(providers: readonly string[] | undefined): string | null {
  if (!providers || providers.length === 0 || providers.includes('email')) return null;
  return providers.find((p) => p in PROVIDER_LABEL) ?? null;
}

export function classifyAuthError(
  error: AuthErrorLike | null | undefined,
  opts: AuthErrorOptions = {},
): AuthErrorKind {
  const e = error ?? {};
  const text = `${e.message ?? ''}`;
  const code = e.code ?? '';
  if (
    e.name === 'AuthRetryableFetchError' ||
    e.status === 0 ||
    /network request failed|failed to fetch|fetch failed|network error|offline/i.test(text)
  ) {
    return 'offline';
  }
  if (code === 'user_cancelled' || code === 'access_denied' || /cancel/i.test(text)) {
    return 'social_cancelled';
  }
  if (code.startsWith('over_') || e.status === 429 || /rate limit|too many/i.test(text)) {
    return 'too_many_attempts';
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(text)) {
    return 'email_not_confirmed';
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(text)) {
    return 'wrong_credentials';
  }
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    /already (been )?registered/i.test(text)
  ) {
    return socialOnlyProvider(opts.providers) ? 'registered_social' : 'email_in_use';
  }
  if (code === 'weak_password' || /password (should|must) be at least|weak password/i.test(text)) {
    return 'weak_password';
  }
  if (code === 'otp_expired' || /expired|invalid.*(token|link)|link.*invalid/i.test(text)) {
    return 'link_expired';
  }
  // Any other client error (bad email format, sign-ups closed, ...) is not the server's fault.
  if (e.status !== undefined && e.status >= 400 && e.status < 500) return 'invalid_input';
  return 'server';
}

const minutesLabel = (seconds: number) => {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
};

/** The design's copy deck. Pass `provider` for 'registered_social'. */
export function authCopy(
  kind: AuthErrorKind,
  opts: { provider?: string | null | undefined; retryAfterSeconds?: number | undefined } = {},
): string {
  switch (kind) {
    case 'wrong_credentials':
      return 'That email and password don’t match. Check them and try again, or reset your password.';
    case 'email_in_use':
      return 'This email is already registered. Sign in instead.';
    case 'registered_social': {
      const name = PROVIDER_LABEL[opts.provider ?? ''] ?? 'Google';
      return `You signed up with ${name}. Use the ${name} button to sign in.`;
    }
    case 'weak_password':
      return 'Use at least 8 characters. A longer phrase is stronger.';
    case 'too_many_attempts':
      return opts.retryAfterSeconds
        ? `Too many attempts. Try again in ${minutesLabel(opts.retryAfterSeconds)}, or reset your password.`
        : 'Too many attempts. Try again in a few minutes, or reset your password.';
    case 'offline':
      return 'No connection. Check your internet and try again.';
    case 'server':
      return 'Something went wrong on our side. Nothing was changed. Try again in a moment.';
    case 'link_expired':
      return 'This link has expired. Ask for a new one.';
    case 'social_cancelled':
      return 'Sign-in was cancelled. Try again, or use your email.';
    case 'email_not_confirmed':
      return 'Confirm your email first. Check your inbox, or ask for a new link.';
    case 'invalid_input':
      return 'We couldn’t use that. Check what you entered and try again.';
  }
}

/** One call for screens: classify a Supabase Auth or network error and return the board's sentence. */
export function friendlyAuthError(
  error: AuthErrorLike | null | undefined,
  opts: AuthErrorOptions = {},
): string {
  const kind = classifyAuthError(error, opts);
  return authCopy(kind, {
    provider: socialOnlyProvider(opts.providers),
    retryAfterSeconds: opts.retryAfterSeconds,
  });
}
