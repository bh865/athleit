import { canSeeMoney, formatCents } from '@athleit/core';
import { getTeam, getTeamBillingDetail, listTeamPayments } from '@athleit/db/admin';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { NoteForm, TeamActions } from '@/components/admin/team-actions';
import { BillingPill, Crumbs, DataTable, DiffView, KeyValue, PageTitle, Panel, Timeline, hrefBuilder, type Column } from '@/components/admin/kit';
import { Text } from '@/components/ui';
import { getAdminContext } from '@/lib/admin/context';
import { one, type SearchParams } from '@/lib/admin/view';
import { createClient } from '@/lib/supabase/server';

const d = (iso: unknown) => (typeof iso === 'string' ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const s = (v: unknown) => (typeof v === 'string' && v ? v : '—');

export default async function TeamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await getAdminContext();
  const supabase = await createClient();
  const money = canSeeMoney(ctx.role);
  const tabs = [['overview', 'Overview'], ['subscription', 'Subscription'], ...(money ? [['payments', 'Payments']] : []), ['activity', 'Activity']] as const;
  const requested = one(sp.tab) ?? 'overview';
  const tab = tabs.some(([k]) => k === requested) ? requested : 'overview';

  const team = await getTeam(supabase, id);
  if (team.error || !team.data) notFound();
  const t = team.data.team;
  const href = hrefBuilder(`/admin/teams/${id}`, sp);

  return (
    <>
      <Crumbs items={[{ label: 'Customers' }, { label: 'Teams', href: '/admin/teams' }, { label: t.name }]} />
      <PageTitle title={t.name} sub={`${t.sport} · ${t.season_label} · Created ${d(t.created_at)}`} actions={<BillingPill state={t.billing_state} />} />
      <nav aria-label="Team sections" style={{ display: 'flex', gap: 'var(--space-4)' }}>
        {tabs.map(([k, label]) => <Link key={k} href={href({ tab: k })} aria-current={tab === k ? 'page' : undefined}>{label}</Link>)}
      </nav>

      {tab === 'overview' && (
        <>
          <Panel title="Team" source="teams, team_memberships">
            <KeyValue rows={[
              { k: 'Name', v: t.name }, { k: 'Sport and season', v: `${t.sport} · ${t.season_label}` },
              { k: 'Club', v: t.club ? <Link href={`/admin/clubs/${t.club.id}`}>{t.club.name}</Link> : '—' },
              { k: 'Created', v: d(t.created_at) },
              { k: 'Team administrators', v: team.data.staff.length ? team.data.staff.map((p) => `${p.name} · ${p.role}`).join(', ') : '—' },
              { k: 'Members', v: Object.entries(team.data.member_counts).map(([r, n]) => `${n} ${r}`).join(', ') || '—' },
              { k: 'Join code', v: 'Active · code not shown here' },
            ]} />
          </Panel>
          <Panel title="Support notes" source="admin_notes">
            <Timeline items={team.data.notes.map((n) => ({ title: n.note, meta: `${n.author ?? 'Unknown'} · ${d(n.at)}` }))} empty="No notes yet." />
            <NoteForm subjectType="team" subjectId={id} />
          </Panel>
        </>
      )}

      {tab === 'subscription' && <Subscription teamId={id} role={ctx.role} />}

      {tab === 'payments' && money && <Payments teamId={id} sp={sp} />}

      {tab === 'activity' && (
        <Panel title="Activity" source="audit_log">
          <Timeline empty="No activity recorded." items={team.data.activity.map((a) => ({
            title: a.action, meta: new Date(a.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
            body: a.before || a.after ? <DiffView before={a.before} after={a.after} /> : undefined,
          }))} />
        </Panel>
      )}
    </>
  );

  async function Subscription({ teamId, role }: { teamId: string; role: typeof ctx.role }) {
    const res = await getTeamBillingDetail(supabase, teamId);
    if (res.error) return <Text variant="body">Couldn’t load the subscription. Nothing was changed.</Text>;
    if (!res.data) return <Panel title="Subscription"><Text variant="body" muted>Team billing is off for this team: it has full access and no billing record.</Text></Panel>;
    const b = res.data.billing;
    const price = res.data.price_version as { amount_cents?: number } | null;
    const inv = res.data.invoices;
    return (
      <>
        {res.data.state === 'past_due' ? <Panel><Text variant="body"><strong>Payment failed.</strong> The team keeps full access until {d(b.grace_ends_at)}, then access is restricted.</Text></Panel> : null}
        {b.price_mismatch === true ? <Panel><Text variant="body"><strong>Price mismatch.</strong> Stripe charged a different price than the one this team locked. It is not accepted silently.</Text></Panel> : null}
        <Panel title="Subscription" source="admin_get_team_billing(team)">
          <KeyValue rows={[
            { k: 'State', v: <BillingPill state={res.data.state} /> },
            { k: 'Locked price', v: price?.amount_cents ? `${formatCents(price.amount_cents)} / month` : '—', mono: true },
            { k: 'Trial', v: `${d(b.trial_started_at)} → ${d(b.trial_ends_at)}` },
            { k: 'Current period end', v: d(b.current_period_end) },
            { k: 'Cancel at period end', v: b.cancel_at_period_end ? 'Yes' : 'No' },
            { k: 'Past due since', v: d(b.past_due_since) }, { k: 'Grace ends', v: d(b.grace_ends_at) },
            { k: 'Comp', v: b.comped ? `Comped until ${b.comp_until ? d(b.comp_until) : 'further notice'}` : 'Not comped' },
            { k: 'Stripe customer', v: s(b.stripe_customer_id), mono: true },
            { k: 'Stripe subscription', v: s(b.stripe_subscription_id), mono: true },
            { k: 'Stripe status', v: s(b.stripe_status) }, { k: 'Price mismatch', v: b.price_mismatch ? 'Yes' : 'No' },
          ]} />
        </Panel>
        <Panel title="Invoices" source="team_billing_invoices">
          {inv.length === 0 ? <Text variant="body" muted>No invoices yet.</Text> : (
            <table><thead><tr><th scope="col">Invoice</th><th scope="col">Date</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead>
              <tbody>{inv.map((i) => <tr key={s(i.stripe_invoice_id)}><td>{s(i.invoice_number ?? i.stripe_invoice_id)}</td><td>{d(i.period_start)}</td><td>{typeof i.amount_due_cents === 'number' ? formatCents(i.amount_due_cents) : '—'}</td><td>{s(i.status)}</td></tr>)}</tbody></table>
          )}
        </Panel>
        <Panel title="Billing timeline" source="audit_log">
          <Timeline empty="No billing events yet." items={res.data.events.map((e) => ({ title: e.action, meta: d(e.at) }))} />
        </Panel>
        <Panel title="Admin actions">
          <TeamActions teamId={teamId} role={role} trialEndsAt={typeof b.trial_ends_at === 'string' ? b.trial_ends_at : null} comped={b.comped === true} compUntil={typeof b.comp_until === 'string' ? b.comp_until : null} />
        </Panel>
      </>
    );
  }

  async function Payments({ teamId, sp: q }: { teamId: string; sp: SearchParams }) {
    const res = await listTeamPayments(supabase, teamId, 25, null);
    type R = NonNullable<typeof res.data>['items'][number];
    const cols: Column<R>[] = [
      { key: 'receipt', header: 'Receipt', cell: (r) => r.receipt_display_id ?? '—' },
      { key: 'status', header: 'Status', cell: (r) => r.status },
      { key: 'base', header: 'Base', align: 'right', cell: (r) => formatCents(r.base_cents) },
      { key: 'fee', header: 'Athleit fee', align: 'right', cell: (r) => formatCents(r.platform_fee_cents) },
      { key: 'total', header: 'Total', align: 'right', cell: (r) => formatCents(r.total_charged_cents) },
      { key: 'date', header: 'Date', cell: (r) => d(r.created_at) },
    ];
    if (res.error) return <Text variant="body">Couldn’t load payments. Nothing was changed.</Text>;
    return <DataTable caption="Team payments" columns={cols} rows={res.data.items} rowKey={(r) => r.id} buildHref={hrefBuilder(`/admin/teams/${teamId}`, q)} empty="No payments yet." />;
  }
}
