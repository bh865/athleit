// Reads help articles from the repository (apps/web/content/help/<category>/<slug>.mdx). Node only (fs): used by the app at
// build time, by `pnpm docs:index` and by `pnpm docs:check`. No runtime fetching of content.
import fs from 'node:fs';
import path from 'node:path';

import { articleFrontmatter, type ArticleFrontmatter } from '@athleit/core';
import matter from 'gray-matter';

export interface HelpArticle extends ArticleFrontmatter {
  /** Path relative to the repo root, for example apps/web/content/help/payments-and-receipts/pay-a-request.mdx. */
  file: string;
  body: string;
}
export interface LoadResult {
  articles: HelpArticle[];
  errors: { file: string; message: string }[];
}

/** apps/web/content/help, found from any working directory inside the repo. */
export function contentRoot(from = process.cwd()): string {
  let dir = from;
  for (let i = 0; i < 6; i++) {
    const a = path.join(dir, 'apps/web/content/help');
    if (fs.existsSync(a)) return a;
    const b = path.join(dir, 'content/help');
    if (fs.existsSync(b)) return b;
    dir = path.dirname(dir);
  }
  throw new Error('help content folder not found');
}
export const repoRootFrom = (root: string) => path.resolve(root, '../../../..');

export function loadArticles(root = contentRoot()): LoadResult {
  const articles: HelpArticle[] = [];
  const errors: LoadResult['errors'] = [];
  const repo = repoRootFrom(root);
  for (const cat of fs.readdirSync(root, { withFileTypes: true })) {
    if (!cat.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(root, cat.name))) {
      if (!f.endsWith('.mdx')) continue;
      const abs = path.join(root, cat.name, f);
      const file = path.relative(repo, abs);
      const parsed = matter(fs.readFileSync(abs, 'utf8'));
      const fm = articleFrontmatter.safeParse({
        ...parsed.data,
        verified_at:
          parsed.data.verified_at instanceof Date
            ? parsed.data.verified_at.toISOString().slice(0, 10)
            : parsed.data.verified_at,
        verified_commit: String(parsed.data.verified_commit ?? ''),
      });
      if (!fm.success) {
        errors.push({
          file,
          message: fm.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        });
        continue;
      }
      if (fm.data.slug !== f.replace(/\.mdx$/, ''))
        errors.push({ file, message: `slug "${fm.data.slug}" must match the file name "${f}"` });
      if (fm.data.category !== cat.name)
        errors.push({
          file,
          message: `category "${fm.data.category}" must match the folder "${cat.name}"`,
        });
      articles.push({ ...fm.data, file, body: parsed.content });
    }
  }
  articles.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.order - b.order || a.title.localeCompare(b.title),
  );
  return { articles, errors };
}

/** What the search index, the mobile hub and the admin Articles page read. Never includes the body. */
export const toIndexEntry = (a: HelpArticle) => ({
  slug: a.slug,
  title: a.title,
  category: a.category,
  audience: a.audience,
  platforms: a.platforms ?? [],
  summary: a.summary,
  covers: a.covers,
  verified_commit: a.verified_commit,
  verified_at: a.verified_at,
  file: a.file,
});
