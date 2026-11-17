import { cssRgba, hexToRgb } from './contrast';
import { componentTokens } from './components';
import {
  darkBlobs,
  darkGlass,
  glassGeometry,
  glassLevels,
  lightBlobs,
  lightGlass,
  type Blob,
  type GlassGeometry,
  type GlassLevel,
  type GlassThemeMap,
} from './glass';
import { palette, radius, space } from './primitives';
import {
  darkMap,
  lightMap,
  semanticColorNames,
  type ColorRef,
  type SemanticColorName,
  type ThemeMap,
} from './semantic';
import { textStyles } from './typography';

export type ThemeName = string;
export type ThemeMode = 'system' | ThemeName;

/** A theme as authored: semantic map + glass recipe + blobs. Add one more to `themeDefinitions` for a new theme. */
export interface ThemeDefinition {
  /** Which OS appearance this theme sits on (decides `color-scheme` and the system fallback). */
  scheme: 'light' | 'dark';
  colors: ThemeMap;
  glass: GlassThemeMap;
  blobs: Blob[];
}

export const themeDefinitions = {
  light: { scheme: 'light', colors: lightMap, glass: lightGlass, blobs: lightBlobs },
  dark: { scheme: 'dark', colors: darkMap, glass: darkGlass, blobs: darkBlobs },
} as const satisfies Record<string, ThemeDefinition>;

export type BuiltInThemeName = keyof typeof themeDefinitions;

/** Resolve a colour reference to a CSS/RN colour string: `#RRGGBB`, or `rgba(r, g, b, a)` with opacity. */
export function resolveColor(ref: ColorRef): string {
  if (typeof ref === 'string') return palette[ref];
  const [r, g, b] = hexToRgb(palette[ref.color]);
  return `rgba(${r}, ${g}, ${b}, ${ref.alpha})`;
}

export interface ResolvedGlass extends GlassGeometry {
  tint: string;
  border: string;
  highlight: string;
  /** Solid colour used instead of the tint when transparency is reduced. */
  fallback: string;
  /** `rgba(0, 0, 0, a)` shadow colour (empty when there is no shadow). */
  shadowColor: string;
}

export interface ResolvedBlob {
  color: string;
  x: number;
  y: number;
  stop: number;
}

/** What the apps consume. Flat, typed, no primitives. */
export interface Theme {
  name: ThemeName;
  scheme: 'light' | 'dark';
  color: Record<SemanticColorName, string>;
  glass: Record<GlassLevel, ResolvedGlass>;
  blobs: ResolvedBlob[];
}

export function resolveTheme(name: ThemeName, def: ThemeDefinition): Theme {
  const color = Object.fromEntries(
    semanticColorNames.map((k) => [k, resolveColor(def.colors[k])]),
  ) as Record<SemanticColorName, string>;
  const glass = Object.fromEntries(
    glassLevels.map((level) => {
      const g = def.glass[level];
      const geo = glassGeometry[level];
      return [
        level,
        {
          ...geo,
          tint: resolveColor(g.tint),
          border: resolveColor(g.border),
          highlight: resolveColor(g.highlight),
          fallback: color.surface,
          shadowColor: geo.shadow ? cssRgba(palette.black, geo.shadow.alpha) : '',
        },
      ];
    }),
  ) as Record<GlassLevel, ResolvedGlass>;
  return {
    name,
    scheme: def.scheme,
    color,
    glass,
    blobs: def.blobs.map((b) => ({ ...b, color: resolveColor(b.color) })),
  };
}

const registry = new Map<ThemeName, Theme>();
for (const [name, def] of Object.entries(themeDefinitions))
  registry.set(name, resolveTheme(name, def));

/** All registered themes (built-ins plus anything added with `registerTheme`). */
export const themes = Object.fromEntries(registry) as Record<BuiltInThemeName, Theme> &
  Record<string, Theme>;

/** Add or replace a theme at runtime (e.g. a club brand theme loaded from data). No component changes needed. */
export function registerTheme(name: ThemeName, def: ThemeDefinition): Theme {
  const theme = resolveTheme(name, def);
  registry.set(name, theme);
  (themes as Record<string, Theme>)[name] = theme;
  return theme;
}

export function getTheme(name: ThemeName): Theme {
  return registry.get(name) ?? (registry.get('light') as Theme);
}

/** Non-colour tokens shared by every theme. */
export const layoutTokens = { space, radius, text: textStyles, component: componentTokens };
