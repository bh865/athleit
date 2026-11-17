import { blend } from './contrast';
import { themeDefinitions, resolveTheme } from './themes';

export interface ContrastPair {
  theme: string;
  label: string;
  fg: string;
  bg: string;
  /** 4.5 for text (WCAG 1.4.3 AA), 3 for UI components and indicators (WCAG 1.4.11). */
  min: 3 | 4.5;
}

/** `#RRGGBB` or `rgba(r, g, b, a)` composited over an opaque hex. */
function over(color: string, backdrop: string): string {
  const m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(color);
  if (!m) return color;
  const hex = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
  return blend(hex, Number(m[4]), backdrop);
}

/** Every foreground/background pair the design system promises meets WCAG AA. */
export function contrastPairs(): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  for (const [name, def] of Object.entries(themeDefinitions)) {
    const t = resolveTheme(name, def);
    const c = t.color;
    const add = (label: string, fg: string, bg: string, min: 3 | 4.5 = 4.5) =>
      pairs.push({ theme: name, label, fg, bg, min });

    for (const bgName of ['background', 'surface', 'surfaceAlt'] as const) {
      add(`ink on ${bgName}`, c.ink, c[bgName]);
      add(`muted on ${bgName}`, c.muted, c[bgName]);
    }
    add('accentInk on accent', c.accentInk, c.accent);
    add('accentInk on accentPressed', c.accentInk, c.accentPressed);
    add('bubbleOwnInk on bubbleOwn', c.bubbleOwnInk, c.bubbleOwn);
    add('bubbleOtherInk on bubbleOther', c.bubbleOtherInk, c.bubbleOther);
    for (const i of ['1', '2', '3'] as const)
      add(`avatar${i}Ink on avatar${i}`, c[`avatar${i}Ink`], c[`avatar${i}`]);

    for (const s of ['ok', 'warn', 'bad'] as const) {
      add(`${s} on background`, c[s], c.background);
      add(`${s} on surface`, c[s], c.surface);
      add(`${s} on ${s}Soft (over surface)`, c[s], over(c[`${s}Soft`], c.surface));
    }

    // Non-text contrast (3:1).
    add('focusRing on background', c.focusRing, c.background, 3);
    add('focusRing on surface', c.focusRing, c.surface, 3);
    add('bubbleOwn fill on background', c.bubbleOwn, c.background, 3);

    // Primary text on glass over the app backdrop: the background colour plus each blob at full strength.
    const backdrops: [string, string][] = [['background', c.background]];
    t.blobs.forEach((b, i) => backdrops.push([`blob ${i + 1}`, over(b.color, c.background)]));
    for (const level of ['bar', 'sheet', 'modal'] as const) {
      for (const [bn, bd] of backdrops) {
        add(`ink on ${level} glass over ${bn}`, c.ink, over(t.glass[level].tint, bd));
      }
    }
  }
  return pairs;
}
