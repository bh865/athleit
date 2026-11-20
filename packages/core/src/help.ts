/**
 * Help center rules that are pure data and logic: categories, the article frontmatter schema, the live value tokens and
 * the article lint. No React and no I/O, so the web app, the docs scripts (`docs:index`, `docs:check`) and tests share
 * one definition. Articles live in apps/web/content/help; see docs/help-content.md.
 */
import { z } from 'zod';

import { can, type Capability } from './capabilities';
import { formatCents } from './money';

export const HELP_CATEGORIES = [
  {
    slug: 'getting-started',
    title: 'Getting started',
    description: 'Join a team and find your way around.',
  },
  {
    slug: 'teams-and-rosters',
    title: 'Teams and rosters',
    description: 'Players, families, staff and invites.',
  },
  {
    slug: 'schedule-and-rsvps',
    title: 'Schedule and RSVPs',
    description: 'Practices, games and who is coming.',
  },
  {
    slug: 'messages-and-safety',
    title: 'Messages and safety',
    description: 'Talk with your team and report a problem.',
  },
  {
    slug: 'payments-and-receipts',
    title: 'Payments and receipts',
    description: 'Pay a request, installments, fees and refunds.',
  },
  {
    slug: 'registration-and-waivers',
    title: 'Registration and waivers',
    description: 'Sign up for a season and sign forms.',
  },
  {
    slug: 'team-subscription',
    title: 'Team subscription',
    description: 'The free trial, your card and cancelling.',
  },
  {
    slug: 'account-and-notifications',
    title: 'Account and notifications',
    description: 'Your settings and your data.',
  },
  { slug: 'clubs', title: 'Clubs', description: 'Link teams to a club.' },
] as const;
export type HelpCategorySlug = (typeof HELP_CATEGORIES)[number]['slug'];
export const helpCategory = (slug: string) => HELP_CATEGORIES.find((c) => c.slug === slug);

export const HELP_AUDIENCES = ['parent', 'player', 'coach', 'team-admin', 'club-admin'] as const;
export type HelpAudience = (typeof HELP_AUDIENCES)[number];
export const AUDIENCE_LABEL: Record<HelpAudience, string> = {
  parent: 'Parent',
  player: 'Player',
  coach: 'Coach',
  'team-admin': 'Team admin',
  'club-admin': 'Club admin',
};
export const HELP_PLATFORMS = ['web', 'ios', 'android'] as const;

export const articleFrontmatter = z.object({
  title: z.string().min(3).max(90),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(80),
  category: z.enum(HELP_CATEGORIES.map((c) => c.slug) as [HelpCategorySlug, ...HelpCategorySlug[]]),
  audience: z.array(z.enum(HELP_AUDIENCES)).min(1),
  platforms: z.array(z.enum(HELP_PLATFORMS)).optional(),
  summary: z.string().min(10).max(160),
  order: z.number().int().min(0).max(999).default(100),
  /** Repo paths or globs the article describes. docs:check flags the article when one of them changes. */
  covers: z.array(z.string().min(1)).min(1),
  verified_commit: z.string().regex(/^[0-9a-f]{7,40}$/),
  verified_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  related: z.array(z.string()).default([]),
});
export type ArticleFrontmatter = z.infer<typeof articleFrontmatter>;

// Live values -------------------------------------------------------------------------------------------------
/** Public, non-secret values returned by get_public_help_values(). Prices and trial lengths are never typed in an article. */
export interface HelpValues {
  billing_enabled: boolean;
  price_cents: number;
  trial_days: number;
  grace_days: number;
  first_reply_target_hours: number;
  reopen_days: number;
  max_attachments: number;
  max_attachment_mb: number;
  public_tickets_enabled: boolean;
  contact_email: string | null;
  fee: { flat_cents: number; bps: number } | null;
}
export const LIVE_KEYS = [
  'price',
  'trial_days',
  'grace_days',
  'fee_example',
  'first_reply_target_hours',
  'reopen_days',
  'max_attachments',
  'max_attachment_mb',
] as const;
export type LiveKey = (typeof LIVE_KEYS)[number];
export const isLiveKey = (k: string): k is LiveKey => (LIVE_KEYS as readonly string[]).includes(k);

/** Wording while team billing is switched off. Placeholder: confirm with the business before launch. */
export const BILLING_OFF_TEXT =
  'Team billing is not switched on yet, so teams are not being charged.';
const BILLING_KEYS: readonly LiveKey[] = ['price', 'trial_days', 'grace_days'];

export interface LiveResult {
  text: string;
  /** True when the value is a billing figure and billing is off: render the not-yet-charging variant. */
  billingOff: boolean;
}

