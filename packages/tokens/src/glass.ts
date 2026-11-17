import type { ColorRef } from './semantic';

export type GlassLevel = 'bar' | 'sheet' | 'modal';
export const glassLevels: readonly GlassLevel[] = ['bar', 'sheet', 'modal'];

/** Theme-independent geometry of each material. */
export interface GlassGeometry {
  /** px */
  blur: number;
  /** 1 = 100% */
  saturation: number;
  /** Drop shadow below the layer; null = none. */
  shadow: { y: number; blur: number; alpha: number } | null;
}

export const glassGeometry: Record<GlassLevel, GlassGeometry> = {
  bar: { blur: 24, saturation: 1.8, shadow: null },
  sheet: { blur: 40, saturation: 1.8, shadow: { y: 12, blur: 40, alpha: 0.08 } },
  modal: { blur: 60, saturation: 1.8, shadow: { y: 20, blur: 60, alpha: 0.14 } },
};

/** Per-theme colours of each level. */
export interface GlassColors {
  tint: ColorRef;
  /** 1px outer border. */
  border: ColorRef;
  /** Inner top highlight. */
  highlight: ColorRef;
}
export type GlassThemeMap = Record<GlassLevel, GlassColors>;

export const lightGlass: GlassThemeMap = {
  bar: {
    tint: { color: 'white', alpha: 0.55 },
    border: { color: 'white', alpha: 0.9 },
    highlight: { color: 'white', alpha: 0.95 },
  },
  sheet: {
    tint: { color: 'white', alpha: 0.74 },
    border: { color: 'white', alpha: 0.9 },
    highlight: { color: 'white', alpha: 0.95 },
  },
  modal: {
    tint: { color: 'white', alpha: 0.84 },
    border: { color: 'white', alpha: 0.9 },
    highlight: { color: 'white', alpha: 0.95 },
  },
};

export const darkGlass: GlassThemeMap = {
  bar: {
    tint: { color: 'steel', alpha: 0.55 },
    border: { color: 'white', alpha: 0.14 },
    highlight: { color: 'white', alpha: 0.16 },
  },
  sheet: {
    tint: { color: 'basalt', alpha: 0.72 },
    border: { color: 'white', alpha: 0.14 },
    highlight: { color: 'white', alpha: 0.16 },
  },
  modal: {
    tint: { color: 'obsidian', alpha: 0.84 },
    border: { color: 'white', alpha: 0.14 },
    highlight: { color: 'white', alpha: 0.16 },
  },
};

/** Soft radial blobs painted over the background colour so glass has something to refract. */
export interface Blob {
  color: ColorRef;
  /** Centre, percent of the viewport. */
  x: number;
  y: number;
  /** Fade-out radius, percent. */
  stop: number;
}
export const lightBlobs: Blob[] = [
  { color: { color: 'lime', alpha: 0.42 }, x: 15, y: 20, stop: 40 },
  { color: 'powder', x: 80, y: 80, stop: 50 },
  { color: 'powder', x: 50, y: 10, stop: 40 },
];
export const darkBlobs: Blob[] = [
  { color: { color: 'lime', alpha: 0.13 }, x: 15, y: 20, stop: 40 },
  { color: { color: 'steelBlue', alpha: 0.22 }, x: 80, y: 80, stop: 50 },
  { color: { color: 'steelBlue', alpha: 0.22 }, x: 50, y: 10, stop: 40 },
];
