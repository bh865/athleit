import {
  adminListSupportRequests,
  SUPPORT_VIEWS,
  type AdminSupportRow,
  type SupportView,
} from '@athleit/db/support';
import Link from 'next/link';

import { DataTable, PageTitle, StatusPill, hrefBuilder, type Column } from '@/components/admin/kit';
import { TicketKeys } from '@/components/admin/support/ticket-keys';
import { ErrorState } from '@/components/ui';
import { getAdminContext } from '@/lib/admin/context';
import { STATUS_LABEL, TYPE_LABEL } from '@/lib/admin/support';
import { one, type SearchParams } from '@/lib/admin/view';
import { createClient } from '@/lib/supabase/server';

const VIEW_LABEL: Record<SupportView, string> = {
  mine: 'Mine',
  unassigned: 'Unassigned',
  waiting: 'Waiting on requester',
  billing: 'Billing',
  ideas: 'Ideas',
  overdue: 'Overdue',
  held: 'Held for review',
  spam: 'Spam',
};
const PAGE = 25;

const age = (iso: string) => {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
};

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  await getAdminContext();
  const supabase = await createClient();
  const view = SUPPORT_VIEWS.find((v) => v === one(sp.view)) ?? null;
  const q = one(sp.q)?.slice(0, 100) || null;
  const res = await adminListSupportRequests(supabase, {
    view,
    search: q,
    cursor: one(sp.cursor) ?? null,
    limit: PAGE,
  });
  const href = hrefBuilder('/admin/support/tickets', sp);
  const rows = res.data?.items ?? [];
  const cols: Column<AdminSupportRow>[] = [
    {
      key: 'ref',
      header: 'Reference',
      cell: (r) => (
        <Link data-ticket href={`/admin/support/tickets/${r.id}`}>
          <code>{r.ref}</code>
        </Link>
      ),
    },
    { key: 'subject', header: 'Subject', cell: (r) => r.subject },
    { key: 'type', header: 'Type', cell: (r) => TYPE_LABEL[r.type] },
    {
      key: 'requester',
      header: 'Requester',
      cell: (r) =>
        r.signed_in
          ? `${r.requester_name ?? 'Unnamed'}${r.requester_role ? ` (${r.requester_role})` : ''}`
          : 'Signed-out',
    },
    { key: 'team', header: 'Team', cell: (r) => r.team_name ?? '—' },
    {
      key: 'priority',
      header: 'Priority',
      cell: (r) => (
        <StatusPill tone={r.priority === 'urgent' || r.priority === 'high' ? 'bad' : 'neutral'}>
          {r.priority}
        </StatusPill>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <StatusPill
          tone={
            r.status === 'new'
              ? 'info'
              : r.status === 'solved' || r.status === 'closed'
                ? 'ok'
                : 'warn'
          }
        >
          {STATUS_LABEL[r.status]}
        </StatusPill>
      ),
    },
    { key: 'assignee', header: 'Assignee', cell: (r) => r.assignee_name ?? '—' },
    { key: 'age', header: 'Age', cell: (r) => age(r.created_at) },
    {
      key: 'first',
      header: 'First reply',
      cell: (r) =>
        r.first_reply_at ? (
          `${Math.max(1, Math.round((new Date(r.first_reply_at).getTime() - new Date(r.created_at).getTime()) / 3_600_000))}h`
        ) : r.overdue ? (
          <StatusPill tone="bad">Overdue</StatusPill>
        ) : (
          '—'
        ),
    },
  ];
  return (
    <>
      <PageTitle
        title="Tickets"
        sub={
          res.data
            ? `First reply target ${res.data.first_reply_target_hours} hours (a staff target, never promised to requesters). J and K move, Enter opens.`
            : undefined
        }
      />
      <nav
        aria-label="Saved views"
        style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}
      >
        <Link
          href={href({ view: null, cursor: null })}
          aria-current={view === null ? 'page' : undefined}
        >
          All
        </Link>
        {SUPPORT_VIEWS.map((v) => (
          <Link
            key={v}
            href={href({ view: v, cursor: null })}
            aria-current={view === v ? 'page' : undefined}
          >
            {VIEW_LABEL[v]}
          </Link>
        ))}
      </nav>
      <form action="/admin/support/tickets" role="search">
        {view ? <input type="hidden" name="view" value={view} /> : null}
        <label htmlFor="tq" style={{ position: 'absolute', clipPath: 'inset(50%)' }}>
          Search reference, email, subject or team
        </label>
        <input
          id="tq"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Reference, email, subject or team"
        />
      </form>
      {res.error ? (
        <ErrorState message="Couldn’t load tickets. Nothing was changed." />
      ) : (
        <>
          <TicketKeys />
          <DataTable
            caption="Support tickets"
            columns={cols}
            rows={rows}
            rowKey={(r) => r.id}
            buildHref={href}
            nextCursor={rows.length === PAGE ? rows[rows.length - 1]!.last_activity_at : null}
            empty="No tickets match."
          />
        </>
      )}
    </>
  );
}
