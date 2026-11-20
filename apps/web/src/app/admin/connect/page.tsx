import { getConnectFunnel } from '@athleit/db/admin';

import { ChartCard } from '@/components/admin/chart';
import { ChartGrid, PageTitle, StatTile, TileGrid, hrefBuilder } from '@/components/admin/kit';
import { getAdminContext } from '@/lib/admin/context';
import type { SearchParams } from '@/lib/admin/view';
import { createClient } from '@/lib/supabase/server';

const ORDER = ['not_started', 'in_review', 'needs_info', 'ready', 'disconnected'];

export default async function ConnectPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ctx = await getAdminContext('admin');
  const res = await getConnectFunnel(await createClient());
  const by = res.data?.by_status ?? {};
  return (
    <>
      <PageTitle title="Connect accounts" sub="Where teams and clubs are in Stripe onboarding. Counts only; no account details." />
      <TileGrid>
        <StatTile label="Charges enabled" value={String(res.data?.charges_enabled ?? '—')} />
        <StatTile label="Payouts enabled" value={String(res.data?.payouts_enabled ?? '—')} />
        <StatTile label="Needs information" value={String(by.needs_info ?? 0)} />
      </TileGrid>
      <ChartGrid>
        <ChartCard title="Onboarding funnel" source="connected_accounts.onboarding_status" asOf={ctx.asOf} kind="hbar" labels={ORDER.map((s) => s.replace('_', ' '))}
          series={[{ id: 'n', label: 'Accounts', data: ORDER.map((s) => by[s] ?? 0) }]} state={res.error ? 'error' : 'ok'} retryHref={hrefBuilder('/admin/connect', sp)({})} />
      </ChartGrid>
    </>
  );
}
