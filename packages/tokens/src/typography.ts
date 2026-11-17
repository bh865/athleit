/**
 * Manrope for UI text; IBM Plex Mono for amounts, codes and IDs.
 * The `fallback` stacks are for web CSS; React Native loads the fonts by exact family name.
 */
export const fontFamily = {
  sans: 'Manrope',
  mono: 'IBM Plex Mono',
  sansFallback: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  monoFallback: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

/** px values: [fontSize, lineHeight]. */
export const fontSize = {
  xs: [12, 16],
  sm: [14, 20],
  base: [16, 24],
  lg: [18, 28],
  xl: [20, 28],
  '2xl': [24, 32],
  '3xl': [30, 36],
  '4xl': [36, 40],
} as const satisfies Record<string, readonly [number, number]>;

export type FontSizeToken = keyof typeof fontSize;
