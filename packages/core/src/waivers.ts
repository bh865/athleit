/**
 * Waiver and document rules shared by web and mobile: compliance grouping, re-sign presets, a word-level text
 * diff for "Compare with draft", and upload validation. Pure, so each rule has a unit test.
 */
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
} from './schemas/registration';

// ----------------------------------------------------------------------------------------------- compliance
export type WaiverStatus = 'signed' | 'expired' | 'missing';

/**
 * `waiver_compliance` reports current / outdated / expired / missing. The screens speak signed / expired /
 * missing: "outdated" (signed an earlier version) is asked to sign again, so it reads as expired.
 */
export function normalizeWaiverStatus(raw: string): WaiverStatus {
  if (raw === 'current' || raw === 'signed') return 'signed';
  if (raw === 'missing') return 'missing';
  return 'expired';
}

export interface ComplianceRow {
  player_id: string;
  first_name: string;
  last_name: string;
  waiver_id: string;
  waiver_title: string;
  status: string;
  accepted_at: string | null;
}

export interface ComplianceGroup {
  waiverId: string;
  title: string;
  signed: number;
  total: number;
  rows: (ComplianceRow & { state: WaiverStatus })[];
}

export interface ComplianceSummary {
  signed: number;
  expired: number;
  missing: number;
  total: number;
  /** Players with at least one expired or missing waiver. */
  playersNeedingAttention: number;
  players: number;
  waivers: number;
  groups: ComplianceGroup[];
}

/** Rows grouped by waiver, worst first inside each group, plus the totals for the summary card. */
export function summarizeCompliance(rows: readonly ComplianceRow[]): ComplianceSummary {
  const rank: Record<WaiverStatus, number> = { missing: 0, expired: 1, signed: 2 };
  const by = new Map<string, ComplianceGroup>();
  const needing = new Set<string>();
  const players = new Set<string>();
  let signed = 0;
  let expired = 0;
  let missing = 0;
  for (const r of rows) {
    const state = normalizeWaiverStatus(r.status);
    players.add(r.player_id);
    if (state === 'signed') signed++;
    else {
      needing.add(r.player_id);
      if (state === 'expired') expired++;
      else missing++;
    }
    const g = by.get(r.waiver_id) ?? {
      waiverId: r.waiver_id,
      title: r.waiver_title,
      signed: 0,
      total: 0,
      rows: [],
    };
    g.total++;
    if (state === 'signed') g.signed++;
    g.rows.push({ ...r, state });
    by.set(r.waiver_id, g);
  }
  const groups = [...by.values()].sort((a, b) => a.title.localeCompare(b.title));
  for (const g of groups)
    g.rows.sort(
      (a, b) =>
        rank[a.state] - rank[b.state] ||
        a.last_name.localeCompare(b.last_name) ||
        a.first_name.localeCompare(b.first_name),
    );
  return {
    signed,
    expired,
    missing,
    total: rows.length,
    playersNeedingAttention: needing.size,
    players: players.size,
    waivers: groups.length,
    groups,
  };
}

/** Segment widths (percent) for the Signed / Expired / Missing bar. Always sums to 100, or all zero when empty. */
export function progressSegments(
  s: Pick<ComplianceSummary, 'signed' | 'expired' | 'missing' | 'total'>,
) {
  if (s.total === 0) return { signed: 0, expired: 0, missing: 0 };
  const signed = Math.round((s.signed / s.total) * 100);
  const expired = Math.round((s.expired / s.total) * 100);
  return { signed, expired, missing: Math.max(0, 100 - signed - expired) };
}

export type ComplianceFilter = 'needs' | 'all' | 'signed';
export const matchesComplianceFilter = (state: WaiverStatus, f: ComplianceFilter): boolean =>
  f === 'all' ? true : f === 'signed' ? state === 'signed' : state !== 'signed';

// ----------------------------------------------------------------------------------------------- reminders
export const WAIVER_REMINDER_COOLDOWN_HOURS = 24;

/** Rows eligible for a reminder now: not signed, and not reminded inside the cooldown. */
export function remindable<T extends { player_id: string; waiver_id: string; state: WaiverStatus }>(
  rows: readonly T[],
  lastSent: ReadonlyMap<string, string>,
  now: number = Date.now(),
): T[] {
  return rows.filter((r) => {
    if (r.state === 'signed') return false;
    const at = lastSent.get(`${r.player_id}:${r.waiver_id}`);
    return !at || now - Date.parse(at) >= WAIVER_REMINDER_COOLDOWN_HOURS * 3_600_000;
  });
}

