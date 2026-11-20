import { NextResponse } from 'next/server';

import { allArticles } from '@/lib/help/content';

// The search index for the mobile Help hub: titles, summaries and categories only (never article bodies).
export const dynamic = 'force-static';
export const GET = () =>
  NextResponse.json(
    allArticles().map((a) => ({
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      category: a.category,
    })),
    { headers: { 'cache-control': 'public, max-age=300' } },
  );
