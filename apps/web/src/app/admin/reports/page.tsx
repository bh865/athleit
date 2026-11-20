import { listEscalations, listMessageReports } from '@athleit/db/admin';
import Link from 'next/link';

import {
  DataTable,
  PageTitle,
  Panel,
  StatusPill,
  decodeCursor,
  encodeCursor,
  hrefBuilder,
  type Column,
} from '@/components/admin/kit';
import { ReportActions } from '@/components/admin/report-actions';
import { ErrorState } from '@/components/ui';
import { getAdminContext } from '@/lib/admin/context';
import { one, type SearchParams } from '@/lib/admin/view';
import { createClient } from '@/lib/supabase/server';

const STATUSES = ['open', 'actioned', 'dismissed'] as const;

/** Queue only: reason, who reported, who sent. Message bodies are never shown here (only the audited reveal). */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const ctx = await getAdminContext();
  const supabase = await createClient();
  const status = STATUSES.find((s) => s === one(sp.status)) ?? 'open';
  const [reports, esc] = await Promise.all([
    listMessageReports(supabase, status, 25, decodeCursor(one(sp.cursor))),
    listEscalations(supabase),
  ]);
  const href = hrefBuilder('/admin/reports', sp);
  type R = NonNullable<typeof reports.data>['items'][number];
  const cols: Column<R>[] = [
    {
      key: 'when',
      header: 'Reported',
      cell: (r) =>
        new Date(r.created_at).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
    },
    { key: 'reason', header: 'Reason', cell: (r) => r.reason },
    { key: 'reporter', header: 'Reporter', cell: (r) => r.reporter_name ?? '—' },
    { key: 'sender', header: 'Sender', cell: (r) => r.sender_name ?? '—' },
    { key: 'count', header: 'Reports', align: 'right', cell: (r) => r.reports_on_message },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <StatusPill tone={r.status === 'open' ? 'warn' : 'neutral'}>{r.status}</StatusPill>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (r) => <ReportActions reportId={r.id} status={r.status} role={ctx.role} />,
    },
  ];
  return (
    <>
      <PageTitle
        title="Reports"
        sub="Message reports, newest first. Bodies stay hidden unless revealed with a reason."
      />
      {esc.data && esc.data.items.length > 0 ? (
        <Panel
          title={`Escalations (${esc.data.items.length})`}
          source="open for 48 hours, or reported more than once"
        >
          <ul>
            {esc.data.items.slice(0, 5).map((e) => (
              <li key={e.id}>
                {e.overdue ? 'Overdue · ' : ''}
                {e.reports_on_message} reports · {e.reason}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <nav aria-label="Report status" style={{ display: 'flex', gap: 'var(--space-4)' }}>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={href({ status: s, cursor: null })}
            aria-current={status === s ? 'page' : undefined}
          >
            {s[0]!.toUpperCase() + s.slice(1)}
          </Link>
        ))}
      </nav>
      {reports.error ? (
        <ErrorState message="Couldn’t load reports. Nothing was changed." />
      ) : (
        <DataTable
          caption="Message reports"
          columns={cols}
          rows={reports.data.items}
          rowKey={(r) => r.id}
          buildHref={href}
          nextCursor={encodeCursor(reports.data.next_cursor)}
          empty={`No ${status} reports.`}
        />
      )}
    </>
  );
}
