import { describe, expect, it } from 'vitest';

import {
  claimBanner,
  consentLine,
  firstRunState,
  inviteBanner,
  linkProblemCopy,
  pathFor,
  pendingView,
  problemFromReason,
  readCodeInput,
  resendLabel,
  resendRemaining,
  shouldAskForNotifications,
  stepLabel,
  type MyJoinRequest,
} from './onboarding';

const req = (over: Partial<MyJoinRequest> = {}): MyJoinRequest => ({
  kind: 'team',
  request_id: 'r1',
  status: 'pending',
  created_at: '2026-06-01T00:00:00Z',
  decided_at: null,
  child_first_name: 'Maya',
  place_name: null,
  ...over,
});

describe('resend cooldown', () => {
  it('counts down from the send time with an injected clock', () => {
    expect(resendRemaining(null, 1000)).toBe(0);
    expect(resendRemaining(0, 0)).toBe(60);
    expect(resendRemaining(0, 18_500)).toBe(42);
    expect(resendRemaining(0, 60_000)).toBe(0);
    expect(resendRemaining(0, 999_999)).toBe(0);
  });
  it('labels the button', () => {
    expect(resendLabel(0)).toBe('Resend email');
    expect(resendLabel(42)).toBe('Resend in 0:42');
    expect(resendLabel(60)).toBe('Resend in 1:00');
  });
});

describe('consentLine', () => {
  const text = (urls: Parameters<typeof consentLine>[0]) =>
    consentLine(urls)
      .map((s) => s.text)
      .join('');
  it('keeps the board wording with or without links', () => {
    const copy =
      'By continuing you agree to the Terms and Privacy Policy. You must be 13 or older. Parents create accounts for children under 13.';
    expect(text({})).toBe(copy);
    expect(text({ terms: 'https://t', privacy: 'https://p' })).toBe(copy);
  });
  it('links only the pages whose URL is set', () => {
    expect(consentLine({}).some((s) => s.href)).toBe(false);
    const only = consentLine({ privacy: 'https://p' }).filter((s) => s.href);
    expect(only).toEqual([{ text: 'Privacy Policy', href: 'https://p' }]);
  });
});

describe('link arrival copy', () => {
  it('names the inviter and what is being joined', () => {
    const b = inviteBanner({
      kind: 'team',
      targetName: 'Hawks',
      role: 'coach',
      inviterFirstName: 'Terry',
    });
    expect(b.title).toBe('Terry invited you to join Hawks');
    expect(b.body).toContain('as a coach');
  });
  it('falls back without an inviter and handles families', () => {
    const b = inviteBanner({ kind: 'family', targetName: 'Park family', role: 'guardian' });
    expect(b.title).toBe('You’re invited to join Park family');
    expect(b.body).toContain('this family as a guardian');
  });
  it('claim banner uses the first name only when given', () => {
    expect(claimBanner('Ava').body).toContain('Ava');
    expect(claimBanner(null).title).toBe('You’re linking your player login');
  });
  it('invalid, expired and limited links use their own copy', () => {
    expect(linkProblemCopy('invalid').title).toBe('This invite isn’t valid');
    expect(linkProblemCopy('expired').title).toBe('This invite has expired');
    expect(problemFromReason('invite_revoked')).toBe('expired');
    expect(problemFromReason('invite_invalid')).toBe('invalid');
    expect(problemFromReason(null)).toBe('invalid');
    expect(linkProblemCopy('rate_limited').title).toBe('Try again in a moment');
  });
});

describe('readCodeInput', () => {
  it('normalises a code and only checks its shape', () => {
    expect(readCodeInput(' k7m2-qx9r ta ')).toEqual({ kind: 'code', code: 'K7M2QX9RTA' });
    expect(readCodeInput('K7M2')).toEqual({ kind: 'incomplete' });
    expect(readCodeInput('')).toEqual({ kind: 'incomplete' });
    expect(readCodeInput('K7M2QX9RTAB')).toEqual({ kind: 'invalid' });
    expect(readCodeInput('K7M2!X9RTA')).toEqual({ kind: 'invalid' });
  });
  it('recognises pasted invite and claim links', () => {
    expect(readCodeInput('https://athleit.app/invite/abc123?x=1')).toEqual({
      kind: 'invite',
      token: 'abc123',
    });
    expect(readCodeInput('athleit://claim/91000000-0000-0000-0000-000000000001')).toEqual({
      kind: 'claim',
      playerId: '91000000-0000-0000-0000-000000000001',
    });
    expect(readCodeInput('https://athleit.app/claim/nope')).toEqual({ kind: 'invalid' });
    expect(readCodeInput('https://athleit.app/invite/%E0%A4%A')).toEqual({ kind: 'invalid' });
  });
});

