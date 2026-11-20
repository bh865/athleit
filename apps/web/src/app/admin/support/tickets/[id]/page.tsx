import { adminGetSupportRequest, adminListCannedReplies } from '@athleit/db/support';
import { notFound } from 'next/navigation';

import {
  BillingPill,
  Crumbs,
  KeyValue,
  PageTitle,
  Panel,
  StatusPill,
  Timeline,
} from '@/components/admin/kit';
import { TicketWorkspace } from '@/components/admin/support/ticket-workspace';
import { ErrorState } from '@/components/ui';
import { getAdminContext } from '@/lib/admin/context';
import { STATUS_LABEL, TYPE_LABEL } from '@/lib/admin/support';
import { createClient } from '@/lib/supabase/server';

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAdminContext();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [res, canned] = await Promise.all([
    adminGetSupportRequest(supabase, id),
    adminListCannedReplies(supabase),
  ]);
  if (res.error) {
    if (res.error.message.includes('unknown_request')) notFound();
    return <ErrorState message="Couldn’t load this ticket. Nothing was changed." />;
  }
  const d = res.data;
  const r = d.request as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : null);
  const diag = (r.diagnostics ?? {}) as Record<string, string>;
  const tags = (r.tags ?? []) as string[];
  const status = str('status') as keyof typeof STATUS_LABEL;
  return (
    <>
      <Crumbs
        items={[{ label: 'Tickets', href: '/admin/support/tickets' }, { label: str('ref') ?? '' }]}
      />
      <PageTitle
        title={str('subject') ?? ''}
        sub={`${str('ref')} · ${TYPE_LABEL[(str('type') ?? 'question') as keyof typeof TYPE_LABEL]}`}
      />
      <div
        style={{
          display: 'grid',
          gap: 'var(--space-6)',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, calc(var(--size-sidebar-width) * 1.2))',
        }}
      >
        <TicketWorkspace
          id={id}
          role={ctx.role}
          myId={ctx.userId}
          status={status}
          priority={(str('priority') ?? 'normal') as 'low' | 'normal' | 'high' | 'urgent'}
          held={r.held === true}
          messages={d.messages}
          attachments={d.attachments}
          canned={canned.data?.items.filter((c) => c.active) ?? []}
          tags={tags}
          articleSlug={str('source_article')}
        />
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Panel title="Requester">
            <KeyValue
              rows={[
                { k: 'Name', v: d.requester.name ?? '—' },
                { k: 'Email', v: d.requester.email ?? '—' },
                { k: 'Account', v: d.requester.signed_in ? 'Signed in' : 'Signed out' },
                { k: 'Past tickets', v: String(d.requester.past_requests) },
                ...(d.requester.profile_id
                  ? [
                      {
                        k: 'Person',
                        v: <a href={`/admin/people/${d.requester.profile_id}`}>Open person</a>,
                      },
                    ]
                  : []),
              ]}
            />
          </Panel>
          <Panel title="Status">
            <KeyValue
              rows={[
                { k: 'Status', v: <StatusPill tone="info">{STATUS_LABEL[status]}</StatusPill> },
                { k: 'Assignee', v: d.assignee_name ?? 'Unassigned' },
                { k: 'Overdue', v: d.overdue ? 'Yes' : 'No' },
                ...(d.team
                  ? [
                      { k: 'Team', v: <a href={`/admin/teams/${d.team.id}`}>{d.team.name}</a> },
                      {
                        k: 'Billing',
                        v: d.team.billing_state ? (
                          <BillingPill state={d.team.billing_state} />
                        ) : (
                          '—'
                        ),
                      },
                    ]
                  : []),
                ...(d.club
                  ? [{ k: 'Club', v: <a href={`/admin/clubs/${d.club.id}`}>{d.club.name}</a> }]
                  : []),
              ]}
            />
          </Panel>
          <Panel title="Diagnostics">
            <KeyValue
              rows={
                Object.keys(diag).length
                  ? Object.entries(diag).map(([k, v]) => ({ k, v: String(v), mono: true }))
                  : [{ k: 'Sent', v: 'None' }]
              }
            />
          </Panel>
          <Panel title="Related tickets">
            {d.related.length ? (
              <ul>
                {d.related.map((x) => (
                  <li key={x.id}>
                    <a href={`/admin/support/tickets/${x.id}`}>{x.ref}</a> {x.subject}
                  </li>
                ))}
              </ul>
            ) : (
              <p>None.</p>
            )}
          </Panel>
          <Panel title="Activity">
            <Timeline
              items={d.events.map((e) => ({
                title: e.kind.replace('_', ' '),
                meta: `${e.actor_name ?? 'System'} · ${new Date(e.at).toLocaleString()}`,
              }))}
              empty="No activity yet."
            />
          </Panel>
        </aside>
      </div>
    </>
  );
}
