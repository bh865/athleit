import { z } from 'zod';

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './constants';
import { passwordSchema } from './schemas/auth';

/** Profile photos: mirrors the `avatars` bucket limits (migration 20260405000000). */
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
/** Longest side of the square the client uploads, after cropping. */
export const AVATAR_OUTPUT_PX = 512;

const EXT: Record<(typeof AVATAR_MIME_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** An error message the UI can show as-is, or null when the file is acceptable. */
export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type))
    return 'Choose a JPG, PNG or WebP photo.';
  if (file.size <= 0) return 'That file is empty. Choose another photo.';
  if (file.size > AVATAR_MAX_BYTES)
    return 'The file is over 5 MB. Choose a smaller JPG, PNG or WebP and try again.';
  return null;
}

/** Storage path for a new photo: `<user id>/<timestamp>.<ext>` (a new name each time busts caches). */
export function avatarPath(userId: string, mime: string, now = Date.now()): string {
  const ext = EXT[mime as keyof typeof EXT];
  if (!ext) throw new Error('unsupported_avatar_type');
  return `${userId}/${now}.${ext}`;
}

/** profiles.avatar_url is an external https URL (an OAuth picture) or a path in the avatars bucket. */
export function isExternalAvatar(value: string | null | undefined): boolean {
  return !!value && /^https:\/\//.test(value);
}

export function isStoredAvatar(value: string | null | undefined, userId: string): boolean {
  return !!value && value.startsWith(`${userId}/`);
}

/** Largest centred square of a w×h image, shifted by a pan offset (px of the source), kept inside the image. */
export function squareCrop(
  w: number,
  h: number,
  offset: { x: number; y: number } = { x: 0, y: 0 },
  zoom = 1,
): { sx: number; sy: number; size: number } {
  const size = Math.min(w, h) / Math.max(1, zoom);
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(0, max));
  return {
    sx: clamp((w - size) / 2 + offset.x, w - size),
    sy: clamp((h - size) / 2 + offset.y, h - size),
    size,
  };
}

/** What a user may change on their own profile; the name is trimmed and 1 to 80 characters. */
export const accountNameSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Add a display name (1 to 80 characters).')
    .max(80, 'Use at most 80 characters.'),
});

export type PasswordStrength = { level: 'weak' | 'fair' | 'strong'; hint: string };

export function passwordStrength(pw: string): PasswordStrength {
  let score = 0;
  if (pw.length >= MIN_PASSWORD_LENGTH) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { level: 'weak', hint: 'Use a longer password with a mix of characters.' };
  if (score <= 3) return { level: 'fair', hint: 'Add a number or symbol to make it stronger.' };
  return { level: 'strong', hint: 'Looks strong.' };
}

export const PASSWORD_STRENGTH_WORD: Record<PasswordStrength['level'], string> = {
  weak: 'Weak',
  fair: 'Fair',
  strong: 'Strong',
};

/** What the meter says in words, so strength is never carried by colour alone. */
export function passwordStrengthLabel(pw: string): {
  text: string;
  level: PasswordStrength['level'] | null;
  filled: 0 | 1 | 2 | 3;
} {
  if (pw.length === 0) return { text: '', level: null, filled: 0 };
  const { level } = passwordStrength(pw);
  return {
    text: `Password strength: ${PASSWORD_STRENGTH_WORD[level]}`,
    level,
    filled: level === 'weak' ? 1 : level === 'fair' ? 2 : 3,
  };
}

/** Change password. The current password is only asked for when the account already has one. */
export const changePasswordSchema = z
  .object({
    current: z.string().optional(),
    next: passwordSchema,
    confirm: z.string(),
    hasPassword: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.hasPassword && !v.current)
      ctx.addIssue({ code: 'custom', path: ['current'], message: 'Enter your current password.' });
    if (v.next !== v.confirm)
      ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Passwords don’t match.' });
    if (v.hasPassword && v.current && v.current === v.next)
      ctx.addIssue({
        code: 'custom',
        path: ['next'],
        message: 'Choose a password you haven’t used here.',
      });
  });
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
export { MAX_PASSWORD_LENGTH };

export interface SignInMethod {
  /** Supabase identity provider: 'email', 'google', 'apple'. */
  provider: string;
  identityId?: string;
}

/** The user must always keep at least one way to sign in. */
export function canDisconnectMethod(methods: readonly SignInMethod[], provider: string): boolean {
  const others = methods.filter((m) => m.provider !== provider);
  return methods.some((m) => m.provider === provider) && others.length >= 1;
}

/** An OAuth-only account has no email identity yet (so no password): offer "Set a password". */
export function hasPasswordMethod(methods: readonly SignInMethod[]): boolean {
  return methods.some((m) => m.provider === 'email');
}

/** `last_admin` comes from the database triggers that keep a team or club from losing its only admin. */
export function isLastAdminError(e: { message?: string } | null | undefined): boolean {
  return !!e?.message && e.message.includes('last_admin');
}

export interface DeletionBlockers {
  teams: { id: string; name: string }[];
  clubs: { id: string; name: string }[];
  households: { id: string; name: string }[];
  /** Payment plans with installments still to be paid. */
  plans: { id: string; name: string }[];
}

export const noDeletionBlockers = (b: DeletionBlockers) =>
  b.teams.length + b.clubs.length + b.households.length + b.plans.length === 0;

/** "Aug 2025" for the account header. */
export function memberSince(createdAt: string, locale = 'en-US'): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
}

/** Supabase Auth errors are written for end users ("New password should be different…"); show them as they are. */
export function authErrorMessage(e: { message?: string } | null | undefined): string {
  const m = e?.message?.trim();
  return m && m.length <= 160 ? m : 'Something went wrong. Try again.';
}
