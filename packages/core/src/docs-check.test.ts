import { describe, expect, it } from 'vitest';

import {
  annotations,
  docsMode,
  exitCode,
  findMismatches,
  globToRegExp,
  matchesCover,
  parseDocsAck,
  summaryMarkdown,
  type Report,
} from './docs-check';

const A = (slug: string, covers: string[]) => ({
  slug,
  file: `apps/web/content/help/x/${slug}.mdx`,
  covers,
});

describe('matchesCover', () => {
  it('matches a file, a folder and a glob', () => {
    expect(
      matchesCover('packages/core/src/capabilities.ts', 'packages/core/src/capabilities.ts'),
    ).toBe(true);
    expect(
      matchesCover(
        'supabase/functions/delete-account',
        'supabase/functions/delete-account/index.ts',
      ),
    ).toBe(true);
    expect(
      matchesCover(
        'supabase/functions/delete-account/',
        'supabase/functions/delete-account/index.ts',
      ),
    ).toBe(true);
    expect(
      matchesCover(
        'apps/web/src/components/payments/**',
        'apps/web/src/components/payments/a/b.tsx',
      ),
    ).toBe(true);
    expect(
      matchesCover('apps/web/src/app/(app)/pay/**', 'apps/web/src/app/(app)/pay/page.tsx'),
    ).toBe(true);
  });
  it('does not match siblings or partial names', () => {
    expect(
      matchesCover(
        'supabase/functions/delete-account',
        'supabase/functions/delete-account-2/index.ts',
      ),
    ).toBe(false);
    expect(matchesCover('apps/web/src/*.ts', 'apps/web/src/a/b.ts')).toBe(false);
    expect(matchesCover('docs/billing.md', 'docs/billing.md.bak')).toBe(false);
  });
  it('treats ** with a slash as zero or more folders', () => {
    expect(globToRegExp('a/**/b.ts').test('a/b.ts')).toBe(true);
    expect(globToRegExp('a/**/b.ts').test('a/x/y/b.ts')).toBe(true);
  });
});

describe('findMismatches', () => {
  const arts = [
    A('pay', ['apps/web/src/components/payments/**']),
    A('join', ['apps/web/src/app/(app)/join/**']),
  ];
  it('flags an article whose covered code changed without it', () => {
    expect(findMismatches(arts, ['apps/web/src/components/payments/checkout.tsx'])).toEqual([
      {
        slug: 'pay',
        file: arts[0]!.file,
        changed: ['apps/web/src/components/payments/checkout.tsx'],
      },
    ]);
  });
  it('is quiet when the article changed in the same PR, or nothing covered changed', () => {
    expect(
      findMismatches(arts, ['apps/web/src/components/payments/checkout.tsx', arts[0]!.file]),
    ).toEqual([]);
    expect(findMismatches(arts, ['README.md'])).toEqual([]);
  });
  it('ignores edits to other articles when they are covered', () => {
    expect(
      findMismatches([A('x', ['apps/web/content/help/**'])], ['apps/web/content/help/a/b.mdx']),
    ).toEqual([]);
  });
});

describe('parseDocsAck', () => {
  it('reads the acknowledgement line', () => {
    expect(parseDocsAck('Fix.\n\nDocs: none needed, because only a refactor\n')).toEqual({
      acked: true,
      reason: 'only a refactor',
    });
    expect(parseDocsAck('docs: none needed because internal rename').acked).toBe(true);
  });
  it('needs a real reason', () => {
    expect(parseDocsAck('Docs: none needed, because').acked).toBe(false);
    expect(parseDocsAck(null).acked).toBe(false);
  });
});

describe('modes and output', () => {
  const base: Report = {
    errors: [],
    mismatches: [{ slug: 'pay', file: 'f.mdx', changed: ['a.ts'] }],
    acked: false,
    ackReason: null,
    mode: 'warn',
  };
  it('warn never fails on mismatches; block fails unless acknowledged; errors always fail', () => {
    expect(exitCode(base)).toBe(0);
    expect(exitCode({ ...base, mode: 'block' })).toBe(1);
    expect(exitCode({ ...base, mode: 'block', acked: true })).toBe(0);
    expect(exitCode({ ...base, errors: [{ file: 'f', message: 'bad' }] })).toBe(1);
  });
  it('defaults to warn', () => {
    expect(docsMode(undefined)).toBe('warn');
    expect(docsMode('block')).toBe('block');
    expect(docsMode('nonsense')).toBe('warn');
  });
  it('emits annotations and a marked summary', () => {
    expect(annotations(base)[0]).toMatch(/^::warning file=f\.mdx::/);
    expect(annotations({ ...base, mode: 'block' })[0]).toMatch(/^::error /);
    expect(summaryMarkdown(base)).toContain('<!-- docs-check -->');
    expect(summaryMarkdown(base, { draftingAvailable: false })).toContain('ANTHROPIC_API_KEY');
  });
});