// --------------------------------------------------------------------------------------------- re-sign presets
export const RESIGN_PRESETS = ['never', '6m', '1y', 'custom'] as const;
export type ResignPreset = (typeof RESIGN_PRESETS)[number];
const DAYS = { '6m': 182, '1y': 365 } as const;
export const RESIGN_MAX_DAYS = 3650;

/** The days stored on a waiver for a preset (`null` = never). `custom` uses the typed number of days. */
export function resignDays(preset: ResignPreset, customDays: number | null): number | null {
  if (preset === 'never') return null;
  if (preset === 'custom') {
    return customDays !== null &&
      Number.isInteger(customDays) &&
      customDays >= 1 &&
      customDays <= RESIGN_MAX_DAYS
      ? customDays
      : null;
  }
  return DAYS[preset];
}
export function resignPreset(days: number | null | undefined): ResignPreset {
  if (days === null || days === undefined) return 'never';
  if (days === DAYS['6m']) return '6m';
  if (days === DAYS['1y']) return '1y';
  return 'custom';
}
export function resignSentence(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'Parents sign once. This waiver does not expire.';
  if (days === DAYS['1y']) return 'Parents are asked to sign again 1 year after they last signed.';
  if (days === DAYS['6m'])
    return 'Parents are asked to sign again 6 months after they last signed.';
  return `Parents are asked to sign again ${days} ${days === 1 ? 'day' : 'days'} after they last signed.`;
}

// ------------------------------------------------------------------------------------------------ text tools
export const WAIVER_MAX_CHARS = 50_000;

/** Paragraphs are separated by a blank line. */
export const paragraphs = (body: string): string[] =>
  body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

export const HEADING_PLACEHOLDER = 'Heading';
export const INITIALS_LINE = 'Initials: ________';

/** Insert a block (heading, initials line) on its own paragraph at `at`, returning the new text and caret. */
export function insertBlock(
  body: string,
  at: number,
  block: string,
): { body: string; caret: number } {
  const pos = Math.max(0, Math.min(at, body.length));
  const before = body.slice(0, pos).replace(/[ \t]+$/, '');
  const after = body.slice(pos).replace(/^[ \t]+/, '');
  const lead =
    before === '' ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const tail =
    after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const text = `${before}${lead}${block}${tail}${after}`;
  return { body: text, caret: before.length + lead.length + block.length };
}

export type DiffOp = { type: 'same' | 'add' | 'del'; text: string };

/** Word-level diff (LCS). Whitespace stays attached to the word before it, so joining the ops gives back the text. */
export function diffWords(oldText: string, newText: string): DiffOp[] {
  const tok = (s: string) => s.match(/\S+\s*|\s+/g) ?? [];
  const a = tok(oldText);
  const b = tok(newText);
  const n = a.length;
  const m = b.length;
  // Long documents: fall back to a whole-text replace rather than an n*m table that could stall the page.
  if (n * m > 4_000_000) {
    return oldText === newText
      ? [{ type: 'same', text: newText }]
      : [
          { type: 'del', text: oldText },
          { type: 'add', text: newText },
        ];
  }
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const ops: DiffOp[] = [];
  const push = (type: DiffOp['type'], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += text;
    else ops.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', b[j]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) push('del', a[i++]!);
    else push('add', b[j++]!);
  }
  while (i < n) push('del', a[i++]!);
  while (j < m) push('add', b[j++]!);
  return ops;
}

/** "1 line changed", "3 lines changed", or "No changes". Lines are paragraphs. */
export function changeSummary(oldText: string, newText: string): string {
  const a = paragraphs(oldText);
  const b = paragraphs(newText);
  const A = new Set(a);
  const B = new Set(b);
  const lines = Math.max(b.filter((p) => !A.has(p)).length, a.filter((p) => !B.has(p)).length);
  return lines === 0 ? 'No changes' : `${lines} ${lines === 1 ? 'line' : 'lines'} changed`;
}

/** Why a draft cannot be published yet, in the builder's words. Empty list means ready. */
export function waiverIssues(title: string, body: string): string[] {
  const out: string[] = [];
  if (!title.trim()) out.push('Add a title.');
  if (!body.trim()) out.push('Add the waiver text.');
  if (body.length > WAIVER_MAX_CHARS)
    out.push(`Keep the text under ${WAIVER_MAX_CHARS.toLocaleString('en-US')} characters.`);
  return out;
}

