import { HELP_CATEGORIES } from '@athleit/core';

import type { HelpArticle } from './load';

export function allSlugsAndCategories(articles: readonly HelpArticle[]) {
  return {
    slugs: new Set(articles.map((a) => a.slug)),
    categories: new Set<string>(HELP_CATEGORIES.map((c) => c.slug)),
  };
}
