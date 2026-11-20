import { getPaymentMetrics, type AdminRange } from '@athleit/db/admin';
import Link from 'next/link';

import { ChartCard } from '@/components/admin/chart';
import { ChartGrid, PageTitle, hrefBuilder } from '@/components/admin/kit';
import { getAdminContext } from '@/lib/admin/context';
import { bucketFor, parseRange, rangeOptions, toSeries, type SearchParams } from '@/lib/admin/view';
import { createClient } from '@/lib/supabase/server';

const RANGES: AdminRange[] = ['7d', '30d', '90d', '12m'];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ctx = await getAdminContext('admin');
  const range = parseRange(sp, RANGES, '30d');
  const bucket = bucketFor(range);
  const res = await getPaymentMetrics(await createClient(), range, bucket);
  const ranges = rangeOptions('/admin/payments', sp, RANGES, range);
  const retry = hrefBuilder('/admin/payments', sp)({});
  const fees = res.data ? toSeries(res.data.fee_revenue, 'cents', bucket) : { labels: [], data: [] };
  const vol = res.data ? toSeries(res.data.volume, 'cents', bucket) : { labels: [], data: [] };
  const status = Object.entries(res.data?.by_status ?? {});
  const err = res.error ? 'error' : 'ok';
  return (
    <>
      <PageTitle title="Payments and fees" sub={<>Money moves on teams’ connected accounts. The fee configuration lives in <Link href="/admin/settings">Settings</Link>.</>} />
      <ChartGrid>
        <ChartCard title="Fee revenue" source="payments.platform_fee_cents" asOf={ctx.asOf} kind="bar" money ranges={ranges} labels={fees.labels} series={[{ id: 'fees', label: 'Fee revenue', data: fees.data }]} state={err} retryHref={retry} />
        <ChartCard title="Payment volume" source="payments.total_charged_cents" asOf={ctx.asOf} kind="line" money ranges={ranges} labels={vol.labels} series={[{ id: 'vol', label: 'Volume', data: vol.data }]} state={err} retryHref={retry} />
        <ChartCard title="Payments by status" source="payments.status" asOf={ctx.asOf} kind="hbar" ranges={ranges} labels={status.map(([k]) => k.replace(/_/g, ' '))} series={[{ id: 'n', label: 'Payments', data: status.map(([, n]) => n) }]} state={err} retryHref={retry} />
      </ChartGrid>
    </>
  );
}
