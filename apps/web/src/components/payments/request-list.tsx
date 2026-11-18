'use client';

import {
  collectionState,
  collectionStateLabel,
  audienceLabel,
  formatCents,
  type CollectionState,
} from '@athleit/core';
import type { CollectionSummary, PaymentEventRow } from '@athleit/db/payments';
import { useMemo, useState } from 'react';

import { Button, Icon, Text } from '@/components/ui';

import { Amount } from './money';
import styles from './payments.module.css';
import { StatusPill, type PillTone } from './status-pill';

export type Summaries = Record<string, CollectionSummary | null>;
type Tab = 'open' | 'closed' | 'all';
const PAGE = 8;

export const stateView: Record<
  CollectionState,
  { tone: PillTone; icon: 'circle-dashed' | 'clock' | 'warning' | 'check-circle' }
> = {
  open: { tone: 'neutral', icon: 'circle-dashed' },
  due_soon: { tone: 'warn', icon: 'clock' },
  overdue: { tone: 'bad', icon: 'warning' },
  closed: { tone: 'ok', icon: 'check-circle' },
};

export const eventState = (e: PaymentEventRow, s: CollectionSummary | null | undefined) =>
  collectionState({
    status: e.status,
    dueAt: e.due_at,
    outstandingCents: Number(s?.outstanding_cents ?? 0),
    totalRequests: s?.total_requests ?? 0,
  });

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** The four stat tiles above the list: totals across the open requests. */
export function StatTiles({ events, sums }: { events: PaymentEventRow[]; sums: Summaries }) {
  const open = events.filter((e) => eventState(e, sums[e.id]).state !== 'closed');
  const total = (k: 'outstanding_cents' | 'collected_cents') =>
    open.reduce((n, e) => n + Number(sums[e.id]?.[k] ?? 0), 0);
  const soon = open.filter((e) => eventState(e, sums[e.id]).state === 'due_soon').length;
  const overdue = open.filter((e) => eventState(e, sums[e.id]).state === 'overdue');
  const first = overdue[0];
  return (
    <div className={styles.stats} data-testid="stats">
      <div className={styles.stat}>
        <Text variant="label" muted>
          Outstanding
        </Text>
        <Amount cents={total('outstanding_cents')} variant="monoLg" label="Outstanding" />
        <Text variant="caption" muted>
          across {open.length} open {open.length === 1 ? 'request' : 'requests'}
        </Text>
      </div>
      <div className={styles.stat}>
        <Text variant="label" muted>
          Collected
        </Text>
        <Amount cents={total('collected_cents')} variant="monoLg" label="Collected" />
        <Text variant="caption" muted>
          open requests
        </Text>
      </div>
      <div className={styles.stat}>
        <Text variant="label" muted>
          Open requests
        </Text>
        <Text variant="monoLg">{open.length}</Text>
        <Text variant="caption" muted>
          {soon} due this week
        </Text>
      </div>
      <div className={styles.stat}>
        <Text
          variant="label"
          className={styles.statLabel}
          style={overdue.length ? { color: 'var(--color-bad)' } : undefined}
          muted={!overdue.length}
        >
          <Icon name="warning" size="sm" />
          Overdue
        </Text>
        <Text variant="monoLg" style={overdue.length ? { color: 'var(--color-bad)' } : undefined}>
          {overdue.length}
        </Text>
        <Text variant="caption" muted>
          {first
            ? `${first.title} · ${formatCents(Number(sums[first.id]?.outstanding_cents ?? 0))}`
            : 'Nothing overdue'}
        </Text>
      </div>
    </div>
  );
}

