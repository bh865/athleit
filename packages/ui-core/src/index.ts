/**
 * Platform-neutral UI vocabulary shared by web and mobile: names, variants and small pure
 * helpers. No styling and no React here, so both platforms stay thin and in sync.
 */

/** Every icon the app may draw. Each platform's Icon wrapper must map every name (enforced by the type). */
export const iconNames = [
  'house',
  'house-line',
  'calendar-blank',
  'users-three',
  'chat-circle',
  'credit-card',
  'dots-three-circle',
  'bell',
  'check',
  'check-circle',
  'x',
  'x-circle',
  'clock',
  'warning',
  'warning-circle',
  'warning-octagon',
  'wifi-slash',
  'caret-left',
  'caret-right',
  'caret-up-down',
  'plus',
  'copy',
  'qr-code',
  'sun',
  'moon',
  'desktop',
  'arrow-right',
  'apple-logo',
  'google-logo',
  'user',
  'sign-out',
  'tray',
  'camera',
  'paperclip',
  'arrow-up',
  'arrow-down',
  'megaphone',
  'info',
  'thumbs-up',
  'heart',
  'smiley',
  'confetti',
  'hands-clapping',
  'star',
  'arrow-bend-up-left',
  'flag',
  'file-pdf',
  'bell-slash',
  'eye-slash',
  'prohibit',
  'trash',
  'pencil',
  'shield-check',
  'map-pin',
  'link',
  'arrow-clockwise',
  'repeat',
  'question',
  'caret-down',
  'receipt',
  'bank',
  'download-simple',
  'clipboard-text',
  'folder-open',
  'upload-simple',
  'file-text',
  'eye',
  'list-checks',
] as const;
export type IconName = (typeof iconNames)[number];

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';
export type ChipTone = 'neutral' | 'selected';

/** Semantic colour name (from @athleit/tokens) for each status tone. */
export const statusColorToken = { success: 'ok', warning: 'warn', danger: 'bad' } as const;
export const statusSoftToken = {
  success: 'okSoft',
  warning: 'warnSoft',
  danger: 'badSoft',
} as const;

/** "Maya Reyes" -> "MR"; one word -> first two letters. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
  const letters = last ? `${first[0]}${last[0]}` : first.slice(0, 2);
  return letters.toUpperCase();
}

/** Stable palette slot 1..3 for an avatar (lime, ice blue, charcoal), derived from any string. */
export function avatarSlot(seed: string): 1 | 2 | 3 {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ((h % 3) + 1) as 1 | 2 | 3;
}

export type AvatarSize = 'sm' | 'md' | 'lg';
