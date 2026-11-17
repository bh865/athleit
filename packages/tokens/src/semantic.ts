import type { PaletteName } from './primitives';

/**
 * LAYER 2: SEMANTIC TOKENS. What the UI refers to. Components use ONLY these.
 * A theme is a map from every semantic name to a primitive (optionally with alpha).
 */
export const semanticColorNames = [
  'background',
  'surface',
  'surfaceAlt',
  'ink',
  'muted',
  'line',
  'accent',
  'accentPressed',
  'accentInk',
  'bubbleOwn',
  'bubbleOwnInk',
  'bubbleOther',
  'bubbleOtherInk',
  'ok',
  'okSoft',
  'warn',
  'warnSoft',
  'bad',
  'badSoft',
  'focusRing',
  'scrim',
  'avatar1',
  'avatar1Ink',
  'avatar2',
  'avatar2Ink',
  'avatar3',
  'avatar3Ink',
] as const;
export type SemanticColorName = (typeof semanticColorNames)[number];

/** A primitive palette name, optionally with opacity. */
export type ColorRef = PaletteName | { color: PaletteName; alpha: number };
export type ThemeMap = Record<SemanticColorName, ColorRef>;

const avatars = {
  avatar1: 'lime',
  avatar1Ink: 'charcoal',
  avatar2: 'ice',
  avatar2Ink: 'charcoal',
  avatar3: 'gravel',
  avatar3Ink: 'fog',
} as const satisfies Partial<ThemeMap>;

export const lightMap: ThemeMap = {
  background: 'cloud',
  surface: 'white',
  surfaceAlt: 'frost',
  ink: 'charcoal',
  muted: 'slate',
  line: { color: 'charcoal', alpha: 0.08 },
  accent: 'lime',
  accentPressed: 'limePressed',
  accentInk: 'charcoal',
  bubbleOwn: 'charcoal',
  bubbleOwnInk: 'fog',
  bubbleOther: 'frost',
  bubbleOtherInk: 'charcoal',
  ok: 'forest',
  okSoft: { color: 'forest', alpha: 0.08 },
  warn: 'amber',
  warnSoft: { color: 'amber', alpha: 0.08 },
  bad: 'brick',
  badSoft: { color: 'brick', alpha: 0.08 },
  focusRing: 'charcoal',
  scrim: { color: 'charcoal', alpha: 0.48 },
  ...avatars,
};

export const darkMap: ThemeMap = {
  background: 'night',
  surface: 'coal',
  surfaceAlt: 'graphite',
  ink: 'fog',
  muted: 'ash',
  line: { color: 'white', alpha: 0.08 },
  accent: 'lime',
  accentPressed: 'limePressed',
  accentInk: 'charcoal',
  bubbleOwn: 'lime',
  bubbleOwnInk: 'charcoal',
  bubbleOther: 'graphite',
  bubbleOtherInk: 'fog',
  ok: 'mint',
  okSoft: { color: 'mint', alpha: 0.14 },
  warn: 'sand',
  warnSoft: { color: 'sand', alpha: 0.14 },
  bad: 'salmon',
  badSoft: { color: 'salmon', alpha: 0.14 },
  focusRing: 'lime',
  scrim: { color: 'black', alpha: 0.64 },
  ...avatars,
};
