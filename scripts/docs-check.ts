// pnpm docs:check [--base <ref>] [--pr-body-file <file>] [--summary-file <file>] [--stale --json]
// Validates every help article, then lists articles whose covered code changed without the article. DOCS_CHECK_MODE=warn|block.
// With --stale --json it instead prints, for each article, whether code it covers changed after its verified commit.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import {
  annotations,
  docsMode,
  exitCode,
  findMismatches,
  lintArticleBody,
  matchesCover,
  parseDocsAck,
  summaryMarkdown,
  type Report,
  type StaleResult,
} from '../packages/core/src/index';
import { allSlugsAndCategories } from '../apps/web/src/lib/help/check-helpers';
import { loadArticles } from '../apps/web/src/lib/help/load';

const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(n);

function defaultBase(): string {
  for (const ref of [process.env.DOCS_CHECK_BASE, 'origin/dev', 'origin/main', 'dev', 'main']) {
    if (!ref) continue;
    try {
      return git('merge-base', 'HEAD', ref);
    } catch {
      /* try the next one */
    }
  }
  throw new Error('No base found. Pass --base <ref>.');
}

const { articles, errors: loadErrors } = loadArticles();
const tracked = git('ls-files').split('\n');

if (flag('--stale')) {
  const out: StaleResult[] = articles.map((a) => {
    let paths: string[] = [];
    try {
      const changed = git('diff', '--name-only', `${a.verified_commit}..HEAD`)
        .split('\n')
        .filter(Boolean);
      paths = changed.filter((f) => a.covers.some((c) => matchesCover(c, f)) && f !== a.file);
    } catch {
      paths = ['(verified commit not found in history)'];
    }
    return { slug: a.slug, stale: paths.length > 0, stale_paths: paths.slice(0, 20) };
  });
  console.log(
    flag('--json')
      ? JSON.stringify(out, null, 2)
      : out
          .filter((s) => s.stale)
          .map((s) => `${s.slug}: ${s.stale_paths.join(', ')}`)
          .join('\n') || 'No stale articles.',
  );
  process.exit(0);
}

const report: Report = {
  errors: loadErrors.map((e) => ({ file: e.file, message: e.message })),
  mismatches: [],
  acked: false,
  ackReason: null,
  mode: docsMode(process.env.DOCS_CHECK_MODE),
};
const { slugs, categories } = allSlugsAndCategories(articles);
for (const a of articles) {
  for (const r of a.related)
    if (!slugs.has(r))
      report.errors.push({ file: a.file, message: `related slug "${r}" does not exist` });
  for (const c of a.covers)
    if (!tracked.some((f) => matchesCover(c, f)))
      report.errors.push({ file: a.file, message: `covers "${c}" matches no tracked file` });
  for (const p of lintArticleBody(a.body))
    report.errors.push({ file: a.file, message: `${p.rule}: ${p.message}`, line: p.line });
  for (const m of a.body.matchAll(/\]\((\/help\/(?:a|c)\/([a-z0-9-]+))[^)]*\)/g)) {
    const ok = m[1]!.startsWith('/help/a/') ? slugs.has(m[2]!) : categories.has(m[2]!);
    if (!ok) report.errors.push({ file: a.file, message: `link ${m[1]} does not resolve` });
  }
}

const base = arg('--base') ?? defaultBase();
const changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
report.mismatches = findMismatches(articles, changed);
const body = arg('--pr-body-file')
  ? fs.readFileSync(arg('--pr-body-file')!, 'utf8')
  : process.env.PR_BODY;
Object.assign(report, (({ acked, reason }) => ({ acked, ackReason: reason }))(parseDocsAck(body)));

for (const line of annotations(report)) console.log(line);
const summary = summaryMarkdown(report, {
  draftingAvailable: process.env.DRAFTING_AVAILABLE !== 'false',
});
if (arg('--summary-file')) fs.writeFileSync(arg('--summary-file')!, summary + '\n');
console.log(`\n${summary}`);
process.exit(exitCode(report));