describe('paths and step counter', () => {
  it('counts steps for multi-step paths only', () => {
    expect(stepLabel('parent', 2)).toBe('Step 2 of 3');
    expect(stepLabel('club', 1)).toBe('Step 1 of 3');
    expect(stepLabel('coach', 4)).toBe('Step 4 of 4');
    expect(stepLabel('player', 1)).toBeNull();
    expect(stepLabel('code', 1)).toBeNull();
  });
  it('clamps out-of-range steps', () => {
    expect(stepLabel('coach', 9)).toBe('Step 4 of 4');
    expect(stepLabel('coach', 0)).toBe('Step 1 of 4');
  });
  it('has the five intents in order', () => {
    expect(
      ['parent', 'coach', 'club', 'player', 'code'].map((i) => pathFor(i as never).intent),
    ).toEqual(['parent', 'coach', 'club', 'player', 'code']);
  });
});

describe('pendingView', () => {
  it('never shows a place name before approval, even if one is passed', () => {
    for (const status of ['pending', 'declined', 'cancelled']) {
      const v = pendingView(req({ status, place_name: 'Hawks' }));
      expect(v.placeName).toBeNull();
      expect(JSON.stringify(v)).not.toContain('Hawks');
    }
  });
  it('shows the place once approved', () => {
    const v = pendingView(req({ status: 'approved', place_name: 'Hawks' }));
    expect(v.title).toBe('You’re in Hawks');
    expect(v.tone).toBe('good');
    expect(v.canCancel).toBe(false);
  });
  it('words a pending team request with the child the requester named', () => {
    const v = pendingView(req());
    expect(v.title).toBe('Waiting for the team to approve Maya');
    expect(v.canCancel).toBe(true);
    expect(v.statusWord).toBe('Pending');
    expect(pendingView(req({ child_first_name: null })).title).toBe(
      'Waiting for the team to approve you',
    );
  });
  it('words a pending family request for a guardian', () => {
    const v = pendingView(req({ kind: 'household', child_first_name: null }));
    expect(v.title).toBe('Waiting for a guardian to approve you');
    expect(v.body).toContain('A guardian in the family will review it');
  });
  it('declined and cancelled are calm and give no reason', () => {
    expect(pendingView(req({ status: 'declined' })).body).toBe('You can try another code.');
    expect(pendingView(req({ status: 'cancelled' })).statusWord).toBe('Cancelled');
  });
  it('treats an unknown status as pending rather than approved', () => {
    expect(pendingView(req({ status: 'weird' })).status).toBe('pending');
  });
});

describe('firstRunState', () => {
  const none: [] = [];
  it('pending beats everything', () => {
    expect(
      firstRunState({
        hasPlace: false,
        requests: [{ status: 'pending' }],
        completedHubBefore: false,
      }),
    ).toBe('pending');
    expect(
      firstRunState({
        hasPlace: true,
        requests: [{ status: 'pending' }],
        completedHubBefore: false,
      }),
    ).toBe('pending');
  });
  it('a person with a place is not gated by the hub', () => {
    expect(firstRunState({ hasPlace: true, requests: none, completedHubBefore: false })).toBe(
      'none',
    );
  });
  it('first time sees the full hub; history makes it the returning hub', () => {
    expect(firstRunState({ hasPlace: false, requests: none, completedHubBefore: false })).toBe(
      'hub',
    );
    expect(firstRunState({ hasPlace: false, requests: none, completedHubBefore: true })).toBe(
      'hubReturning',
    );
    expect(
      firstRunState({
        hasPlace: false,
        requests: [{ status: 'declined' }],
        completedHubBefore: false,
      }),
    ).toBe('hubReturning');
  });
});

describe('notifications soft-ask', () => {
  it('asks once, after the first place', () => {
    expect(shouldAskForNotifications({ hasPlace: false, alreadyAsked: false })).toBe(false);
    expect(shouldAskForNotifications({ hasPlace: true, alreadyAsked: false })).toBe(true);
    expect(shouldAskForNotifications({ hasPlace: true, alreadyAsked: true })).toBe(false);
  });
});
