import { describe, expect, it } from 'vitest';

import {
  authCopy,
  friendlyAuthError,
  classifyAuthError,
  friendlyError,
  socialOnlyProvider,
} from './errors';
import { passwordStrengthLabel } from './account';

describe('classifyAuthError', () => {
  it.each([
    [{ code: 'invalid_credentials', status: 400 }, 'wrong_credentials'],
    [{ message: 'Invalid login credentials' }, 'wrong_credentials'],
    [{ code: 'user_already_exists', status: 422 }, 'email_in_use'],
    [{ message: 'User already registered' }, 'email_in_use'],
    [{ code: 'weak_password', status: 422 }, 'weak_password'],
    [{ message: 'Password should be at least 8 characters' }, 'weak_password'],
    [{ code: 'over_request_rate_limit', status: 429 }, 'too_many_attempts'],
    [{ code: 'over_email_send_rate_limit' }, 'too_many_attempts'],
    [{ message: 'email rate limit exceeded' }, 'too_many_attempts'],
    [{ name: 'AuthRetryableFetchError', status: 0, message: 'Network request failed' }, 'offline'],
    [{ message: 'Failed to fetch' }, 'offline'],
    [{ code: 'otp_expired' }, 'link_expired'],
    [{ message: 'Email link is invalid or has expired' }, 'link_expired'],
    [{ code: 'email_not_confirmed' }, 'email_not_confirmed'],
    [{ code: 'user_cancelled' }, 'social_cancelled'],
    [{ status: 422, code: 'validation_failed' }, 'invalid_input'],
    [{ status: 500, message: 'boom' }, 'server'],
    [undefined, 'server'],
  ])('%j is %s', (err, kind) => {
    expect(classifyAuthError(err as never)).toBe(kind);
  });

  it('only reports a Google or Apple account when the provider list says so', () => {
    const clash = { code: 'user_already_exists' };
    expect(classifyAuthError(clash)).toBe('email_in_use');
    expect(classifyAuthError(clash, { providers: ['google'] })).toBe('registered_social');
    expect(classifyAuthError(clash, { providers: ['email', 'google'] })).toBe('email_in_use');
    expect(socialOnlyProvider(['apple'])).toBe('apple');
    expect(socialOnlyProvider([])).toBeNull();
  });
});

describe('auth copy', () => {
  it('matches the copy deck for every kind', () => {
    expect(authCopy('wrong_credentials')).toBe(
      'That email and password don’t match. Check them and try again, or reset your password.',
    );
    expect(authCopy('email_in_use')).toBe('This email is already registered. Sign in instead.');
    expect(authCopy('registered_social', { provider: 'google' })).toBe(
      'You signed up with Google. Use the Google button to sign in.',
    );
    expect(authCopy('registered_social', { provider: 'apple' })).toBe(
      'You signed up with Apple. Use the Apple button to sign in.',
    );
    expect(authCopy('weak_password')).toBe(
      'Use at least 8 characters. A longer phrase is stronger.',
    );
    expect(authCopy('offline')).toBe('No connection. Check your internet and try again.');
    expect(authCopy('server')).toBe(
      'Something went wrong on our side. Nothing was changed. Try again in a moment.',
    );
    expect(authCopy('link_expired')).toBe('This link has expired. Ask for a new one.');
    expect(authCopy('social_cancelled')).toBe(
      'Sign-in was cancelled. Try again, or use your email.',
    );
  });
  it('quotes a wait time only when the server gave one', () => {
    expect(authCopy('too_many_attempts', { retryAfterSeconds: 840 })).toBe(
      'Too many attempts. Try again in 14 minutes, or reset your password.',
    );
    expect(authCopy('too_many_attempts', { retryAfterSeconds: 30 })).toContain('1 minute,');
    expect(authCopy('too_many_attempts')).toBe(
      'Too many attempts. Try again in a few minutes, or reset your password.',
    );
  });
  it('never returns backend text', () => {
    const msg = friendlyAuthError({
      message: 'duplicate key value violates unique constraint "users_email_key"',
      code: 'unexpected_failure',
      status: 500,
    });
    expect(msg).not.toContain('duplicate');
    expect(msg).toBe(authCopy('server'));
  });
  it('maps the join-request cancel error', () => {
    expect(friendlyError({ message: 'request_not_found' })).toBe(
      'That request could not be found.',
    );
  });
});

describe('passwordStrengthLabel', () => {
  it('reads as words, empty for no input', () => {
    expect(passwordStrengthLabel('')).toEqual({ text: '', level: null, filled: 0 });
    expect(passwordStrengthLabel('abc').text).toBe('Password strength: Weak');
    expect(passwordStrengthLabel('Abcdefgh1').text).toBe('Password strength: Fair');
    expect(passwordStrengthLabel('Correct-Horse-9').text).toBe('Password strength: Strong');
    expect(passwordStrengthLabel('Correct-Horse-9').filled).toBe(3);
  });
});
