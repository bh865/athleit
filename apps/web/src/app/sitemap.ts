import type { MetadataRoute } from 'next';

import { HELP_CATEGORIES } from '@athleit/core';

import { allArticles } from '@/lib/help/content';

const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');

/** Help home, categories and articles only. Contact, requests, search and token pages are never listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${base}/help`, changeFrequency: 'weekly' },
    ...HELP_CATEGORIES.map((c) => ({ url: `${base}/help/c/${c.slug}` })),
    ...allArticles().map((a) => ({ url: `${base}/help/a/${a.slug}`, lastModified: a.verified_at })),
  ];
}
