import { listClubs } from '@athleit/db/admin';

import {
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

export default async function ClubsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  await getAdminContext();
  const q = one(sp.q)?.trim() || null;
  const res = await listClubs(await createClient(), q, 25, decodeCursor(one(sp.cursor)));
  type R = NonNullable<typeof res.data>['items'][number];
  const cols: Column<R>[] = [
    { key: 'name', header: 'Club', cell: (r) => r.name },
    { key: 'slug', header: 'Slug', cell: (r) => <code>{r.slug}</code> },
    { key: 'teams', header: 'Teams', align: 'right', cell: (r) => r.teams },
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
      <PageTitle title="Clubs" />
      <form method="get" role="search">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search clubs"
          aria-label="Search clubs"
        />{' '}
        <button type="submit">Search</button>
      </form>
      {res.error ? (
        <ErrorState message="Couldn’t load clubs. Nothing was changed." />
      ) : (
        <DataTable
          caption="Clubs"
          columns={cols}
          rows={res.data.items}
          rowKey={(r) => r.id}
          rowHref={(r) => `/admin/clubs/${r.id}`}
          buildHref={hrefBuilder('/admin/clubs', sp)}
          nextCursor={encodeCursor(res.data.next_cursor)}
          empty="No clubs."
        />
      )}
    </>
  );
}
