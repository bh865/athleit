import { listTeams } from '@athleit/db/admin';

import {
  BillingPill,
  DataTable,
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

type Row = NonNullable<Awaited<ReturnType<typeof listTeams>>['data']>['items'][number];
const PAGE = 25;

export default async function TeamsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  await getAdminContext();
  const q = one(sp.q)?.trim() || null;
  const res = await listTeams(await createClient(), q, PAGE, decodeCursor(one(sp.cursor)));
  const href = hrefBuilder('/admin/teams', sp);
  const cols: Column<Row>[] = [
    { key: 'name', header: 'Team', cell: (r) => r.name },
    { key: 'sport', header: 'Sport', cell: (r) => `${r.sport} · ${r.season_label}` },
    { key: 'club', header: 'Club', cell: (r) => r.club_name ?? '—' },
    { key: 'members', header: 'Members', align: 'right', cell: (r) => r.members },
    { key: 'billing', header: 'Billing', cell: (r) => <BillingPill state={r.billing_state} /> },
    {
      key: 'created',
      header: 'Created',
      cell: (r) =>
        new Date(r.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
    },
  ];
  return (
    <>
      <PageTitle title="Teams" sub="Newest first. Search by team name." />
      <form method="get" role="search">
        <label>
          <span className="visually-hidden">Search teams</span>
          <input type="search" name="q" defaultValue={q ?? ''} placeholder="Search teams" />
        </label>{' '}
        <button type="submit">Search</button>
      </form>
      {res.error ? (
        <ErrorState message="Couldn’t load teams. Nothing was changed." />
      ) : (
        <DataTable
          caption="Teams"
          columns={cols}
          rows={res.data.items}
          rowKey={(r) => r.id}
          rowHref={(r) => `/admin/teams/${r.id}`}
          buildHref={href}
          nextCursor={encodeCursor(res.data.next_cursor)}
          density={one(sp.density) === 'dense' ? 'dense' : 'comfortable'}
          empty={q ? `No teams match “${q}”.` : 'No teams yet.'}
        />
      )}
    </>
  );
}
