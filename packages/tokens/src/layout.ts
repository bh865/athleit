/** 4px-based spacing scale (px). Keys are multiples of 4px. */
export const spacing = {
  0: 0,
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** Large, friendly radii (16 to 28px) plus pill. */
export const radii = {
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 28,
  full: 9999,
} as const;

/** Minimum touch/click target (px). */
export const minTarget = 44;
