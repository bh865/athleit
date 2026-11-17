/**
 * LAYER 1: PRIMITIVES. The raw palette, type families and scale steps.
 * Names say what a thing IS (a colour, a size), never where it is used.
 * Components must not import this file; they use semantic tokens (see semantic.ts).
 */

/** Raw colours (#RRGGBB). Brand: charcoal, lime, ice. */
export const palette = {
  charcoal: '#272A2B',
  lime: '#CCFF33',
  limePressed: '#B7E62E',
  ice: '#E1EFF6',
  white: '#FFFFFF',
  black: '#000000',
  cloud: '#F3F8FB',
  frost: '#EAF3F8',
  fog: '#F3F7F9',
  slate: '#586266',
  night: '#17191A',
  coal: '#242728',
  graphite: '#2F3334',
  gravel: '#3A3F41',
  ash: '#A9B3B8',
  forest: '#1F7A3E',
  mint: '#8FE3A8',
  amber: '#9A6200',
  sand: '#FFD27A',
  brick: '#B3261E',
  salmon: '#FF9A8A',
  powder: '#CFE5F1',
  steelBlue: '#6EA0BE',
  steel: '#2C3032',
  basalt: '#282C2E',
  obsidian: '#24282A',
} as const;
export type PaletteName = keyof typeof palette;

/** 4px-based spacing steps (px). Keys are multiples of 4px. */
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48 } as const;
export type SpaceStep = keyof typeof space;

/** Radius steps (px) plus pill. */
export const radius = { xs: 12, sm: 16, md: 20, lg: 24, xl: 28, pill: 9999 } as const;
export type RadiusStep = keyof typeof radius;

export const fontFamily = {
  sans: 'Manrope',
  mono: 'IBM Plex Mono',
  sansFallback: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  monoFallback: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const;

/** Weights the app loads. React Native selects weight by family name, so keep this list in sync with the font loaders. */
export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;
export type FontWeightName = keyof typeof fontWeight;

/** Icon sizes (px). */
export const iconSize = { sm: 20, md: 22, lg: 24, xl: 30 } as const;
export type IconSize = keyof typeof iconSize;
