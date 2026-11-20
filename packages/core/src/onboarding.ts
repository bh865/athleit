// Sign-in screens and the first-run flow: copy and decisions that web and mobile share.
// Nothing here grants access. A code only ever starts a request that staff or a guardian decides.

// Resend cooldown ------------------------------------------------------------------------------
/** Mirrors the board. The server enforces its own minimum (`[auth.email] max_frequency`). */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Whole seconds left before Resend works again. Clocks are passed in, never read here. */
export function resendRemaining(
  sentAtMs: number | null | undefined,
  nowMs: number,
  cooldownSeconds = RESEND_COOLDOWN_SECONDS,
): number {
  if (sentAtMs == null) return 0;
  return Math.max(0, Math.ceil((sentAtMs + cooldownSeconds * 1000 - nowMs) / 1000));
}

export function resendLabel(remainingSeconds: number): string {
  if (remainingSeconds <= 0) return 'Resend email';
  const m = Math.floor(remainingSeconds / 60);
  const s = String(remainingSeconds % 60).padStart(2, '0');
  return `Resend in ${m}:${s}`;
}

// Consent line -----------------------------------------------------------------------------------
// Copy comes from the design and is awaiting legal review: do not edit it here.
export interface ConsentSegment {
  text: string;
  href?: string;
}

/** A link appears only when its URL is configured; otherwise the words stay as plain text. */
export function consentLine(urls: {
  terms?: string | null | undefined;
  privacy?: string | null | undefined;
}): ConsentSegment[] {
  const seg = (text: string, href?: string | null): ConsentSegment =>
    href ? { text, href } : { text };
  return [
    seg('By continuing you agree to the '),
    seg('Terms', urls.terms),
    seg(' and '),
    seg('Privacy Policy', urls.privacy),
    seg('. You must be 13 or older. Parents create accounts for children under 13.'),
  ];
}

// Link arrival ---------------------------------------------------------------------------------------
export type InviteKind = 'team' | 'club' | 'family';
export type PublicPreviewOutcome = 'ok' | 'invalid' | 'expired' | 'rate_limited';

const ROLE_PHRASE: Record<string, string> = {
  admin: 'an admin',
  coach: 'a coach',
  manager: 'a manager',
  parent: 'a parent',
  player: 'a player',
  guardian: 'a guardian',
};

export interface InviteBannerInput {
  kind: InviteKind;
  targetName: string;
  role: string;
  inviterFirstName?: string | null | undefined;
}

/** The first thing on screen when someone arrives from an invite: who invited them and to what. */
export function inviteBanner(i: InviteBannerInput): { title: string; body: string } {
  const who = i.inviterFirstName?.trim();
  const title = who
    ? `${who} invited you to join ${i.targetName}`
    : `You’re invited to join ${i.targetName}`;
  const as = ROLE_PHRASE[i.role] ?? 'a member';
  const noun = i.kind === 'family' ? 'family' : i.kind;
  return {
    title,
    body: `You’ll join this ${noun} as ${as}. Create an account or sign in to accept.`,
  };
}

export function claimBanner(playerFirstName?: string | null | undefined): {
  title: string;
  body: string;
} {
  const who = playerFirstName?.trim();
  return {
    title: 'You’re linking your player login',
    body: who
      ? `This links your account to ${who}. A parent or guardian confirms it.`
      : 'A parent or guardian confirms it.',
  };
}

/** Invalid and expired links share a calm screen; neither reveals anything about the invite. */
export function linkProblemCopy(outcome: Exclude<PublicPreviewOutcome, 'ok'>): {
  title: string;
  body: string;
} {
  if (outcome === 'expired') {
    return {
      title: 'This invite has expired',
      body: 'Invites last for a limited time. Ask the person who invited you to send a new one.',
    };
  }
  if (outcome === 'rate_limited') {
    return {
      title: 'Try again in a moment',
      body: 'Too many attempts. Try again in a few minutes.',
    };
  }
  return {
    title: 'This invite isn’t valid',
    body: 'The link may have been mistyped or already used. Ask the person who invited you for a new one.',
  };
}