/** Staff request list: Open / Closed / All tabs, search, due-date sort and a table of requests with progress. */
export function RequestList({
  events,
  sums,
  onOpen,
}: {
  events: PaymentEventRow[];
  sums: Summaries;
  onOpen: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('open');
  const [q, setQ] = useState('');
  const [asc, setAsc] = useState(true);
  const [page, setPage] = useState(0);

  const withState = useMemo(
    () => events.map((e) => ({ e, st: eventState(e, sums[e.id]) })),
    [events, sums],
  );
  const counts = {
    open: withState.filter((x) => x.st.state !== 'closed').length,
    closed: withState.filter((x) => x.st.state === 'closed').length,
    all: withState.length,
  };
  const shown = withState
    .filter((x) =>
      tab === 'all' ? true : tab === 'open' ? x.st.state !== 'closed' : x.st.state === 'closed',
    )
    .filter((x) => x.e.title.toLowerCase().includes(q.trim().toLowerCase()))
    .sort(
      (a, b) => (asc ? 1 : -1) * (new Date(a.e.due_at).getTime() - new Date(b.e.due_at).getTime()),
    );
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const at = Math.min(page, pages - 1);
  const rows = shown.slice(at * PAGE, at * PAGE + PAGE);
  const pick = (t: Tab) => {
    setTab(t);
    setPage(0);
  };

  return (
    <div className={styles.panel} data-testid="collection">
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Requests">
          {(['open', 'closed', 'all'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
              onClick={() => pick(t)}
            >
              {t[0]!.toUpperCase() + t.slice(1)} <Text variant="monoSm">{counts[t]}</Text>
            </button>
          ))}
        </div>
        <label className={styles.search}>
          <Icon name="magnifying-glass" size="sm" />
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search requests"
            aria-label="Search requests"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <button
          type="button"
          className={styles.pillButton}
          onClick={() => setAsc((v) => !v)}
          aria-label={`Sort by due date, ${asc ? 'soonest' : 'latest'} first`}
        >
          <Icon name="arrows-down-up" size="sm" />
          Due date
          <Icon name="caret-down" size="sm" />
        </button>
      </div>
      <div role="table" aria-label="Payment requests">
        <div role="row" className={styles.tableHead}>
          <div role="columnheader">REQUEST</div>
          <div role="columnheader">DUE</div>
          <div role="columnheader">PROGRESS</div>
          <div role="columnheader">COLLECTED</div>
          <div role="columnheader">OUTSTANDING</div>
          <div role="columnheader">STATUS</div>
          <div />
        </div>
        {rows.length === 0 ? (
          <div className={styles.centerTile}>
            <Text variant="bodyBold">No requests here</Text>
            <Text muted>Try another tab or clear the search.</Text>
          </div>
        ) : null}
        {rows.map(({ e, st }) => {
          const s = sums[e.id];
          const v = stateView[st.state];
          return (
            <button
              key={e.id}
              type="button"
              role="row"
              className={styles.tableRow}
              onClick={() => onOpen(e.id)}
            >
              <div role="cell" style={{ minWidth: 0 }}>
                <Text variant="bodyBold" as="div">
                  {e.title}
                </Text>
                <Text variant="caption" muted as="div">
                  {formatCents(e.amount_cents)} each · {audienceLabel(e.audience)}
                </Text>
              </div>
              <Text role="cell" variant="caption" as="div">
                {shortDate(e.due_at)}
              </Text>
              <div role="cell">
                <Text variant="caption" muted as="div">
                  {s ? `${s.paid_count} of ${s.total_requests} paid` : '—'}
                </Text>
                <div
                  className={styles.bar}
                  role="img"
                  aria-label={`${s?.progress_percent ?? 0}% collected`}
                >
                  <span
                    className={styles.barFill}
                    style={{ width: `${s?.progress_percent ?? 0}%` }}
                  />
                </div>
              </div>
              <div role="cell">{s ? <Amount cents={Number(s.collected_cents)} /> : '—'}</div>
              <div role="cell">{s ? <Amount cents={Number(s.outstanding_cents)} /> : '—'}</div>
              <div role="cell">
                <StatusPill tone={v.tone} icon={v.icon}>
                  {collectionStateLabel(st.state, st.daysLeft)}
                </StatusPill>
              </div>
              <span role="cell" className={styles.iconMuted} style={{ display: 'flex' }}>
                <Icon name="caret-right" size="sm" />
              </span>
            </button>
          );
        })}
      </div>
      <div className={styles.pager}>
        <Text variant="caption" muted>
          {shown.length === 0
            ? '0 requests'
            : `${at * PAGE + 1}–${at * PAGE + rows.length} of ${shown.length}`}
        </Text>
        <div className={styles.row}>
          <Button variant="ghost" disabled={at === 0} onClick={() => setPage(at - 1)}>
            <Icon name="caret-left" size="sm" />
            Previous
          </Button>
          <Button variant="ghost" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
