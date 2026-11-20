// pnpm docs:verify <slug...> — stamps verified_commit (current HEAD) and verified_at (today) into the article frontmatter.
// Run it only after a person (or the agent) has actually checked the article against the code.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { loadArticles, repoRootFrom, contentRoot } from '../apps/web/src/lib/help/load';

const slugs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!slugs.length) {
  console.error('Usage: pnpm docs:verify <slug...>');
  process.exit(2);
}
const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const today = new Date().toISOString().slice(0, 10);
const repo = repoRootFrom(contentRoot());
const { articles } = loadArticles();
let bad = false;
for (const slug of slugs) {
  const a = articles.find((x) => x.slug === slug);
  if (!a) {
    console.error(`No article "${slug}".`);
    bad = true;
    continue;
  }
  const file = path.join(repo, a.file);
  const next = fs
    .readFileSync(file, 'utf8')
    .replace(/^verified_commit:.*$/m, `verified_commit: ${head}`)
    .replace(/^verified_at:.*$/m, `verified_at: '${today}'`);
  fs.writeFileSync(file, next);
  console.log(`${slug}: verified at ${head} on ${today}`);
}
process.exit(bad ? 1 : 0);
