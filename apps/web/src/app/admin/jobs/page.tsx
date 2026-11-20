import { getRateLimitMetrics, getWebhookMetrics, listJobs, listWebhookEvents } from '@athleit/db/admin';

import { ChartCard } from '@/components/admin/chart';
import { ChartGrid, DataTable, PageTitle, Panel, StatusPill, decodeCursor, encodeCursor, hrefBuilder, type Column } from '@/components/admin/kit';
import { Button, ErrorState, Text } from '@/components/ui';
import { getAdminContext } from '@/lib/admin/context';
import { one, shortDate, type SearchParams } from '@/lib/admin/view';
import { createClient } from '@/lib/supabase/server';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never');

export default async function JobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ctx = await getAdminContext();
  const supabase = await createClient();
  const outcome = ['failed', 'processed', 'pending'].find((o) => o === one(sp.outcome)) ?? null;
  const [jobs, events, wm, rl] = await Promise.all([
    listJobs(supabase), listWebhookEvents(supabase, outcome, 25, decodeCursor(one(sp.cursor))), getWebhookMetrics(supabase, '7d'), getRateLimitMetrics(supabase, '7d'),
  ]);
  const href = hrefBuilder('/admin/jobs', sp);
  const days = [...new Set((wm.data?.by_day_outcome ?? []).map((r) => r.at))].sort();
  const outcomes = ['processed', 'pending', 'failed'];
  type J = NonNullable<typeof jobs.data>['items'][number];
  type E = NonNullable<typeof events.data>['items'][number];
  const jobCols: Column<J>[] = [
    { key: 'name', header: 'Job', cell: (j) => j.name ?? `#${j.job_id}` },
    { key: 'schedule', header: 'Schedule', cell: (j) => <code>{j.schedule}</code> },
    { key: 'last', header: 'Last run', cell: (j) => when(j.last_run_at) },
    { key: 'status', header: 'Status', cell: (j) => (j.late ? <StatusPill tone="bad">Late</StatusPill> : j.last_status === 'failed' ? <StatusPill tone="bad">Failed</StatusPill> : !j.active ? <StatusPill>Paused</StatusPill> : <StatusPill tone="ok">On time</StatusPill>) },
    { key: 'dur', header: 'Duration', align: 'right', cell: (j) => (j.last_duration_ms == null ? '—' : `${j.last_duration_ms} ms`) },
    { key: 'retry', header: '', cell: () => <Button variant="ghost" disabled title="Retry is not available yet. It needs a retry function.">Retry</Button> },
  ];
  const evCols: Column<E>[] = [
    { key: 'id', header: 'Event', cell: (e) => <code>{e.stripe_event_id}</code> },
    { key: 'type', header: 'Type', cell: (e) => e.type },
    { key: 'out', header: 'Outcome', cell: (e) => <StatusPill tone={e.outcome === 'failed' ? 'bad' : e.outcome === 'pending' ? 'warn' : 'ok'}>{e.outcome}</StatusPill> },
    { key: 'att', header: 'Attempts', align: 'right', cell: (e) => e.attempts },
    { key: 'at', header: 'Received', cell: (e) => when(e.received_at) },
    { key: 'err', header: 'Error', cell: (e) => e.error ?? '—' },
  ];
  return (
    <>
      <PageTitle title="Jobs and webhooks" sub="Retry is not available yet. It needs a retry function." />
      <Panel title="Scheduled jobs" source="cron.job, cron.job_run_details">
        {jobs.error ? <ErrorState message="Couldn’t load jobs. Nothing was changed." /> : <DataTable caption="Scheduled jobs" columns={jobCols} rows={jobs.data.items} rowKey={(j) => String(j.job_id)} buildHref={href} density="dense" />}
        <Text variant="caption" muted as="p">Late means no run within twice its interval. Schedules are read from the database.</Text>
      </Panel>
      <ChartGrid>
        <ChartCard title="Webhook events by outcome" source="stripe_webhook_events" asOf={ctx.asOf} kind="stacked" labels={days.map((d) => shortDate(d))}
          series={outcomes.map((o) => ({ id: o, label: o, data: days.map((d) => (wm.data?.by_day_outcome ?? []).find((r) => r.at === d && r.outcome === o)?.n ?? 0) }))} state={wm.error ? 'error' : 'ok'} retryHref={href({})} />
        <ChartCard title="Rate-limit hits" source="api_rate_limits" asOf={ctx.asOf} kind="line" labels={(rl.data?.hits ?? []).map((h) => shortDate(h.at))} series={[{ id: 'hits', label: 'Hits', data: (rl.data?.hits ?? []).map((h) => h.n ?? 0) }]} state={rl.error ? 'error' : 'ok'} retryHref={href({})} />
      </ChartGrid>
      <Panel title="Webhook ledger" source="stripe_webhook_events">
        <nav aria-label="Outcome" style={{ display: 'flex', gap: 'var(--space-4)' }}>
          {[null, 'failed', 'pending', 'processed'].map((o) => <a key={o ?? 'all'} href={href({ outcome: o, cursor: null })} aria-current={outcome === o ? 'page' : undefined}>{o ?? 'All'}</a>)}
        </nav>
        {events.error ? <ErrorState message="Couldn’t load the ledger. Nothing was changed." /> : (
          <DataTable caption="Webhook events" columns={evCols} rows={events.data.items} rowKey={(e) => e.id} buildHref={href} nextCursor={encodeCursor(events.data.next_cursor)} density="dense" empty="No events." />
        )}
      </Panel>
    </>
  );
}
