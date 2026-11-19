'use client';

import {
  audienceLabel,
  collectionState,
  collectionStateLabel,
  formatCents,
  friendlyError,
  parseDollarsToCents,
  type PaymentRequestStatus,
} from '@athleit/core';
import {
  cancelPaymentEvent,
  exportPaymentEvent,
  getCollectionDetail,
  getCollectionSummary,
  recordOfflinePayment,
  refundPayment,
  sendPaymentReminders,
  waiveRequest,
  type CollectionRow,
  type Owner,
  type PaymentEventRow,
} from '@athleit/db/payments';
import { useMemo, useState } from 'react';

import { LoadState } from '@/components/app/states';
import { Avatar, Button, Icon, Select, Sheet, Text, TextField, useToast } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { Amount, dueText } from './money';
import { PlanSheet } from './plan-sheet';
import styles from './payments.module.css';
import { stateView } from './request-list';
import { StatusPill, type PillTone } from './status-pill';

type Group = 'all' | 'unpaid' | 'paid' | 'waived';
type Action = { kind: 'waive' | 'offline' | 'refund'; rows: CollectionRow[] } | null;
const PAGE = 12;

const PAID = ['paid', 'paid_offline', 'partially_refunded', 'refunded'];
const groupOf = (s: string): Group =>
  PAID.includes(s)
    ? 'paid'
    : s === 'waived'
      ? 'waived'
      : s === 'unpaid' || s === 'processing' || s === 'partially_paid'
        ? 'unpaid'
        : 'all';

const rowPill = (
  r: CollectionRow,
): { tone: PillTone; icon: Parameters<typeof StatusPill>[0]['icon'] } =>
  groupOf(r.status) === 'paid'
    ? { tone: 'ok', icon: 'check-circle' }
    : r.status === 'waived'
      ? { tone: 'neutral', icon: 'minus-circle' }
      : { tone: 'warn', icon: 'circle-dashed' };

const paidDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

const STATUS_TEXT: Record<string, string> = {
  unpaid: 'Unpaid',
  processing: 'Processing',
  partially_paid: 'Partly paid',
  paid: 'Paid',
  paid_offline: 'Paid',
  partially_refunded: 'Partly refunded',
  refunded: 'Refunded',
  waived: 'Waived',
  cancelled: 'Cancelled',
};

