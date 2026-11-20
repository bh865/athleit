import { searchPeople } from '@athleit/db/admin';

import { DataTable, PageTitle, type Column } from '@/components/admin/kit';
import { EmptyState, ErrorState } from '@/components/ui';
import { getAdminContext } from '@/lib/admin/context';
import { one, type SearchParams } from '@/lib/admin/view';
import { createClient } from '@/lib/supabase/server';

/** Search only: there is no browse list of people. Every search is logged and rate limited by the database. */
export default async function PeoplePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  await getAdminContext();
  const q = one(sp.q)?.trim() ?? '';
  const res = q.length >= 3 ? await searchPeople(await createClient(), q) : null;
  type R = NonNullable<NonNullable<typeof res>['data']>['items'][number];
  const cols: Column<R>[] = [
    { key: 'name', header: 'Name', cell: (r) => r.name },
    { key: 'email', header: 'Email', cell: (r) => r.email ?? '—' },
    { key: 'phone', header: 'Phone', cell: (r) => r.phone_masked ?? '—' },
    { key: 'teams', header: 'Team roles', align: 'right', cell: (r) => r.team_roles },
    { key: 'hh', header: 'Households', align: 'right', cell: (r) => r.households },
  ];
  return (
    <>
      <PageTitle title="People" sub="Search by email, name, phone fragment, family code, team code or id. Searches are logged." />
      <form method="get" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Email, name, phone, code or id" aria-label="Search people" minLength={3} maxLength={100} autoFocus />{' '}
        <button type="submit">Search</button>
      </form>
      {!res ? <EmptyState icon="magnifying-glass" title="Search for a person" body="Type at least 3 characters." />
        : res.error ? <ErrorState message="Couldn’t search. Nothing was changed." />
        : res.data.rate_limited ? <ErrorState message="You’re searching too fast. Wait a minute and try again." />
        : res.data.items.length === 0 ? <EmptyState icon="magnifying-glass" title="No one found" body={`Nothing matches “${q}”.`} />
        : <DataTable caption="People results" columns={cols} rows={res.data.items} rowKey={(r) => r.profile_id} rowHref={(r) => `/admin/people/${r.profile_id}`} buildHref={() => `/admin/people?q=${encodeURIComponent(q)}`} />}
    </>
  );
}