/** The text for one live token, or null when the value is unavailable (render a neutral dash, never a guess). */
export function resolveLive(
  key: LiveKey,
  v: HelpValues | null,
  opts: { amount?: number } = {},
): LiveResult | null {
  if (!v) return null;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (BILLING_KEYS.includes(key) && !v.billing_enabled)
    return { text: BILLING_OFF_TEXT, billingOff: true };
  switch (key) {
    case 'price':
      return { text: `${formatCents(v.price_cents)} a month`, billingOff: false };
    case 'trial_days':
      return { text: plural(v.trial_days, 'day'), billingOff: false };
    case 'grace_days':
      return { text: plural(v.grace_days, 'day'), billingOff: false };
    case 'fee_example': {
      if (!v.fee) return null;
      const amount = opts.amount ?? 10000;
      const fee = v.fee.flat_cents + Math.floor((amount * v.fee.bps) / 10000);
      return { text: `${formatCents(fee)} on a ${formatCents(amount)} payment`, billingOff: false };
    }
    case 'first_reply_target_hours':
      return { text: plural(v.first_reply_target_hours, 'hour'), billingOff: false };
    case 'reopen_days':
      return { text: plural(v.reopen_days, 'day'), billingOff: false };
    case 'max_attachments':
      return { text: String(v.max_attachments), billingOff: false };
    case 'max_attachment_mb':
      return { text: `${v.max_attachment_mb} MB`, billingOff: false };
  }
}

// Role table ------------------------------------------------------------------------------------------------------
export const WHO_CAN_DO_ROLES = [
  { label: 'Parent or guardian', kind: 'team', role: 'parent' },
  { label: 'Player', kind: 'team', role: 'player' },
  { label: 'Coach', kind: 'team', role: 'coach' },
  { label: 'Team manager', kind: 'team', role: 'manager' },
  { label: 'Team admin', kind: 'team', role: 'admin' },
  { label: 'Club admin', kind: 'club', role: 'admin' },
] as const;

/** Generated from capabilities.ts, never typed by hand. */
export function whoCanDo(capability: Capability): { label: string; allowed: boolean }[] {
  return WHO_CAN_DO_ROLES.map((r) => ({
    label: r.label,
    allowed: can({ kind: r.kind, role: r.role } as never, capability),
  }));
}
/** Capabilities an article may reference in <WhoCanDo capability="...">. Checked by lintArticle. */
export const KNOWN_CAPABILITIES: readonly string[] = [
  'team.rotateCode',
  'invites.createStaff',
  'invites.createFamily',
  'joinRequests.decide',
  'family.manage',
  'schedule.manage',
  'schedule.rsvpOwn',
  'payments.pay',
  'payments.manage',
  'payments.refund',
  'payments.setup',
  'registration.register',
  'registration.manage',
  'billing.manage',
  'billing.view',
  'club.decideLink',
  'team.requestClubLink',
  'members.manage',
];

// Lint ---------------------------------------------------------------------------------------------------------------------
export interface LintProblem {
  rule: string;
  message: string;
  line: number;
}

const TAG_RE = /<(Live|WhoCanDo|Screenshot)\b([^>]*?)\/?>/g;
const attr = (s: string, name: string) =>
  new RegExp(`${name}=(?:"([^"]*)"|'([^']*)'|\\{["']([^"']*)["']\\})`)
    .exec(s)
    ?.slice(1)
    .find(Boolean) ?? null;

/**
 * Rules over an article body (not the frontmatter): no literal prices or trial lengths, known tokens and capabilities,
 * images with alt text. Returns problems with 1-based line numbers within the body.
 */
export function lintArticleBody(body: string): LintProblem[] {
  const out: LintProblem[] = [];
  const lineOf = (i: number) => body.slice(0, i).split('\n').length;
  const stripped = body.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '));
  for (const m of stripped.matchAll(/\$\s?\d[\d,.]*/g))
    out.push({
      rule: 'no-literal-money',
      message: `Literal amount "${m[0]}": use <Live value="..." />.`,
      line: lineOf(m.index ?? 0),
    });
  for (const m of stripped.matchAll(/\b\d+[- ]day\s+(free\s+)?(trial|grace)/gi))
    out.push({
      rule: 'no-literal-trial',
      message: `Literal length "${m[0]}": use <Live value="trial_days" />.`,
      line: lineOf(m.index ?? 0),
    });
  for (const m of stripped.matchAll(TAG_RE)) {
    const [, tag, attrs] = m;
    const line = lineOf(m.index ?? 0);
    if (tag === 'Live') {
      const v = attr(attrs ?? '', 'value');
      if (!v || !isLiveKey(v))
        out.push({ rule: 'known-live-key', message: `Unknown <Live value="${v ?? ''}">.`, line });
    } else if (tag === 'WhoCanDo') {
      const c = attr(attrs ?? '', 'capability');
      if (!c || !KNOWN_CAPABILITIES.includes(c))
        out.push({
          rule: 'known-capability',
          message: `Unknown <WhoCanDo capability="${c ?? ''}">.`,
          line,
        });
    } else if (tag === 'Screenshot') {
      if (!attr(attrs ?? '', 'alt'))
        out.push({ rule: 'image-alt', message: '<Screenshot> needs alt text.', line });
    }
  }
  for (const m of stripped.matchAll(/!\[\]\(/g))
    out.push({ rule: 'image-alt', message: 'Image needs alt text.', line: lineOf(m.index ?? 0) });
  return out;
}
