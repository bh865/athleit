import { getPaymentMetrics, type AdminRange } from '@athleit/db/admin';

import { PageTitle, Panel, StatTile, TileGrid } from '@/components/admin/kit';
import { Text } from '@/components/ui';
import { getAdminContext } from '@/lib/admin/context';
import { parseRange, type SearchParams } from '@/lib/admin/view';
import { createClient } from '@/lib/supabase/server';

const RANGES: AdminRange[] = ['30d', '90d', '12m'];

/** Counts from the payment ledger and the Stripe event ledger. There is no per-dispute table yet. */
export default async function DisputesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  await getAdminContext();
  const range = parseRange(sp, RANGES, '90d');
  const res = await getPaymentMetrics(await createClient(), range, 'month');
  return (
    <>
      <PageTitle title="Disputes and refunds" sub={`Last ${range}. Counts only.`} />
      <TileGrid>
        <StatTile label="Refunds" value={String(res.data?.refunds ?? '—')} />
        <StatTile label="Disputes opened" value={String(res.data?.disputes ?? '—')} />
      </TileGrid>
      <Panel title="Dispute queue"><Text variant="body" muted>Individual disputes are recorded as Stripe events (see Jobs and webhooks). A per-dispute queue needs a dispute table, which does not exist yet.</Text></Panel>
    </>
  );
}
