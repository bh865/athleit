import fs from 'node:fs';
import matter from 'gray-matter';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  articleFrontmatter,
  BILLING_OFF_TEXT,
  HELP_CATEGORIES,
  lintArticleBody,
  resolveLive,
  whoCanDo,
  type HelpValues,
} from './help';

const V: HelpValues = {
  billing_enabled: true,
  price_cents: 1000,
  trial_days: 14,
  grace_days: 21,
  first_reply_target_hours: 24,
  reopen_days: 14,
  max_attachments: 3,
  max_attachment_mb: 10,
  public_tickets_enabled: false,
  contact_email: null,
  fee: { flat_cents: 50, bps: 100 },
};

describe('resolveLive', () => {
  it('formats billing values from settings', () => {
    expect(resolveLive('price', V)?.text).toBe('$10.00 a month');
    expect(resolveLive('trial_days', V)?.text).toBe('14 days');
    expect(resolveLive('trial_days', { ...V, trial_days: 1 })?.text).toBe('1 day');
  });
  it('shows the not-yet-charging variant while billing is off', () => {
    const r = resolveLive('price', { ...V, billing_enabled: false });
    expect(r).toEqual({ text: BILLING_OFF_TEXT, billingOff: true });
    expect(resolveLive('max_attachments', { ...V, billing_enabled: false })?.billingOff).toBe(
      false,
    );
  });
  it('computes a fee example from the active fee config and is null without values', () => {
    expect(resolveLive('fee_example', V)?.text).toBe('$1.50 on a $100.00 payment');
    expect(resolveLive('fee_example', { ...V, fee: null })).toBeNull();
    expect(resolveLive('price', null)).toBeNull();
  });
});

describe('whoCanDo', () => {
  it('is generated from capabilities', () => {
    const t = Object.fromEntries(whoCanDo('billing.manage').map((r) => [r.label, r.allowed]));
    expect(t['Team admin']).toBe(true);
    expect(t['Coach']).toBe(false);
    expect(t['Parent or guardian']).toBe(false);
  });
});

describe('lintArticleBody', () => {
  it('flags literal prices and trial lengths', () => {
    const p = lintArticleBody('It costs $10 a month.\n\nA 14-day free trial.');
    expect(p.map((x) => x.rule)).toEqual(['no-literal-money', 'no-literal-trial']);
    expect(p[0]!.line).toBe(1);
  });
  it('flags unknown tokens, capabilities and missing alt text', () => {
    const p = lintArticleBody(
      '<Live value="nope" />\n<WhoCanDo capability="x.y" />\n<Screenshot src="a.png" />\n![](a.png)',
    );
    expect(p.map((x) => x.rule)).toEqual([
      'known-live-key',
      'known-capability',
      'image-alt',
      'image-alt',
    ]);
  });
  it('accepts known tokens and ignores code blocks', () => {
    expect(
      lintArticleBody(
        '<Live value="price" />\n<WhoCanDo capability="billing.manage" />\n```\n$10\n```',
      ),
    ).toEqual([]);
  });
});

describe('seed articles', () => {
  const root = path.resolve(__dirname, '../../../apps/web/content/help');
  const files = fs
    .readdirSync(root, { withFileTypes: true })
    .flatMap((d) =>
      d.isDirectory()
        ? fs.readdirSync(path.join(root, d.name)).map((f) => path.join(root, d.name, f))
        : [],
    );
  it('has the 14 launch articles', () =>
    expect(files.filter((f) => f.endsWith('.mdx'))).toHaveLength(14));
  for (const f of files) {
    it(`${path.basename(f)} has valid frontmatter and passes the lint`, () => {
      const m = matter(fs.readFileSync(f, 'utf8'));
      const d = m.data as Record<string, unknown>;
      const parsed = articleFrontmatter.safeParse({
        ...d,
        verified_at:
          d.verified_at instanceof Date ? d.verified_at.toISOString().slice(0, 10) : d.verified_at,
        verified_commit: String(d.verified_commit),
      });
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
      expect(path.basename(f, '.mdx')).toBe(d.slug);
      expect(path.basename(path.dirname(f))).toBe(d.category);
      expect(HELP_CATEGORIES.map((c) => c.slug)).toContain(d.category);
      expect(lintArticleBody(m.content)).toEqual([]);
    });
  }
});
