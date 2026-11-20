// Build-time access to the help content for pages. Cached per process; articles never change at runtime.
import { HELP_CATEGORIES, type HelpAudience } from '@athleit/core';

import { loadArticles, type HelpArticle } from './load';

let cache: HelpArticle[] | null = null;
export function allArticles(): HelpArticle[] {
  if (!cache) {
    const { articles, errors } = loadArticles();
    if (errors.length)
      throw new Error(
        `Help content errors: ${errors.map((e) => `${e.file}: ${e.message}`).join(' | ')}`,
      );
    cache = articles;
  }
  return cache;
}
export const getArticle = (slug: string) => allArticles().find((a) => a.slug === slug) ?? null;
export const articlesIn = (category: string) =>
  allArticles().filter((a) => a.category === category);
export const articlesFor = (aud: HelpAudience) =>
  allArticles().filter((a) => a.audience.includes(aud));
export const categoriesWithArticles = () =>
  HELP_CATEGORIES.map((c) => ({ ...c, count: articlesIn(c.slug).length }));
/** The five most recently verified articles (the design's "New and updated"). */
export const recentlyUpdated = (n = 5) =>
  [...allArticles()]
    .sort((a, b) => b.verified_at.localeCompare(a.verified_at) || a.title.localeCompare(b.title))
    .slice(0, n);

/** What the client search receives: titles, summaries and categories only, never article bodies. */
export const searchDocs = () =>
  allArticles().map((a) => ({
    id: a.slug,
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    category: a.category,
  }));
