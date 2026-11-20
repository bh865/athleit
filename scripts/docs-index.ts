// pnpm docs:index — builds apps/web/src/generated/help-articles.json (slug, title, category, audience, summary, covers,
// verified fields). Used by search, the mobile hub and the admin Articles page. Generated files are gitignored.
import fs from 'node:fs';
import path from 'node:path';

import { loadArticles, toIndexEntry } from '../apps/web/src/lib/help/load';

const { articles, errors } = loadArticles();
if (errors.length) {
  for (const e of errors) console.error(`${e.file}: ${e.message}`);
  process.exit(1);
}
const out = path.resolve('apps/web/src/generated/help-articles.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify(
    { generated_at: new Date().toISOString(), articles: articles.map(toIndexEntry) },
    null,
    2,
  ) + '\n',
);
console.log(`docs:index wrote ${articles.length} articles to ${path.relative(process.cwd(), out)}`);
