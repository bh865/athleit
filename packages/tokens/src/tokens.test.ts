import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import contract from '../tokens.contract.json';
import { componentTokens } from './components';
import { blend, contrastRatio } from './contrast';
import { contrastPairs } from './contrast-pairs';
import { buildContrastDoc, buildThemeCss } from './css';
import { fontWeight, palette, radius, space } from './primitives';
import { semanticColorNames } from './semantic';
import { getTheme, registerTheme, themeDefinitions, themes, type ThemeDefinition } from './themes';
import { textStyles } from './typography';

describe('contrast helpers', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
  it('blends opacity over a backdrop', () => {
    expect(blend('#FFFFFF', 0.5, '#000000')).toBe('#808080');
  });
});

describe('design-system contract (tokens.contract.json)', () => {
  for (const name of ['light', 'dark'] as const) {
    const expected = contract.themes[name];
    const theme = themes[name]!;

    it(`${name}: semantic colours`, () => {
      expect(theme.color).toEqual(expected.color);
    });
    it(`${name}: every semantic name is covered by the contract`, () => {
      expect(Object.keys(expected.color).sort()).toEqual([...semanticColorNames].sort());
    });
    it(`${name}: glass recipe`, () => {
      for (const level of ['bar', 'sheet', 'modal'] as const) {
        const g = theme.glass[level];
        const e = expected.glass[level];
        expect({
          tint: g.tint,
          border: g.border,
          highlight: g.highlight,
          blur: g.blur,
          saturation: g.saturation,
          shadow: g.shadow,
        }).toEqual(e);
      }
    });
    it(`${name}: backdrop blobs`, () => {
      expect(theme.blobs).toEqual(expected.blobs);
    });
  }

  it('brand colours', () => {
    expect({ charcoal: palette.charcoal, lime: palette.lime, ice: palette.ice }).toEqual(
      contract.brand,
    );
  });
  it('type scale', () => {
    for (const [k, [size, weight, ls]] of Object.entries(contract.type) as [string, number[]][]) {
      const t = textStyles[k as keyof typeof textStyles];
      expect([t.size, fontWeight[t.weight], t.letterSpacing]).toEqual([size, weight, ls]);
    }
    expect(textStyles.label.uppercase).toBe(true);
    expect(textStyles.mono.family).toBe('mono');
  });
  it('spacing, radii', () => {
    expect(Object.values(space).filter((v) => v > 0)).toEqual(contract.space);
    const { pill, ...steps } = radius;
    expect(Object.values(steps)).toEqual(contract.radius);
    expect(pill).toBe(contract.pill);
  });
  it('component sizes', () => {
    const c = contract.components;
    expect(componentTokens.input.height).toBe(c.input.height);
    expect(componentTokens.input.radius).toBe(c.input.radius);
    expect(componentTokens.button.height).toBe(c.button.height);
    expect(componentTokens.tabBar.height).toBe(c.tabBar.height);
    expect(componentTokens.tabBar.radius).toBe(c.tabBar.radius);
    expect(componentTokens.sidebar.width).toBe(c.sidebar.width);
    expect(componentTokens.sidebar.radius).toBe(c.sidebar.radius);
    expect(componentTokens.listRow.height).toBe(c.listRow.height);
    expect(componentTokens.statusDot.size).toBe(c.statusDot);
    expect(componentTokens.emptyState.iconCircle).toBe(c.emptyIconCircle);
  });
});

describe('WCAG AA contrast pairs', () => {
  const pairs = contrastPairs();
  it('covers every theme', () => {
    expect(new Set(pairs.map((p) => p.theme))).toEqual(new Set(Object.keys(themeDefinitions)));
  });
  it.each(pairs.map((p) => [`${p.theme}: ${p.label}`, p] as const))('%s', (_name, p) => {
    expect(contrastRatio(p.fg, p.bg)).toBeGreaterThanOrEqual(p.min);
  });
});

describe('design rules', () => {
  it('gets more opaque from bar to sheet to modal', () => {
    for (const name of ['light', 'dark'] as const) {
      const a = (s: string) => Number(/, ([\d.]+)\)$/.exec(s)![1]);
      const g = themes[name]!.glass;
      expect(a(g.bar.tint)).toBeLessThan(a(g.sheet.tint));
      expect(a(g.sheet.tint)).toBeLessThan(a(g.modal.tint));
    }
  });
  it('glass is never used as a content fallback: fallback equals surface', () => {
    expect(themes.light!.glass.bar.fallback).toBe(themes.light!.color.surface);
  });
});

describe('theme registry', () => {
  it('accepts a third theme with no other changes', () => {
    const def: ThemeDefinition = {
      ...themeDefinitions.light,
      colors: { ...themeDefinitions.light.colors, accent: 'powder' },
    };
    registerTheme('club-test', def);
    expect(getTheme('club-test').color.accent).toBe(palette.powder);
    expect(Object.keys(getTheme('club-test').color)).toEqual(Object.keys(themes.light!.color));
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
  });
});
