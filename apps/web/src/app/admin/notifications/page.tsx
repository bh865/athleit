import { getNotificationMetrics, type AdminRange } from '@athleit/db/admin';

import { ChartCard } from '@/components/admin/chart';
import { ChartGrid, PageTitle, hrefBuilder } from '@/components/admin/kit';
import { getAdminContext } from '@/lib/admin/context';
import { parseRange, rangeOptions, shortDate, type SearchParams } from '@/lib/admin/view';
import { createClient } from '@/lib/supabase/server';

const RANGES: AdminRange[] = ['24h', '7d', '30d'];
const STATUS = ['sent', 'pending', 'sending', 'failed', 'skipped'];

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const ctx = await getAdminContext('admin');
  const range = parseRange(sp, RANGES, '7d');
  const res = await getNotificationMetrics(await createClient(), range);
  const cells = res.data?.by_status_channel ?? [];
  const channels = [...new Set(cells.map((c) => c.channel))];
  const failures = res.data?.failures ?? [];
  const ranges = rangeOptions('/admin/notifications', sp, RANGES, range);
  const retry = hrefBuilder('/admin/notifications', sp)({});
  return (
    <>
      <PageTitle title="Notifications" sub="The outbox: what was queued, sent and failed." />
      <ChartGrid>
        <ChartCard
          title="Outbox by status and channel"
          source="notification_outbox"
          asOf={ctx.asOf}
          kind="stacked"
          ranges={ranges}
          labels={STATUS}
          series={channels.map((ch) => ({
            id: ch,
            label: ch.replace('_', ' '),
            data: STATUS.map((s) => cells.find((c) => c.channel === ch && c.status === s)?.n ?? 0),
          }))}
          state={res.error ? 'error' : 'ok'}
          retryHref={retry}
        />
        <ChartCard
          title="Notification failures"
          source="notification_outbox.status = failed"
          asOf={ctx.asOf}
          kind="line"
          ranges={ranges.filter((r) => r.value !== '24h')}
          labels={failures.map((f) => shortDate(f.at))}
          series={[{ id: 'f', label: 'Failures', data: failures.map((f) => f.n ?? 0) }]}
          state={res.error ? 'error' : 'ok'}
          retryHref={retry}
        />
      </ChartGrid>
    </>
  );
}
