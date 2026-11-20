// Support rules that are pure logic: limits, validation, hold-for-review heuristics, upload sniffing, search-miss filter.
// No I/O so Edge Functions and unit tests share one definition. Every threshold lives in this file.

export const LIMITS = {
  subject: 120,
  body: 5000,
  /** Hard ceiling; the live value is the `support.max_attachment_mb` setting (never above the bucket limit). */
  maxBytesCeiling: 10 * 1024 * 1024,
  email: 254,
  name: 120,
} as const;

/** Hold-for-review thresholds (Placeholders to confirm with the business). */
export const HOLD = {
  /** A first-time email with this many links or more is held. */
  linksForNewEmail: 1,
  /** Any email with more than this many requests in 24 hours is held. */
  perEmail24h: 3,
  /** The same text already sent this many times in 24 hours (by anyone) is held. */
  identical24h: 2,
  /** Hard cap on links in one message, for anyone. */
  maxLinks: 4,
  blockedWords: [
    'viagra',
    'casino',
    'crypto giveaway',
    'bitcoin doubler',
    'loan offer',
    'seo services',
  ],
} as const;

export const TYPES = ['question', 'problem', 'billing', 'feedback'] as const;
export type SupportType = (typeof TYPES)[number];

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export const isEmail = (s: string) => s.length <= LIMITS.email && EMAIL_RE.test(s);

const DIAG_KEYS = ['app_version', 'platform', 'os', 'browser', 'route', 'role', 'at'] as const;
/** Keep only the listed diagnostic keys, as short strings. Anything else is dropped, never stored. */
export function cleanDiagnostics(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== 'object') return out;
  for (const k of DIAG_KEYS) {
    const x = (v as Record<string, unknown>)[k];
    if (typeof x === 'string' && x.trim()) out[k] = x.trim().slice(0, 120);
  }
  return out;
}

export interface Submission {
  type: SupportType;
  subject: string;
  body: string;
  email: string;
  name: string | null;
  sourceArticle: string | null;
  sourceRoute: string | null;
  diagnostics: Record<string, string>;
  captchaToken: string | undefined;
  /** Files the client intends to upload (count and sizes are checked here, bytes later). */
  files: { name: string; type: string; size: number }[];
}

export type Validated =
  { ok: true; value: Submission } | { ok: false; field: string; error: string };

export function validateSubmission(raw: unknown, maxFiles: number, maxBytes: number): Validated {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '');
  const type = str('type') as SupportType;
  if (!TYPES.includes(type)) return { ok: false, field: 'type', error: 'invalid_type' };
  const subject = str('subject');
  if (!subject || subject.length > LIMITS.subject)
    return { ok: false, field: 'subject', error: 'invalid_subject' };
  const body = str('body');
  if (!body || body.length > LIMITS.body)
    return { ok: false, field: 'body', error: 'invalid_body' };
  const email = str('email').toLowerCase();
  if (!isEmail(email)) return { ok: false, field: 'email', error: 'invalid_email' };
  const name = str('name').slice(0, LIMITS.name) || null;
  const filesIn = Array.isArray(b.files) ? (b.files as unknown[]) : [];
  if (filesIn.length > maxFiles) return { ok: false, field: 'files', error: 'too_many_files' };
  const files: Submission['files'] = [];
  for (const f of filesIn) {
    const o = (f ?? {}) as Record<string, unknown>;
    const size = typeof o.size === 'number' ? o.size : 0;
    if (typeof o.name !== 'string' || typeof o.type !== 'string' || size <= 0)
      return { ok: false, field: 'files', error: 'invalid_file' };
    if (size > maxBytes) return { ok: false, field: 'files', error: 'file_too_large' };
    if (!ALLOWED_MIME.includes(o.type)) return { ok: false, field: 'files', error: 'file_type' };
    files.push({ name: safeFileName(o.name), type: o.type, size });
  }
  return {
    ok: true,
    value: {
      type,
      subject,
      body,
      email,
      name,
      sourceArticle: /^[a-z0-9-]{1,120}$/.test(str('source_article'))
        ? str('source_article')
        : null,
      sourceRoute: str('source_route').startsWith('/') ? str('source_route').slice(0, 200) : null,
      diagnostics: cleanDiagnostics(b.diagnostics),
      captchaToken: typeof b.captcha_token === 'string' ? b.captcha_token : undefined,
      files,
    },
  };
}

// Hold for review -----------------------------------------------------------------------------------------------
export interface Signals {
  by_email_24h: number;
  known_email: number;
  identical_24h: number;
}
export const countLinks = (s: string) => (s.match(/https?:\/\/|www\./gi) ?? []).length;

/** A reason to hold the request for review, or null. The requester is told only that we are checking it. */
export function holdReason(s: Signals, text: { subject: string; body: string }): string | null {
  const all = `${text.subject}\n${text.body}`.toLowerCase();
  const links = countLinks(all);
  if (links > HOLD.maxLinks) return 'many_links';
  if (links >= HOLD.linksForNewEmail && s.known_email === 0) return 'new_email_with_link';
  if (s.by_email_24h >= HOLD.perEmail24h) return 'many_requests';
  if (s.identical_24h >= HOLD.identical24h) return 'repeated_text';
  if (HOLD.blockedWords.some((w) => all.includes(w))) return 'blocked_words';
  return null;
}

// Uploads ---------------------------------------------------------------------------------------------------------
export const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];

/** The real type of a file from its first bytes, or null when it is not an allowed type. */
export function sniffMime(b: Uint8Array): string | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, k) => b[i + k] === x);
  if (b.length < 12) return null;
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0x47, 0x49, 0x46, 0x38) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61)
    return 'image/gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';
  return null;
}

export function safeFileName(n: string): string {
  const base = n.split(/[\\/]/).pop() ?? 'file';
  const clean = base
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 100)
    .trim();
  return clean || 'file';
}

// Search misses ---------------------------------------------------------------------------------------------------
/** Only log queries that cannot identify a person: no emails, no long digit runs, a sane length. */
export function loggableMiss(q: string): string | null {
  const t = q.trim().toLowerCase().replace(/\s+/g, ' ');
  if (t.length < 2 || t.length > 100) return null;
  if (t.includes('@') || /\d{6,}/.test(t.replace(/[\s-]/g, '')) || /^https?:/.test(t)) return null;
  return t;
}
