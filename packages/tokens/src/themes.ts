import { darkColors, lightColors, type ThemeColors } from './colors';
import { glassThemes, type GlassLevel, type GlassTheme } from './glass';

export type ThemeName = 'light' | 'dark';
export type ThemeMode = ThemeName | 'system';

export interface Theme {
  name: ThemeName;
  color: ThemeColors;
  glass: Record<GlassLevel, GlassTheme>;
}

export const themes: Record<ThemeName, Theme> = {
  light: { name: 'light', color: lightColors, glass: glassThemes.light },
  dark: { name: 'dark', color: darkColors, glass: glassThemes.dark },
};