/** Maps the signed-in preview's `reason` (invite_expired, …) to the shared outcome. */
export function problemFromReason(reason: string | null | undefined): 'invalid' | 'expired' {
  return reason === 'invite_expired' || reason === 'invite_revoked' || reason === 'invite_exhausted'
    ? 'expired'
    : 'invalid';
}

/** Continue-as: the link's account differs from the one signed in. Never act silently. */
export const continueAsCopy = (email: string) => ({
  title: `Continue as ${email}?`,
  body: 'You’re signed in with a different account. Continue with it, or switch accounts.',
});

// Code input -----------------------------------------------------------------------------------------
export type CodeInput =
  | { kind: 'code'; code: string }
  | { kind: 'invite'; token: string }
  | { kind: 'claim'; playerId: string }
  | { kind: 'incomplete' }
  | { kind: 'invalid' };

const CODE_LENGTH = 10;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Format check only. A team code and a family code look the same, and this never says a code
 * exists: the database decides, behind its attempt limit. A pasted invite or claim link is
 * recognised so it can go to its own screen instead of failing as a code.
 */
export function readCodeInput(raw: string): CodeInput {
  const text = raw.trim();
  if (!text) return { kind: 'incomplete' };
  const invite = /\/invite\/([^/?#\s]+)/i.exec(text);
  if (invite?.[1]) return { kind: 'invite', token: decodeURIComponent(invite[1]) };
  const claim = /\/claim\/([^/?#\s]+)/i.exec(text);
  if (claim?.[1]) {
    const id = UUID.exec(claim[1])?.[0];
    return id ? { kind: 'claim', playerId: id.toLowerCase() } : { kind: 'invalid' };
  }
  const code = text.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]*$/.test(code)) return { kind: 'invalid' };
  if (code.length < CODE_LENGTH) return { kind: 'incomplete' };
  return code.length === CODE_LENGTH ? { kind: 'code', code } : { kind: 'invalid' };
}

// Intent hub and paths ---------------------------------------------------------------------------------
export type OnboardingIntent = 'parent' | 'coach' | 'club' | 'player' | 'code';

export interface IntentPath {
  intent: OnboardingIntent;
  title: string;
  hint: string;
  /** Counted steps, including the closing screen ("You’re set"), as the board counts them. */
  steps: readonly string[];
}

export const ONBOARDING_PATHS: readonly IntentPath[] = [
  {
    intent: 'parent',
    title: 'I’m a parent',
    hint: 'Add your child and join their team.',
    steps: ['Add your child', 'Is your child on a team?', 'Enter the team code'],
  },
  {
    intent: 'coach',
    title: 'I coach or manage a team',
    hint: 'Create your team and invite families.',
    steps: ['Create your team', 'Invite your families', 'Add your first event', 'You’re set'],
  },
  {
    intent: 'club',
    title: 'I run a club',
    hint: 'Create your club and bring your teams.',
    steps: ['Create your club', 'Bring in your teams', 'You’re set'],
  },
  {
    intent: 'player',
    title: 'I’m a player (13 and over)',
    hint: 'Link your own login.',
    steps: ['Link your login'],
  },
  {
    intent: 'code',
    title: 'I have a code or invite',
    hint: 'Join with a team or family code.',
    steps: ['Enter your code'],
  },
];

export function pathFor(intent: OnboardingIntent): IntentPath {
  return ONBOARDING_PATHS.find((p) => p.intent === intent) as IntentPath;
}

/** "Step 2 of 3", read aloud as written. Null for one-step paths, which show no counter. */
export function stepLabel(intent: OnboardingIntent, step: number): string | null {
  const total = pathFor(intent).steps.length;
  if (total <= 1) return null;
  const n = Math.min(Math.max(1, Math.floor(step)), total);
  return `Step ${n} of ${total}`;
}

// Own join requests ----------------------------------------------------------------------------------------
export type JoinRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

/** One row of get_my_join_requests. */
export interface MyJoinRequest {
  kind: string;
  request_id: string;
  status: string;
  created_at: string;
  decided_at: string | null;
  child_first_name: string | null;
  place_name: string | null;
}

export interface PendingView {
  requestId: string;
  kind: 'team' | 'household';
  status: JoinRequestStatus;
  title: string;
  body: string;
  /** Only the requester's own words and dates, plus the place once approved. */
  childFirstName: string | null;
  placeName: string | null;
  canCancel: boolean;
  tone: 'waiting' | 'good' | 'quiet';
  /** Text that stands in for the status icon so colour is never the only cue. */
  statusWord: 'Pending' | 'Approved' | 'Declined' | 'Cancelled';
}

const STATUSES: readonly string[] = ['pending', 'approved', 'declined', 'cancelled'];

/**
 * What the Pending card may show. The place name is dropped unless the request is approved, even if
 * a caller passes one, so a pending requester can never see the team or family.
 */
export function pendingView(r: MyJoinRequest): PendingView {
  const kind = r.kind === 'household' ? 'household' : 'team';
  const status = (STATUSES.includes(r.status) ? r.status : 'pending') as JoinRequestStatus;
  const child = r.child_first_name?.trim() || null;
  const placeName = status === 'approved' ? r.place_name : null;
  const base = { requestId: r.request_id, kind, status, childFirstName: child, placeName } as const;

  if (status === 'approved') {
    return {
      ...base,
      title: placeName ? `You’re in ${placeName}` : 'Your request was approved',
      body: 'You can open it now.',
      canCancel: false,
      tone: 'good',
      statusWord: 'Approved',
    };
  }
  if (status === 'declined') {
    return {
      ...base,
      title: 'This request wasn’t approved',
      body: 'You can try another code.',
      canCancel: false,
      tone: 'quiet',
      statusWord: 'Declined',
    };
  }
  if (status === 'cancelled') {
    return {
      ...base,
      title: 'You cancelled this request',
      body: 'You can send a new one with a code.',
      canCancel: false,
      tone: 'quiet',
      statusWord: 'Cancelled',
    };
  }
  const family = kind === 'household';
  return {
    ...base,
    title: family
      ? 'Waiting for a guardian to approve you'
      : child
        ? `Waiting for the team to approve ${child}`
        : 'Waiting for the team to approve you',
    body: family
      ? 'A guardian in the family will review it. You’ll get a notification when they approve. Until then you can’t see the family’s information.'
      : 'The team’s staff will review it. You’ll get a notification when they approve. Until then you can’t see the team’s information.',
    canCancel: true,
    tone: 'waiting',
    statusWord: 'Pending',
  };
}

export const REQUEST_SENT_COPY = {
  team: {
    title: 'Request sent',
    body: 'The team’s staff will review it. You’ll get a notification when they approve. Until then you can’t see the team’s information.',
  },
  household: {
    title: 'Request sent',
    body: 'A guardian in the family will review it. You’ll get a notification when they approve.',
  },
} as const;

export const CODE_RULE_COPY =
  'A code never gives access. A guardian or staff member approves your request.';
export const UNDER_13_COPY =
  'Children under 13 never have their own login. You manage everything for them.';
export const TEAM_CODE_NOT_FOUND_COPY = 'We couldn’t find that code. Check it with your coach.';

/** The family code's four outcomes, in the board's words. */
export const FAMILY_CODE_COPY = {
  sent: 'A guardian in the family will review it.',
  invalid_code: 'That code doesn’t look right.',
  already_member: 'You’re already in this family.',
  too_many_attempts: 'For safety, try again in a few minutes.',
} as const;

/** What the signed-in person with no place should see on Home. */
export type FirstRunState = 'pending' | 'hub' | 'hubReturning' | 'none';

export function firstRunState(input: {
  hasPlace: boolean;
  requests: readonly Pick<MyJoinRequest, 'status'>[];
  /** Local flag set when a hub path completed (kv on mobile, a cookie on web). */
  completedHubBefore: boolean;
}): FirstRunState {
  if (input.requests.some((r) => r.status === 'pending')) return 'pending';
  if (input.hasPlace) return 'none';
  return input.requests.length > 0 || input.completedHubBefore ? 'hubReturning' : 'hub';
}

/** Notifications soft-ask: once, after the first approved place, never before and never twice. */
export function shouldAskForNotifications(input: {
  hasPlace: boolean;
  alreadyAsked: boolean;
}): boolean {
  return input.hasPlace && !input.alreadyAsked;
}
