import { HELP_CATEGORIES } from '@athleit/core';
import { adminSupportArticleStats } from '@athleit/db/support';
import Link from 'next/link';

import {
  DataTable,
  PageTitle,
  Panel,
  StatusPill,
  hrefBuilder,
  type Column,
} from '@/components/admin/kit';
import { ErrorState } from '@/components/ui';
import { getAdminContext } from '@/lib/admin/context';
import { one, type SearchParams } from '@/lib/admin/view';
import { allArticles } from '@/lib/help/content';
import { createClient } from '@/lib/supabase/server';

const REPO = process.env.NEXT_PUBLIC_REPO_URL?.replace(/\/+$/, '');

/** Docs health. This page reports; it does not edit. Articles are written in the repository so they ship with the code. */
export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  await getAdminContext();
  const res = await adminSupportArticleStats(await createClient());
  const filter = one(sp.filter);
  const stats = res.data;
  const rows = allArticles().map((a) => {
    const fb = stats?.feedback.find((f) => f.slug === a.slug);
    const votes = (fb?.yes ?? 0) + (fb?.no ?? 0);
    return {
      a,
      votes,
      rate: votes ? Math.round(((fb?.yes ?? 0) / votes) * 100) : null,
      tickets: stats?.tickets_30d.find((t) => t.slug === a.slug)?.count ?? 0,
      stale: stats?.status.find((s) => s.slug === a.slug)?.stale ?? false,
    };
  });
  const shown = rows
    .filter((r) =>
      filter === 'stale' ? r.stale : filter === 'unhelpful' ? r.rate !== null && r.rate < 70 : true,
    )
    .sort((x, y) =>
      filter === 'tickets' ? y.tickets - x.tickets : x.a.title.localeCompare(y.a.title),
    );
  const href = hrefBuilder('/admin/support/articles', sp);
  type R = (typeof rows)[number];
  const cols: Column<R>[] = [
    {
      key: 'title',
      header: 'Article',
      cell: (r) => <Link href={`/help/a/${r.a.slug}`}>{r.a.title}</Link>,
    },
    {
      key: 'cat',
      header: 'Category',
      cell: (r) => HELP_CATEGORIES.find((c) => c.slug === r.a.category)?.title ?? r.a.category,
    },
    { key: 'aud', header: 'Audience', cell: (r) => r.a.audience.join(', ') },
    { key: 'ver', header: 'Last verified', cell: (r) => <code>{r.a.verified_at}</code> },
    {
      key: 'stale',
      header: 'Changed since verified',
      cell: (r) => (r.stale ? <StatusPill tone="warn">Stale</StatusPill> : stats ? 'No' : '—'),
    },
    {
      key: 'rate',
      header: 'Helpful',
      cell: (r) => (r.rate === null ? '—' : `${r.rate}% (${r.votes})`),
    },
    { key: 'tickets', header: 'Tickets, 30 days', align: 'right', cell: (r) => r.tickets },
    {
      key: 'repo',
      header: 'Source',
      cell: (r) =>
        REPO ? (
          <a href={`${REPO}/blob/HEAD/${r.a.file}`} rel="noopener noreferrer">
            Open in repository
          </a>
        ) : (
          <code>{r.a.file}</code>
        ),
    },
  ];
  return (
    <>
      <PageTitle
        title="Articles"
        sub="Docs health. Articles are written in the repository so they ship with the code; this page reports, it does not edit."
      />
      <nav aria-label="Filter" style={{ display: 'flex', gap: 'var(--space-4)' }}>
        {[
          ['all', 'All'],
          ['stale', 'Stale'],
          ['unhelpful', 'Unhelpful'],
          ['tickets', 'Most tickets'],
        ].map(([v, l]) => (
          <Link
            key={v}
            href={href({ filter: v === 'all' ? null : (v ?? null) })}
            aria-current={(filter ?? 'all') === v ? 'page' : undefined}
          >
            {l}
          </Link>
        ))}
      </nav>
      {res.error ? (
        <ErrorState message="Couldn’t load article statistics. The list below shows content only." />
      ) : null}
      <DataTable
        caption="Help articles"
        columns={cols}
        rows={shown}
        rowKey={(r) => r.a.slug}
        buildHref={href}
        empty="No articles match."
      />
      {stats && stats.misses.length ? (
        <Panel title="Searches with no results (30 days)">
          <ul>
            {stats.misses.slice(0, 15).map((m) => (
              <li key={m.query}>
                {m.query} <code>{m.hits}</code>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {stats && stats.comments.length ? (
        <Panel title="What was missing">
          <ul>
            {stats.comments.slice(0, 15).map((c, i) => (
              <li key={i}>
                <code>{c.slug}</code> {c.comment}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}
