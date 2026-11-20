import { BillingState, listTeamBilling } from '@athleit/db/admin';
import Link from 'next/link';

import { BillingPill, DataTable, PageTitle, decodeCursor, encodeCursor, hrefBuilder, type Column } from '@/components/admin/kit';
import { ErrorState } from '@/components/ui';
import { getAdminContext } from '@/lib/admin/context';
import { one, type SearchParams } from '@/lib/admin/view';
import { createClient } from '@/lib/supabase/server';

const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  await getAdminContext();
  const parsed = BillingState.safeParse(one(sp.state));
  const state = parsed.success ? parsed.data : null;
  const q = one(sp.q)?.trim() || null;
  const res = await listTeamBilling(await createClient(), state, q, 25, decodeCursor(one(sp.cursor)));
  const href = hrefBuilder('/admin/subscriptions', sp);
  type R = NonNullable<typeof res.data>['items'][number];
  const cols: Column<R>[] = [
    { key: 'team', header: 'Team', cell: (r) => r.name },
    { key: 'state', header: 'State', cell: (r) => <BillingPill state={r.state} /> },
    { key: 'trial', header: 'Trial ends', cell: (r) => d(r.trial_ends_at) },
    { key: 'period', header: 'Period ends', cell: (r) => d(r.current_period_end) },
    { key: 'grace', header: 'Grace ends', cell: (r) => d(r.grace_ends_at) },
    { key: 'flags', header: 'Flags', cell: (r) => [r.price_mismatch ? 'Price mismatch' : '', r.cancel_at_period_end ? 'Cancels at period end' : ''].filter(Boolean).join(', ') || '—' },
  ];
  return (
    <>
      <PageTitle title="Subscriptions" sub="Status only. Past due and trials ending soon first: filter by state." />
      <nav aria-label="Filter by state" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <Link href={href({ state: null, cursor: null })} aria-current={!state ? 'page' : undefined}>All</Link>
        {BillingState.options.filter((s) => s !== 'off').map((s) => <Link key={s} href={href({ state: s, cursor: null })} aria-current={state === s ? 'page' : undefined}>{s.replace('_', ' ')}</Link>)}
      </nav>
      <form method="get" role="search"><input type="search" name="q" defaultValue={q ?? ''} placeholder="Search team name" aria-label="Search team name" />{state ? <input type="hidden" name="state" value={state} /> : null} <button type="submit">Search</button></form>
      {res.error ? <ErrorState message="Couldn’t load subscriptions. Nothing was changed." /> : (
        <DataTable caption="Team subscriptions" columns={cols} rows={res.data.items} rowKey={(r) => r.team_id} rowHref={(r) => `/admin/teams/${r.team_id}?tab=subscription`} buildHref={href}
          nextCursor={encodeCursor(res.data.next_cursor)} density={one(sp.density) === 'dense' ? 'dense' : 'comfortable'} empty="No teams in this state." />
      )}
    </>
  );
}