export const WAIVER_TEMPLATES = [
  {
    id: 'general_liability',
    title: 'General Liability',
    description: 'Assumption of risk, release of claims and emergency treatment consent.',
    icon: 'shield-check',
    body: [
      'I, the undersigned parent or legal guardian of the player named in this registration, give permission for my child to take part in practices, games, tournaments and team events.',
      'I understand that sport involves physical contact and a risk of injury. I accept these risks on behalf of my child and release the organization, its coaches and volunteers from claims arising from ordinary participation.',
      'In an emergency, I authorize the coach or team staff to seek medical treatment for my child if I cannot be reached. I will keep my emergency contact information up to date.',
    ].join('\n\n'),
  },
  {
    id: 'photo_media',
    title: 'Photo & Media Release',
    description: 'Permission to use photos and video of players.',
    icon: 'camera',
    body: [
      'I give permission for photos and video that include my child to be taken at team activities.',
      'I understand these may be shared with the team, and used on the organization’s website and social media. I may withdraw this permission at any time by telling the team manager in writing.',
    ].join('\n\n'),
  },
] as const;

// ------------------------------------------------------------------------------------------------- documents
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const DOCUMENT_CATEGORY_LABEL: Record<string, string> = {
  rules: 'Rules',
  schedule: 'Schedule',
  tournament: 'Tournament',
  forms: 'Forms',
  other: 'Other',
};
export const DOCUMENT_VISIBILITY_LABEL: Record<string, string> = {
  staff_only: 'Staff only',
  team_members: 'Team members',
};

export interface UploadCandidate {
  name: string;
  type: string;
  size: number;
}

/** Why one file cannot be uploaded, or null. Mirrors the storage bucket's allowlist and limit. */
export function validateUpload(f: UploadCandidate): string | null {
  if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(f.type))
    return 'Not supported. Use PDF, images or Office files.';
  if (f.size > DOCUMENT_MAX_BYTES)
    return `Over the 20 MB limit (${(f.size / 1_048_576).toFixed(0)} MB)`;
  if (f.size <= 0) return 'This file is empty.';
  return null;
}

/** Multi-file check: each file's error, and the ones that can go. */
export function validateUploads<T extends UploadCandidate>(files: readonly T[]) {
  const checked = files.map((file) => ({ file, error: validateUpload(file) }));
  return { checked, ok: checked.filter((c) => !c.error).map((c) => c.file) };
}

export const safeFileName = (n: string): string =>
  n.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'file';

/** `team/<id>/<uuid>/<safeName>` or `club/<id>/...`: the storage convention the bucket policies rely on. */
export const documentPath = (
  o: { teamId?: string | undefined; clubId?: string | undefined },
  uuid: string,
  name: string,
) => `${o.teamId ? `team/${o.teamId}` : `club/${o.clubId}`}/${uuid}/${safeFileName(name)}`;

export const titleFromFile = (name: string): string =>
  name.replace(/\.[A-Za-z0-9]{1,5}$/, '').slice(0, 150) || name;

export const fileSizeLabel = (n: number): string =>
  n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export type FileKind = 'pdf' | 'doc' | 'sheet' | 'slides' | 'image' | 'file';
export function fileKind(mime: string): FileKind {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('wordprocessingml') || mime === 'application/msword') return 'doc';
  if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel') return 'sheet';
  if (mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint') return 'slides';
  return 'file';
}

export interface DocLite {
  id: string;
  title: string;
  category: string;
  visibility: string;
  pinned: boolean;
  created_at: string;
}

/** Category pills with counts ("All" first, then categories that have documents plus the standard ones). */
export function categoryCounts(docs: readonly DocLite[]) {
  const n = (c: string) => docs.filter((d) => d.category === c).length;
  return [
    { value: 'all', label: 'All', count: docs.length },
    ...DOCUMENT_CATEGORIES.map((c) => ({
      value: c as string,
      label: DOCUMENT_CATEGORY_LABEL[c] ?? c,
      count: n(c),
    })),
  ];
}

export function filterDocuments<T extends DocLite>(
  docs: readonly T[],
  f: { category: string; visibility: string; search: string },
): T[] {
  const q = f.search.trim().toLowerCase();
  return docs.filter(
    (d) =>
      (f.category === 'all' || d.category === f.category) &&
      (f.visibility === 'all' || d.visibility === f.visibility) &&
      (!q || d.title.toLowerCase().includes(q)),
  );
}

/** Pinned documents lead; both groups newest first. */
export function splitPinned<T extends DocLite>(docs: readonly T[]): { pinned: T[]; rest: T[] } {
  const byNew = (a: T, b: T) => b.created_at.localeCompare(a.created_at);
  return {
    pinned: docs.filter((d) => d.pinned).sort(byNew),
    rest: docs.filter((d) => !d.pinned).sort(byNew),
  };
}

/** What a person may do with documents, from the capabilities they hold. Read-only people get no management controls. */
export function documentAbilities(caps: ReadonlySet<string>) {
  const manage = caps.has('documents.manage');
  return {
    view: caps.has('documents.view') || manage,
    upload: manage,
    edit: manage,
    archive: manage,
    seeVisibility: manage || caps.has('team.details'),
  };
}
