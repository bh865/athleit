import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { blend, contrastPairs, contrastRatio, glassThemes, radii } from './index';
import { buildContrastDoc, buildThemeCss } from './css';

describe('contrast helpers', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('blends opacity over a backdrop', () => {
    expect(blend('#FFFFFF', 0.5, '#000000')).toBe('#808080');
  });
});

describe('WCAG AA contrast pairs', () => {
  const pairs = contrastPairs();

  it('covers both themes', () => {
    expect(new Set(pairs.map((p) => p.theme))).toEqual(new Set(['light', 'dark']));
  });

  it.each(pairs.map((p) => [`${p.theme}: ${p.label}`, p] as const))('%s', (_name, p) => {
    expect(contrastRatio(p.fg, p.bg)).toBeGreaterThanOrEqual(p.min);
  });
});

describe('design rules', () => {
  it('keeps radii within the 16 to 28px range (plus pill)', () => {
    const sizes = Object.entries(radii)
      .filter(([k]) => k !== 'full')
      .map(([, v]) => v);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(28);
  });

  it('gets more opaque from bar to sheet to modal', () => {
    for (const theme of ['light', 'dark'] as const) {
      const g = glassThemes[theme];
      expect(g.bar.tint.opacity).toBeLessThan(g.sheet.tint.opacity);
      expect(g.sheet.tint.opacity).toBeLessThan(g.modal.tint.opacity);
    }
  });
});

describe('generated files are up to date (run `pnpm --filter @athleit/tokens build:css`)', () => {
  const read = (name: string) =>
    readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');

  it('theme.css', () => expect(read('theme.css')).toBe(buildThemeCss()));
  it('CONTRAST.md', () => expect(read('CONTRAST.md')).toBe(buildContrastDoc()));

  it('defines reduced-transparency fallbacks', () => {
    const css = buildThemeCss();
    expect(css).toContain('prefers-reduced-transparency: reduce');
    expect(css).toContain(':root:root[data-reduce-transparency="true"]');
    expect(css).toMatch(/prefers-reduced-transparency: reduce\) \{\n {2}:root:root \{/);
  });
});