/** One request: collected / outstanding / paid / waived, a filterable player table, bulk and per-row actions. */
export function RequestDetail({
  event,
  isAdmin,
  canSend,
  onBack,
  onChanged,
}: {
  event: PaymentEventRow;
  owner?: Owner;
  isAdmin: boolean;
  canSend: boolean;
  onBack: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const summary = useLoad(() => getCollectionSummary(getClient(), event.id), [event.id, tick]);
  const detail = useLoad(() => getCollectionDetail(getClient(), event.id), [event.id, tick]);
  const [group, setGroup] = useState<Group>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<Action>(null);
  const [planRow, setPlanRow] = useState<CollectionRow | null>(null);
  const reload = () => {
    setTick((t) => t + 1);
    onChanged();
  };
  const s = summary.data;
  const all = useMemo(() => detail.data ?? [], [detail.data]);

  const counts = useMemo(() => {
    const c = { all: all.length, unpaid: 0, paid: 0, waived: 0 };
    for (const r of all) {
      const g = groupOf(r.status);
      if (g !== 'all') c[g] += 1;
    }
    return c;
  }, [all]);
  const online = all.filter((r) => groupOf(r.status) === 'paid' && r.paid_via === 'card').length;
  const offline = counts.paid - online;

  const shown = all
    .filter((r) => (group === 'all' ? true : groupOf(r.status) === group))
    .filter((r) => r.player_name.toLowerCase().includes(q.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const at = Math.min(page, pages - 1);
  const rows = shown.slice(at * PAGE, at * PAGE + PAGE);
  const selectedRows = all.filter((r) => picked.has(r.request_id) && r.status === 'unpaid');
  const st = collectionState({
    status: event.status,
    dueAt: event.due_at,
    outstandingCents: Number(s?.outstanding_cents ?? 0),
    totalRequests: s?.total_requests ?? 0,
  });
  const sv = stateView[st.state];

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const remind = async () => {
    const r = await sendPaymentReminders(getClient(), event.id);
    if (r.error) toast(friendlyError(r.error), 'danger');
    else
      toast(
        r.data === 0
          ? 'Everyone was reminded in the last 24 hours'
          : `Reminder sent for ${r.data} ${r.data === 1 ? 'request' : 'requests'}`,
      );
    reload();
  };
  const download = async () => {
    const r = await exportPaymentEvent(getClient(), event.id);
    if (r.error) return toast(friendlyError(r.error), 'danger');
    const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-payments.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const cancel = async () => {
    if (
      !window.confirm(
        'Cancel this request? Unpaid requests are cancelled; money already collected stays.',
      )
    )
      return;
    const r = await cancelPaymentEvent(getClient(), event.id);
    if (r.error) toast(friendlyError(r.error), 'danger');
    else {
      toast('Request cancelled');
      reload();
    }
  };

  return (
    <div className={styles.page} data-testid="collection">
      <nav aria-label="Breadcrumb">
        <button type="button" className={styles.crumb} onClick={onBack}>
          <Icon name="caret-left" size="sm" />
          Pay
          <span aria-hidden>/</span>
          <Text variant="bodyBold" as="span" style={{ color: 'var(--color-ink)' }}>
            {event.title}
          </Text>
        </button>
      </nav>
      <div className={styles.header}>
        <div>
          <div className={styles.row}>
            <Text variant="title" as="h2">
              {event.title}
            </Text>
            <StatusPill tone={sv.tone} icon={sv.icon}>
              {collectionStateLabel(st.state, st.daysLeft)}
            </StatusPill>
          </div>
          <Text muted as="p">
            {formatCents(event.amount_cents)} per player · {audienceLabel(event.audience)} · Due{' '}
            {dueText(event.due_at)}
          </Text>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={remind} disabled={event.status !== 'published'}>
            <Icon name="bell-ringing" size="sm" />
            Send reminder
          </Button>
          <Button variant="secondary" onClick={download}>
            <Icon name="download-simple" size="sm" />
            Export CSV
          </Button>
          {isAdmin && event.status === 'published' ? (
            <Button variant="ghost" onClick={cancel}>
              <Icon name="x-circle" size="sm" />
              Cancel request
            </Button>
          ) : null}
        </div>
      </div>

      {s ? (
        <div className={styles.stats}>
          <div className={`${styles.stat} ${styles.heroStat}`}>
            <Text variant="label" muted>
              Collected
            </Text>
            <div className={styles.row}>
              <Amount cents={Number(s.collected_cents)} variant="monoLg" label="Collected" />
              <Text variant="caption" muted>
                of {formatCents(Number(s.expected_cents))}
              </Text>
            </div>
            <div className={styles.bar} role="img" aria-label={`${s.progress_percent}% collected`}>
              <span className={styles.barFill} style={{ width: `${s.progress_percent}%` }} />
            </div>
          </div>
          <div className={styles.stat}>
            <Text variant="label" muted>
              Outstanding
            </Text>
            <Amount cents={Number(s.outstanding_cents)} variant="monoLg" label="Outstanding" />
            <Text variant="caption" muted>
              {s.unpaid_count} unpaid
              {s.plans_count > 0
                ? ` · ${s.plans_count} on plans${s.scheduled_cents ? `, ${formatCents(Number(s.scheduled_cents))} scheduled` : ''}${s.overdue_installments ? `, ${s.overdue_installments} overdue` : ''}`
                : ''}
            </Text>
          </div>
          <div className={styles.stat}>
            <Text variant="label" muted>
              Paid
            </Text>
            <Text variant="monoLg">{counts.paid}</Text>
            <Text variant="caption" muted>
              {online} online · {offline} offline
            </Text>
          </div>
          <div className={styles.stat}>
            <Text variant="label" muted>
              Waived
            </Text>
            <Text variant="monoLg">{s.waived_count}</Text>
            <Text variant="caption" muted>
              {formatCents(Number(s.waived_cents))}
            </Text>
          </div>
        </div>
      ) : null}

      <div className={styles.panel}>
        <div className={styles.toolbar}>
          <div className={styles.tabs} role="tablist" aria-label="Players">
            {(['all', 'unpaid', 'paid', 'waived'] as const).map((g) => (
              <button
                key={g}
                type="button"
                role="tab"
                aria-selected={group === g}
                className={`${styles.tab} ${group === g ? styles.tabActive : ''}`}
                onClick={() => {
                  setGroup(g);
                  setPage(0);
                }}
              >
                {g[0]!.toUpperCase() + g.slice(1)} <Text variant="monoSm">{counts[g]}</Text>
              </button>
            ))}
          </div>
          <label className={styles.search}>
            <Icon name="magnifying-glass" size="sm" />
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search players"
              aria-label="Search players"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>
        {selectedRows.length > 0 ? (
          <div className={styles.bulkBar} role="region" aria-label="Bulk actions">
            <Text variant="bodyBold">
              <Text variant="mono">{selectedRows.length}</Text> selected
            </Text>
            <span style={{ flex: 1 }} />
            <Button
              variant="secondary"
              onClick={() => setAction({ kind: 'offline', rows: selectedRows })}
            >
              Paid offline
            </Button>
            <Button
              variant="secondary"
              onClick={() => setAction({ kind: 'waive', rows: selectedRows })}
            >
              Waive
            </Button>
            <Button variant="ghost" onClick={() => setPicked(new Set())}>
              Clear
            </Button>
          </div>
        ) : null}
        <LoadState
          loading={detail.loading && !detail.data}
          error={detail.error}
          empty={all.length === 0}
          emptyText="No players on this request"
          onRetry={detail.reload}
        >
          <div role="table" aria-label="Families">
            <div role="row" className={`${styles.tableHead} ${styles.playerHead}`}>
              <div />
              <div role="columnheader">PLAYER</div>
              <div role="columnheader">STATUS</div>
              <div role="columnheader">AMOUNT</div>
              <div role="columnheader">PAID</div>
              <div />
            </div>
            {rows.map((r) => {
              const pill = rowPill(r);
              const plan = r.plan_count !== null;
              const unpaid = r.status === 'unpaid' && !plan;
              const refundable =
                isAdmin &&
                (r.status === 'paid' || r.status === 'partially_refunded') &&
                r.paid_via === 'card';
              return (
                <div
                  key={r.request_id}
                  role="row"
                  className={`${styles.tableRow} ${styles.playerRow} ${picked.has(r.request_id) ? styles.rowSelected : ''}`}
                >
                  {unpaid ? (
                    <input
                      type="checkbox"
                      className={styles.checkSm}
                      aria-label={`Select ${r.player_name}`}
                      checked={picked.has(r.request_id)}
                      onChange={() => toggle(r.request_id)}
                    />
                  ) : (
                    <span />
                  )}
                  <div role="cell" className={styles.person}>
                    <Avatar name={r.player_name} size="sm" />
                    <div style={{ minWidth: 0 }}>
                      <Text variant="bodyBold" as="div">
                        {r.player_name}
                      </Text>
                      <Text variant="monoSm" muted as="div">
                        {r.display_id}
                      </Text>
                    </div>
                  </div>
                  <div role="cell" className={styles.row}>
                    <StatusPill tone={pill.tone} icon={pill.icon}>
                      {STATUS_TEXT[r.status as PaymentRequestStatus] ?? r.status}
                    </StatusPill>
                    {plan ? (
                      <StatusPill tone={r.overdue ? 'bad' : 'neutral'} icon="calendar-blank">
                        {r.installments_paid} of {r.plan_count} paid{r.overdue ? ' · overdue' : ''}
                      </StatusPill>
                    ) : null}
                    {r.disputed ? (
                      <StatusPill tone="bad" icon="warning">
                        Disputed
                      </StatusPill>
                    ) : null}
                  </div>
                  <div role="cell">
                    <Amount cents={r.amount_cents} />
                  </div>
                  <div role="cell">
                    {unpaid ? (
                      <Text variant="caption" muted>
                        Not paid
                      </Text>
                    ) : (
                      <>
                        <Text variant="caption" as="div">
                          {paidDate(r.paid_at)}
                        </Text>
                        <Text variant="caption" muted as="div">
                          {r.status === 'waived'
                            ? 'Waived'
                            : r.paid_via === 'card'
                              ? 'Card'
                              : 'Offline'}
                          {r.receipt_display_id ? ` · ${r.receipt_display_id}` : ''}
                        </Text>
                      </>
                    )}
                  </div>
                  <div role="cell" className={styles.cellActions}>
                    {unpaid && canSend ? (
                      <>
                        <Button
                          variant="ghost"
                          onClick={() => setAction({ kind: 'offline', rows: [r] })}
                        >
                          Paid offline
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setAction({ kind: 'waive', rows: [r] })}
                        >
                          Waive
                        </Button>
                      </>
                    ) : null}
                    {plan ? (
                      <Button variant="ghost" onClick={() => setPlanRow(r)}>
                        Plan
                      </Button>
                    ) : null}
                    {refundable && !plan ? (
                      <Button
                        variant="ghost"
                        onClick={() => setAction({ kind: 'refund', rows: [r] })}
                      >
                        Refund
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.pager}>
            <Text variant="caption" muted>
              {shown.length === 0
                ? '0 players'
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
        </LoadState>
      </div>
      <PlanSheet
        key={planRow?.request_id ?? 'none'}
        row={planRow}
        canManage={canSend}
        isAdmin={isAdmin}
        onClose={() => setPlanRow(null)}
        onChanged={reload}
      />
      <ActionSheet
        action={action}
        onClose={() => setAction(null)}
        onDone={() => {
          setAction(null);
          setPicked(new Set());
          reload();
        }}
      />
    </div>
  );
}

function ActionSheet({
  action,
  onClose,
  onDone,
}: {
  action: Action;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<'cash' | 'check' | 'other'>('cash');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!action)
    return (
      <Sheet open={false} onClose={onClose} title="Action">
        <span />
      </Sheet>
    );
  const { kind, rows } = action;
  const first = rows[0]!;

  const run = async () => {
    setBusy(true);
    setError(null);
    const c = getClient();
    let err: { message: string } | null = null;
    if (kind === 'waive') {
      for (const row of rows) {
        err = (await waiveRequest(c, row.request_id, note || undefined)).error;
        if (err) break;
      }
    } else if (kind === 'offline') {
      for (const row of rows) {
        err = (await recordOfflinePayment(c, row.request_id, method, note || undefined)).error;
        if (err) break;
      }
    } else {
      // The payer's money sits on the payment item: find it (staff can read their event's items).
      const { data: item } = await c
        .from('payment_items')
        .select('id,payment_id,amount_cents')
        .eq('payment_request_id', first.request_id)
        .eq('is_active', true)
        .maybeSingle();
      if (!item) err = { message: 'not_refundable' };
      else {
        const base = amount.trim() ? parseDollarsToCents(amount) : null;
        if (amount.trim() && (base === null || base <= 0)) err = { message: 'invalid_amount' };
        else
          err = (
            await refundPayment(c, {
              paymentId: item.payment_id,
              paymentItemId: item.id,
              ...(base ? { baseCents: base } : {}),
              ...(note ? { reason: note } : {}),
            })
          ).error;
      }
    }
    setBusy(false);
    if (err) return setError(friendlyError(err));
    toast(
      kind === 'waive' ? 'Request waived' : kind === 'offline' ? 'Marked paid' : 'Refund started',
    );
    setNote('');
    setAmount('');
    onDone();
  };

  const title =
    kind === 'waive' ? 'Waive request' : kind === 'offline' ? 'Record offline payment' : 'Refund';
  return (
    <Sheet open onClose={onClose} title={title}>
      <div className={styles.stack}>
        <Text variant="heading" as="h2">
          {title}
        </Text>
        <Text muted as="p">
          {rows.length === 1 ? (
            <>
              {first.player_name} · <Text variant="mono">{first.display_id}</Text> ·{' '}
              <Amount cents={first.amount_cents} />
            </>
          ) : (
            `${rows.length} players`
          )}
        </Text>
        {kind === 'offline' ? (
          <Select
            label="Method"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'check', label: 'Check' },
              { value: 'other', label: 'Other' },
            ]}
          />
        ) : null}
        {kind === 'refund' ? (
          <TextField
            label="Amount to refund (leave blank for all)"
            mono
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint="Card fees from Stripe aren’t returned."
          />
        ) : null}
        <TextField
          label={kind === 'refund' ? 'Reason (optional)' : 'Note (optional)'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
        />
        {error ? (
          <p role="alert" className={`${styles.notice} ${styles.noticeBad}`}>
            {error}
          </p>
        ) : null}
        <Button size="lg" fullWidth loading={busy} onClick={run}>
          {kind === 'waive' ? 'Waive' : kind === 'offline' ? 'Mark paid' : 'Refund'}
        </Button>
      </div>
    </Sheet>
  );
}
