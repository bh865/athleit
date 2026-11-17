import { brand } from './colors';

export type GlassLevel = 'bar' | 'sheet' | 'modal';

/** Theme-independent material geometry. */
export const glassMaterials = {
  bar: { blur: 20, saturation: 1.6 },
  sheet: { blur: 32, saturation: 1.6 },
  modal: { blur: 48, saturation: 1.6 },
} as const satisfies Record<GlassLevel, { blur: number; saturation: number }>;

export interface RgbaSpec {
  color: string; // #RRGGBB
  opacity: number; // 0..1
}

export interface GlassTheme {
  /** Translucent tint laid over the blurred backdrop. */
  tint: RgbaSpec;
  /** 1px inner highlight on the edge of the glass. */
  borderHighlight: RgbaSpec;
}

/**
 * Per-theme glass specs. When "reduce transparency" is on (OS setting or low-end
 * fallback) every level renders as the solid `surface` colour with no blur.
 */
export const glassThemes: Record<'light' | 'dark', Record<GlassLevel, GlassTheme>> = {
  light: {
    bar: {
      tint: { color: '#FFFFFF', opacity: 0.72 },
      borderHighlight: { color: '#FFFFFF', opacity: 0.7 },
    },
    sheet: {
      tint: { color: '#FFFFFF', opacity: 0.82 },
      borderHighlight: { color: '#FFFFFF', opacity: 0.8 },
    },
    modal: {
      tint: { color: '#FFFFFF', opacity: 0.9 },
      borderHighlight: { color: '#FFFFFF', opacity: 0.9 },
    },
  },
  dark: {
    bar: {
      tint: { color: '#1B1E1F', opacity: 0.72 },
      borderHighlight: { color: '#FFFFFF', opacity: 0.14 },
    },
    sheet: {
      tint: { color: brand.charcoal, opacity: 0.8 },
      borderHighlight: { color: '#FFFFFF', opacity: 0.16 },
    },
    modal: {
      tint: { color: brand.charcoal, opacity: 0.88 },
      borderHighlight: { color: '#FFFFFF', opacity: 0.18 },
    },
  },
};
