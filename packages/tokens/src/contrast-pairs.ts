import { blend } from './contrast';
import type { StatusColor } from './colors';
import { themes, type ThemeName } from './themes';

export interface ContrastPair {
  theme: ThemeName;
  label: string;
  fg: string;
  bg: string;
  /** 4.5 for text (WCAG 1.4.3 AA), 3 for UI components and indicators (WCAG 1.4.11). */
  min: 3 | 4.5;
}

const status = ['success', 'warning', 'danger'] as const;

/** Every foreground/background pair the design system promises meets WCAG AA. */
export function contrastPairs(): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  for (const name of ['light', 'dark'] as const) {
    const { color: c, glass } = themes[name];
    const add = (label: string, fg: string, bg: string, min: 3 | 4.5 = 4.5) =>
      pairs.push({ theme: name, label, fg, bg, min });

    for (const [bgName, bg] of [
      ['bg', c.bg],
      ['surface', c.surface],
      ['surfaceMuted', c.surfaceMuted],
    ] as const) {
      add(`text on ${bgName}`, c.text, bg);
      add(`textMuted on ${bgName}`, c.textMuted, bg);
    }
    add('onAccent on accent', c.onAccent, c.accent);
    add('onAccent on accentPressed', c.onAccent, c.accentPressed);
    add('accentInk on bg', c.accentInk, c.bg);
    add('accentInk on surface', c.accentInk, c.surface);

    for (const s of status) {
      const sc: StatusColor = c[s];
      add(`${s}.text on bg`, sc.text, c.bg);
      add(`${s}.text on surface`, sc.text, c.surface);
      add(`${s}.text on ${s}.bg`, sc.text, sc.bg);
      add(`${s}.onSolid on ${s}.solid`, sc.onSolid, sc.solid);
    }

    // Non-text contrast (3:1).
    add('borderStrong on bg', c.borderStrong, c.bg, 3);
    add('borderStrong on surface', c.borderStrong, c.surface, 3);
    add('focusRing on bg', c.focusRing, c.bg, 3);
    add('focusRing on surface', c.focusRing, c.surface, 3);
    add('accentInk indicator on bg', c.accentInk, c.bg, 3);
    if (name === 'dark') add('accent fill on bg', c.accent, c.bg, 3);

    // Primary text on glass, worst case: tint composited over the most adverse
    // backdrop (pure white behind dark glass, pure black behind light glass).
    const worstBackdrop = name === 'dark' ? '#FFFFFF' : '#000000';
    for (const level of ['bar', 'sheet', 'modal'] as const) {
      const g = glass[level].tint;
      add(
        `text on ${level} glass (worst-case backdrop)`,
        c.text,
        blend(g.color, g.opacity, worstBackdrop),
      );
    }
  }
  return pairs;
}
