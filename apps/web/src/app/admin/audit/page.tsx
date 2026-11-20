import { listAudit, type AuditFilters } from '@athleit/db/admin';

import {
  DataTable,
  DiffView,
  PageTitle,
  decodeCursor,
  encodeCursor,
  hrefBuilder,
  type Column,
} from '@/components/admin/kit';
import { ErrorState } from '@/components/ui';
import { getAdminContext } from '@/lib/admin/context';
import { one, type SearchParams } from '@/lib/admin/view';
import { createClient } from '@/lib/supabase/server';

type Row = NonNullable<Awaited<ReturnType<typeof listAudit>>['data']>['items'][number];

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  await getAdminContext();
  const source = one(sp.source);
  const action = one(sp.action)?.trim();
  const filters: AuditFilters = {
    ...(source === 'platform' || source === 'team' ? { source } : {}),
    ...(action ? { action } : {}),
  };
  const res = await listAudit(await createClient(), filters, 25, decodeCursor(one(sp.cursor)));
  const href = hrefBuilder('/admin/audit', sp);
  const cols: Column<Row>[] = [
    {
      key: 'at',
      header: 'When',
      cell: (r) =>
        new Date(r.at).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
    },
    { key: 'actor', header: 'Actor', cell: (r) => r.actor_name ?? r.actor_id ?? 'System' },
    { key: 'src', header: 'Log', cell: (r) => (r.src === 'platform' ? 'Platform' : 'Team') },
    { key: 'action', header: 'Action', cell: (r) => r.action },
    {
      key: 'target',
      header: 'Target',
      cell: (r) => `${r.target_type}${r.target_id ? ` · ${r.target_id.slice(0, 8)}` : ''}`,
    },
    { key: 'reason', header: 'Reason', cell: (r) => r.reason ?? '—' },
    {
      key: 'diff',
      header: 'Change',
      cell: (r) =>
        r.before || r.after ? (
          <details>
            <summary>Before and after</summary>
            <DiffView before={r.before} after={r.after} />
          </details>
        ) : (
          '—'
        ),
    },
  ];
  return (
    <>
      <PageTitle title="Audit" sub="Platform actions and team activity, newest first." />
      <form method="get" role="search">
        <label>
          Log{' '}
          <select name="source" defaultValue={source ?? ''}>
            <option value="">All</option>
            <option value="platform">Platform</option>
            <option value="team">Team</option>
          </select>
        </label>{' '}
        <label>
          Action starts with{' '}
          <input type="text" name="action" defaultValue={action ?? ''} placeholder="billing." />
        </label>{' '}
        <button type="submit">Filter</button>
      </form>
      {res.error ? (
        <ErrorState message="Couldn’t load the audit log. Nothing was changed." />
      ) : (
        <DataTable
          caption="Audit log"
          columns={cols}
          rows={res.data.items}
          rowKey={(r) => `${r.src}:${r.id_text}`}
          buildHref={href}
          nextCursor={encodeCursor(res.data.next_cursor)}
          density={one(sp.density) === 'dense' ? 'dense' : 'comfortable'}
          empty="No audit entries match."
        />
      )}
    </>
  );
}
