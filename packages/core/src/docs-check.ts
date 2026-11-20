/**
 * The pure part of `pnpm docs:check`: matching changed files against an article's `covers` globs, reading the PR
 * acknowledgement, and deciding what to report. No I/O so it is unit tested with fixtures; scripts/docs-check.ts
 * does the git and file work.
 */

/** Glob to RegExp. `**` crosses folders, `*` stays inside one, `?` is one character. Everything else is literal. */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          out += '(?:.*/)?'; // "**/" also matches no folder at all
        } else out += '.*';
      } else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/** A cover entry may be a file, a folder (with or without a trailing slash) or a glob. */
export function matchesCover(cover: string, file: string): boolean {
  const c = cover.replace(/\/+$/, '');
  if (!/[*?]/.test(c)) return file === c || file.startsWith(`${c}/`);
  return globToRegExp(c).test(file);
}
export const coveredFiles = (covers: readonly string[], files: readonly string[]) =>
  files.filter((f) => covers.some((c) => matchesCover(c, f)));

export interface ArticleRef {
  slug: string;
  file: string;
  covers: readonly string[];
}
export interface Mismatch {
  slug: string;
  file: string;
  changed: string[];
}

/** Articles whose covered code changed in this diff while the article itself did not. */
export function findMismatches(
  articles: readonly ArticleRef[],
  changedFiles: readonly string[],
): Mismatch[] {
  const changed = new Set(changedFiles);
  const out: Mismatch[] = [];
  for (const a of articles) {
    if (changed.has(a.file)) continue; // the article was updated in the same change
    const hit = coveredFiles(a.covers, changedFiles).filter(
      (f) => !f.startsWith('apps/web/content/help/'),
    );
    if (hit.length) out.push({ slug: a.slug, file: a.file, changed: hit });
  }
  return out;
}

/** `Docs: none needed, because ...` anywhere in the PR description (a reason of at least 5 characters). */
export function parseDocsAck(prBody: string | null | undefined): {
  acked: boolean;
  reason: string | null;
} {
  const m = /^\s*Docs:\s*none needed,?\s*because\s+(.{5,})$/im.exec(prBody ?? '');
  return m ? { acked: true, reason: m[1]!.trim() } : { acked: false, reason: null };
}

export type DocsMode = 'warn' | 'block';
export const docsMode = (v: string | undefined): DocsMode => (v === 'block' ? 'block' : 'warn');

export interface Report {
  /** Hard problems in the content itself (always fail). */
  errors: { file: string; message: string; line?: number }[];
  /** Articles that may need an update. Warn mode reports them; block mode fails on them unless acknowledged. */
  mismatches: Mismatch[];
  acked: boolean;
  ackReason: string | null;
  mode: DocsMode;
}

export const exitCode = (r: Report): 0 | 1 =>
  r.errors.length > 0 || (r.mode === 'block' && r.mismatches.length > 0 && !r.acked) ? 1 : 0;

const esc = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
/** GitHub Actions annotations. */
export function annotations(r: Report): string[] {
  return [
    ...r.errors.map(
      (e) => `::error file=${e.file}${e.line ? `,line=${e.line}` : ''}::${esc(e.message)}`,
    ),
    ...r.mismatches.map(
      (m) =>
        `::${r.mode === 'block' && !r.acked ? 'error' : 'warning'} file=${m.file}::${esc(
          `Code this article covers changed (${m.changed.slice(0, 3).join(', ')}${m.changed.length > 3 ? ', ...' : ''}). Update the article, run pnpm docs:verify ${m.slug}, or add "Docs: none needed, because ..." to the PR description.`,
        )}`,
    ),
  ];
}

/** The short Markdown summary posted on the PR (one comment, updated in place). */
export function summaryMarkdown(r: Report, opts: { draftingAvailable?: boolean } = {}): string {
  const lines = ['<!-- docs-check -->', '### Help articles'];
  if (!r.errors.length && !r.mismatches.length)
    lines.push('All help articles are valid and none of the code they cover changed without them.');
  if (r.errors.length)
    lines.push(
      '',
      `**${r.errors.length} problem${r.errors.length === 1 ? '' : 's'} in the content:**`,
      ...r.errors.map((e) => `- \`${e.file}\`: ${e.message}`),
    );
  if (r.mismatches.length) {
    lines.push(
      '',
      `**${r.mismatches.length} article${r.mismatches.length === 1 ? ' may' : 's may'} be out of date** (covered code changed, article did not):`,
    );
    for (const m of r.mismatches)
      lines.push(
        `- \`${m.file}\` (${m.changed.length} file${m.changed.length === 1 ? '' : 's'} changed, for example \`${m.changed[0]}\`)`,
      );
    lines.push(
      '',
      r.acked
        ? `Acknowledged in the PR description: ${r.ackReason}`
        : 'Update the article and run `pnpm docs:verify <slug>`, or add `Docs: none needed, because ...` to the PR description.',
    );
    if (opts.draftingAvailable === false)
      lines.push('', '_Draft updates by Claude are off (no `ANTHROPIC_API_KEY` secret)._');
  }
  lines.push('', `Mode: \`${r.mode}\``);
  return lines.join('\n');
}

export interface StaleResult {
  slug: string;
  stale: boolean;
  stale_paths: string[];
}
