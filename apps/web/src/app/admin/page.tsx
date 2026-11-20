import { canSeeMoney, formatCents } from '@athleit/core';
import {
  getBillingMetrics,
  getBillingSnapshots,
  getPaymentMetrics,
  getPlatformMetrics,
  type AdminRange,
} from '@athleit/db/admin';

import { ChartCard, Spark } from '@/components/admin/chart';
import {
  BillingPill,
  ChartGrid,
  Cluster,
  PageTitle,
  Panel,
  StatTile,
  TileGrid,
  hrefBuilder,
} from '@/components/admin/kit';
import { getAdminContext } from '@/lib/admin/context';
import {
  bucketFor,
  parseRange,
  rangeOptions,
  shortDate,
  toSeries,
  type SearchParams,
} from '@/lib/admin/view';
import { createClient } from '@/lib/supabase/server';

const RANGES: AdminRange[] = ['7d', '30d', '90d', '12m'];
const STATES = [
  'trialing',
  'active',
  'cancel_scheduled',
  'past_due',
  'trial_expired',
  'lapsed',
  'comped',
] as const;

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const ctx = await getAdminContext();
  const supabase = await createClient();
  const range = parseRange(sp, RANGES, '90d');
  const bucket = bucketFor(range);
  const money = canSeeMoney(ctx.role);

  const [billing, platform, snaps, payments] = await Promise.all([
    getBillingMetrics(supabase),
    getPlatformMetrics(supabase, range, bucket),
    getBillingSnapshots(supabase, range === '7d' ? '30d' : range),
    money ? getPaymentMetrics(supabase, range, bucket) : Promise.resolve(null),
  ]);
  const href = hrefBuilder('/admin', sp);
  const ranges = rangeOptions('/admin', sp, RANGES, range);
  const asOf = ctx.asOf;
  const time = new Date(asOf).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const mode = ctx.stripeMode === 'live' ? 'live mode' : 'test mode';
  const b = billing.data;
  const teamsSeries = platform.data ? toSeries(platform.data.teams_created, 'n', bucket) : null;
  const accountsSeries = platform.data
    ? toSeries(platform.data.accounts_created, 'n', bucket)
    : null;

  const days = snaps.data?.items ?? [];
  const historyThin = days.length < 2;

  return (
    <>
      <PageTitle title="Overview" sub="Read only. Everything here is as of the time shown." />
      <TileGrid>
        <StatTile
          label="Teams"
          value={String(platform.data?.totals.teams ?? '—')}
          sr={`Teams, ${platform.data?.totals.teams ?? 'unavailable'}, as of ${time}, ${mode}`}
          href="/admin/teams"
          spark={teamsSeries ? <Spark data={teamsSeries.data} /> : undefined}
        />
        <StatTile
          label="Accounts"
          value={String(platform.data?.totals.accounts ?? '—')}
          sr={`Accounts, ${platform.data?.totals.accounts ?? 'unavailable'}, as of ${time}, ${mode}`}
          spark={accountsSeries ? <Spark data={accountsSeries.data} /> : undefined}
        />
        <StatTile
          label="MRR"
          value={b ? formatCents(b.mrr_cents) : '—'}
          sr={`Monthly recurring revenue, ${b ? formatCents(b.mrr_cents) : 'unavailable'}, as of ${time}, ${mode}`}
          href="/admin/subscriptions"
        />
        <StatTile
          label="Trials ending in 7 days"
          value={String(b?.trials_ending_7d ?? '—')}
          sr={`Trials ending in 7 days, ${b?.trials_ending_7d ?? 'unavailable'} teams, as of ${time}, ${mode}`}
          href="/admin/subscriptions?state=trialing"
        />
        <StatTile
          label="Past due"
          value={String(b?.past_due ?? '—')}
          sub="teams"
          sr={`Past due, ${b?.past_due ?? 'unavailable'} teams, as of ${time}, ${mode}`}
          href="/admin/subscriptions?state=past_due"
        />
      </TileGrid>

      <ChartGrid>
        <ChartCard
          title="New teams"
          source="teams.created_at"
          asOf={asOf}
          kind="bar"
          ranges={ranges}
          labels={teamsSeries?.labels ?? []}
          series={[{ id: 'teams', label: 'New teams', data: teamsSeries?.data ?? [] }]}
          state={platform.error ? 'error' : 'ok'}
          retryHref={href({})}
        />
        <ChartCard
          title="New accounts"
          source="profiles.created_at"
          asOf={asOf}
          kind="bar"
          ranges={ranges}
          labels={accountsSeries?.labels ?? []}
          series={[{ id: 'accounts', label: 'New accounts', data: accountsSeries?.data ?? [] }]}
          state={platform.error ? 'error' : 'ok'}
          retryHref={href({})}
        />
        <ChartCard
          title="Teams by billing state"
          source="admin_billing_metrics"
          asOf={asOf}
          kind="hbar"
          labels={STATES.map((s) => s.replace('_', ' '))}
          series={[
            { id: 'teams', label: 'Teams', data: STATES.map((s) => b?.teams_by_state[s] ?? 0) },
          ]}
          state={billing.error ? 'error' : 'ok'}
          retryHref={href({})}
        />
        <ChartCard
          title="MRR over time"
          source="billing_daily_snapshots"
          asOf={asOf}
          kind="line"
          money
          labels={days.map((d) => shortDate(d.day))}
          series={[{ id: 'mrr', label: 'MRR', data: days.map((d) => d.mrr_cents) }]}
          state={snaps.error ? 'error' : 'ok'}
          retryHref={href({})}
        />
        {money && payments ? (
          <>
            <ChartCard
              title="Fee revenue"
              source="payments.platform_fee_cents"
              asOf={asOf}
              kind="bar"
              money
              ranges={ranges}
              labels={
                payments.data ? toSeries(payments.data.fee_revenue, 'cents', bucket).labels : []
              }
              series={[
                {
                  id: 'fees',
                  label: 'Fee revenue',
                  data: payments.data
                    ? toSeries(payments.data.fee_revenue, 'cents', bucket).data
                    : [],
                },
              ]}
              state={payments.error ? 'error' : 'ok'}
              retryHref={href({})}
            />
            <ChartCard
              title="Payment volume"
              source="payments"
              asOf={asOf}
              kind="line"
              money
              ranges={ranges}
              labels={payments.data ? toSeries(payments.data.volume, 'cents', bucket).labels : []}
              series={[
                {
                  id: 'volume',
                  label: 'Volume',
                  data: payments.data ? toSeries(payments.data.volume, 'cents', bucket).data : [],
                },
              ]}
              state={payments.error ? 'error' : 'ok'}
              retryHref={href({})}
            />
          </>
        ) : null}
      </ChartGrid>
      {historyThin && !snaps.error ? (
        <Panel>
          <p>History starts when daily snapshots begin.</p>
        </Panel>
      ) : null}
      <Panel title="States at a glance">
        <Cluster>
          {STATES.map((s) => (
            <span key={s}>
              <BillingPill state={s} /> {b?.teams_by_state[s] ?? 0}
            </span>
          ))}
        </Cluster>
      </Panel>
    </>
  );
}
