import { describe, expect, it } from 'vitest';

import {
  AVATAR_MAX_BYTES,
  accountNameSchema,
  avatarPath,
  canDisconnectMethod,
  changePasswordSchema,
  hasPasswordMethod,
  isLastAdminError,
  memberSince,
  passwordStrength,
  squareCrop,
  validateAvatarFile,
} from './account';
import { updateProfileSchema } from './schemas/profile';

describe('display name', () => {
  it('trims and requires 1 to 80 characters', () => {
    expect(accountNameSchema.parse({ displayName: '  Jordan  ' }).displayName).toBe('Jordan');
    expect(accountNameSchema.safeParse({ displayName: '   ' }).success).toBe(false);
    expect(accountNameSchema.safeParse({ displayName: 'x'.repeat(81) }).success).toBe(false);
    expect(accountNameSchema.safeParse({ displayName: 'x'.repeat(80) }).success).toBe(true);
  });
});

describe('avatar upload validation', () => {
  it('accepts JPEG, PNG and WebP up to 5 MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp'])
      expect(validateAvatarFile({ type, size: 1000 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_BYTES })).toBeNull();
  });
  it('rejects other types, empty files and files over 5 MB', () => {
    expect(validateAvatarFile({ type: 'image/gif', size: 10 })).toMatch(/JPG, PNG or WebP/);
    expect(validateAvatarFile({ type: 'application/pdf', size: 10 })).not.toBeNull();
    expect(validateAvatarFile({ type: 'image/png', size: 0 })).toMatch(/empty/);
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_BYTES + 1 })).toMatch(/5 MB/);
  });
  it('stores under the user folder with a fresh name', () => {
    expect(avatarPath('u1', 'image/webp', 5)).toBe('u1/5.webp');
    expect(() => avatarPath('u1', 'image/gif')).toThrow();
  });
  it('only lets a profile point at an https URL or a folder path', () => {
    const uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    expect(updateProfileSchema.safeParse({ avatar_url: `${uid}/1.jpg` }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ avatar_url: 'https://x.test/p.jpg' }).success).toBe(
      true,
    );
    expect(updateProfileSchema.safeParse({ avatar_url: 'javascript:alert(1)' }).success).toBe(
      false,
    );
    expect(updateProfileSchema.safeParse({ avatar_url: null }).success).toBe(true);
  });
});

describe('squareCrop', () => {
  it('centres the largest square and keeps a pan inside the image', () => {
    expect(squareCrop(400, 200)).toEqual({ sx: 100, sy: 0, size: 200 });
    expect(squareCrop(400, 200, { x: 9999, y: 9999 })).toEqual({ sx: 200, sy: 0, size: 200 });
    expect(squareCrop(400, 200, { x: -9999, y: 0 })).toEqual({ sx: 0, sy: 0, size: 200 });
    expect(squareCrop(400, 400, { x: 0, y: 0 }, 2)).toEqual({ sx: 100, sy: 100, size: 200 });
  });
});

describe('password', () => {
  it('rates strength', () => {
    expect(passwordStrength('abc').level).toBe('weak');
    expect(passwordStrength('Abcdefgh1').level).toBe('fair');
    expect(passwordStrength('Abcdefgh1234!x').level).toBe('strong');
  });
  it('asks for the current password only when one exists, and checks the confirmation', () => {
    const base = { next: 'Abcdefgh1', confirm: 'Abcdefgh1' };
    expect(changePasswordSchema.safeParse({ ...base, hasPassword: false }).success).toBe(true);
    const need = changePasswordSchema.safeParse({ ...base, hasPassword: true });
    expect(need.success).toBe(false);
    expect(
      changePasswordSchema.safeParse({ ...base, hasPassword: true, current: 'Old-password1' })
        .success,
    ).toBe(true);
    const mismatch = changePasswordSchema.safeParse({
      ...base,
      confirm: 'nope',
      hasPassword: false,
    });
    expect(mismatch.success).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        ...base,
        next: 'short',
        confirm: 'short',
        hasPassword: false,
      }).success,
    ).toBe(false);
  });
});

describe('sign-in methods', () => {
  const both = [{ provider: 'email' }, { provider: 'google' }];
  it('never lets the last method be removed', () => {
    expect(canDisconnectMethod(both, 'google')).toBe(true);
    expect(canDisconnectMethod([{ provider: 'google' }], 'google')).toBe(false);
    expect(canDisconnectMethod(both, 'apple')).toBe(false);
  });
  it('detects an OAuth-only account', () => {
    expect(hasPasswordMethod(both)).toBe(true);
    expect(hasPasswordMethod([{ provider: 'google' }])).toBe(false);
  });
});

describe('misc', () => {
  it('recognises the last-admin trigger error', () => {
    expect(isLastAdminError({ message: 'last_admin' })).toBe(true);
    expect(isLastAdminError({ message: 'other' })).toBe(false);
    expect(isLastAdminError(null)).toBe(false);
  });
  it('formats member since', () => {
    expect(memberSince('2025-08-14T10:00:00Z')).toBe('Aug 2025');
    expect(memberSince('nope')).toBe('');
  });
});
