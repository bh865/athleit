import { adminSupportMetrics } from '@athleit/db/support';

import { ChartCard } from '@/components/admin/chart';
import { ChartGrid, PageTitle, StatTile, TileGrid, hrefBuilder } from '@/components/admin/kit';
import { ErrorState } from '@/components/ui';
import { getAdminContext } from '@/lib/admin/context';
import { parseRange, rangeOptions, type SearchParams } from '@/lib/admin/view';
import { createClient } from '@/lib/supabase/server';

const RANGES = ['7d', '30d', '90d', '12m'] as const;

export default async function SupportReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const ctx = await getAdminContext();
  const range = parseRange(sp, [...RANGES], '30d');
  const res = await adminSupportMetrics(await createClient(), range);
  const href = hrefBuilder('/admin/support/reports', sp);
  const ranges = rangeOptions('/admin/support/reports', sp, [...RANGES], range);
  if (res.error)
    return (
      <>
        <PageTitle title="Support reports" />
        <ErrorState message="Couldn’t load support reports. Nothing was changed." />
      </>
    );
  const m = res.data;
  const weeks = [...new Set(m.per_week.map((w) => w.week))].sort();
  const types = ['question', 'problem', 'billing', 'feedback'];
  const yes = m.satisfaction.yes,
    no = m.satisfaction.no;
  return (
    <>
      <PageTitle
        title="Support reports"
        sub="Read only. Counts come from tickets; no message text is used."
      />
      <TileGrid>
        <StatTile
          label="First reply, median"
          value={m.first_reply_hours.median === null ? '—' : `${m.first_reply_hours.median} h`}
          sub={`90th percentile ${m.first_reply_hours.p90 ?? '—'} h`}
        />
        <StatTile
          label="Time to solve, median"
          value={m.time_to_solve_hours.median === null ? '—' : `${m.time_to_solve_hours.median} h`}
        />
        <StatTile
          label="Satisfaction (yes)"
          value={yes + no ? `${Math.round((100 * yes) / (yes + no))}%` : '—'}
          sub={`${yes + no} answers`}
        />
        <StatTile label="Tickets per 100 teams" value={String(m.tickets_per_100_teams)} />
      </TileGrid>
      <ChartGrid>
        <ChartCard
          title="Tickets per week, by type"
          source="support_requests.created_at"
          asOf={ctx.asOf}
          kind="bar"
          ranges={ranges}
          labels={weeks.map((w) =>
            new Date(w).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          )}
          series={types.map((t) => ({
            id: t,
            label: t,
            data: weeks.map(
              (w) => m.per_week.find((x) => x.week === w && x.type === t)?.count ?? 0,
            ),
          }))}
          retryHref={href({})}
        />
        <ChartCard
          title="Open tickets by age"
          source="support_requests.created_at"
          asOf={ctx.asOf}
          kind="hbar"
          labels={['Under 1 day', '1 to 3 days', '3 to 7 days', 'Over 7 days']}
          series={[
            {
              id: 'open',
              label: 'Open tickets',
              data: [
                m.open_by_age.lt_1d,
                m.open_by_age.d1_3,
                m.open_by_age.d3_7,
                m.open_by_age.gt_7d,
              ],
            },
          ]}
          retryHref={href({})}
        />
        <ChartCard
          title="Top articles by tickets"
          source="support_requests.source_article"
          asOf={ctx.asOf}
          kind="hbar"
          labels={m.top_articles.map((a) => a.slug)}
          series={[{ id: 'tickets', label: 'Tickets', data: m.top_articles.map((a) => a.count) }]}
          retryHref={href({})}
        />
        <ChartCard
          title="Top searches with no results"
          source="help_search_misses"
          asOf={ctx.asOf}
          kind="hbar"
          labels={m.top_misses.map((a) => a.query)}
          series={[{ id: 'misses', label: 'Searches', data: m.top_misses.map((a) => a.hits) }]}
          retryHref={href({})}
        />
      </ChartGrid>
    </>
  );
}
