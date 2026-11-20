// "What's new": dated product changes from apps/web/content/whats-new/*.mdx (frontmatter: title, date, summary, article?).
// Source and cadence are a business decision; the folder starts empty and the page says so honestly.
import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';

export interface WhatsNewEntry {
  title: string;
  date: string;
  summary: string;
  article: string | null;
}
export function loadWhatsNew(dir = path.join(process.cwd(), 'content/whats-new')): WhatsNewEntry[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => {
      const d = matter(fs.readFileSync(path.join(dir, f), 'utf8')).data;
      return {
        title: String(d.title ?? ''),
        date: d.date instanceof Date ? d.date.toISOString().slice(0, 10) : String(d.date ?? ''),
        summary: String(d.summary ?? ''),
        article: typeof d.article === 'string' ? d.article : null,
      };
    })
    .filter((e) => e.title && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
    .sort((a, b) => b.date.localeCompare(a.date));
}
