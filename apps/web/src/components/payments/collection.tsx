'use client';

import {
  formatCents,
  friendlyError,
  paymentRequestStatusLabel,
  parseDollarsToCents,
  type PaymentRequestStatus,
} from '@athleit/core';
import {
  cancelPaymentEvent,
  exportPaymentEvent,
  getCollectionDetail,
  getCollectionSummary,
  listPaymentEvents,
  recordOfflinePayment,
  refundPayment,
  sendPaymentReminders,
  waiveRequest,
  type CollectionRow,
  type Owner,
} from '@athleit/db/payments';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { LoadState } from '@/components/app/states';
import { Badge, Button, Card, Select, Sheet, Text, TextField, useToast } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { Amount, dueText } from './money';
import styles from './payments.module.css';

type Action = { kind: 'waive' | 'offline' | 'refund'; row: CollectionRow } | null;

const statusTone = (s: string) =>
  s === 'paid' || s === 'paid_offline' || s === 'partially_refunded' || s === 'refunded'
    ? ('success' as const)
    : s === 'waived' || s === 'cancelled'
      ? ('neutral' as const)
      : ('warning' as const);

/** Collection card: progress ring, "$collected of $total · due", Send reminder, and the per-family list with status dots. */
export function CollectionPanel({
  owner,
  isAdmin,
  refreshKey,
}: {
  owner: Owner;
  isAdmin: boolean;
  refreshKey: number;
}) {
  const toast = useToast();
  const events = useLoad(
    () => listPaymentEvents(getClient(), owner),
    [owner.teamId, owner.clubId, refreshKey],
  );
  const [selected, setSelected] = useState<string | null>(useSearchParams().get('event'));
  const list = (events.data ?? []).filter((e) => e.status !== 'draft');
  const current = list.find((e) => e.id === selected) ?? list[0] ?? null;
  const [tick, setTick] = useState(0);
  const summary = useLoad(
    () =>
      current
        ? getCollectionSummary(getClient(), current.id)
        : Promise.resolve({ data: null, error: null }),
    [current?.id, tick, refreshKey],
  );
  const detail = useLoad(
    () =>
      current
        ? getCollectionDetail(getClient(), current.id)
        : Promise.resolve({ data: [], error: null }),
    [current?.id, tick, refreshKey],
  );
  const [action, setAction] = useState<Action>(null);
  const reload = () => setTick((t) => t + 1);
  const s = summary.data;

  const remind = async () => {
    if (!current) return;
    const r = await sendPaymentReminders(getClient(), current.id);
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
    if (!current) return;
    const r = await exportPaymentEvent(getClient(), current.id);
    if (r.error) return toast(friendlyError(r.error), 'danger');
    const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${current.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-payments.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const cancel = async () => {
    if (
      !current ||
      !window.confirm(
        'Cancel this request? Unpaid requests are cancelled; money already collected stays.',
      )
    )
      return;
    const r = await cancelPaymentEvent(getClient(), current.id);
    if (r.error) toast(friendlyError(r.error), 'danger');
    else {
      toast('Request cancelled');
      events.reload();
      reload();
    }
  };

  return (
    <Card>
      <LoadState
        loading={events.loading}
        error={events.error}
        empty={list.length === 0}
        emptyText="No payment requests yet"
        onRetry={events.reload}
      >
        <div className={styles.stack} data-testid="collection">
          {list.length > 1 ? (
            <Select
              label="Payment request"
              value={current?.id ?? ''}
              onChange={(e) => setSelected(e.target.value)}
              options={list.map((e) => ({
                value: e.id,
                label: `${e.title} (${formatCents(e.amount_cents)})`,
              }))}
            />
          ) : null}
          {current && s ? (
            <>
              <div className={styles.row}>
                <div className={styles.ring} style={{ ['--pct' as string]: s.progress_percent }}>
                  <div className={styles.ringInner}>
                    <Text variant="mono" aria-label={`${s.progress_percent} percent collected`}>
                      {s.progress_percent}%
                    </Text>
                  </div>
                </div>
                <div className={styles.grow}>
                  <Text variant="heading" as="h2">
                    {current.title}
                  </Text>
                  <Text muted as="div">
                    <Amount cents={Number(s.collected_cents)} /> of{' '}
                    <Amount cents={Number(s.expected_cents)} /> · due {dueText(current.due_at)}
                  </Text>
                </div>
              </div>
              <div className={`${styles.row} ${styles.wrap}`}>
                <Button
                  variant="secondary"
                  onClick={remind}
                  disabled={current.status !== 'published'}
                >
                  Send reminder
                </Button>
                <Button variant="secondary" onClick={download}>
                  Export CSV
                </Button>
                {isAdmin && current.status === 'published' ? (
                  <Button variant="ghost" onClick={cancel}>
                    Cancel request
                  </Button>
                ) : null}
              </div>
              <LoadState loading={detail.loading} error={detail.error} onRetry={detail.reload}>
                <ul className={styles.list} aria-label="Families">
                  {(detail.data ?? []).map((r) => (
                    <li key={r.request_id} className={styles.item}>
                      <div className={styles.grow}>
                        <Text variant="bodyBold" as="div">
                          {r.player_name}
                        </Text>
                        <Text variant="monoSm" muted as="div">
                          {r.display_id}
                        </Text>
                      </div>
                      <Badge tone={statusTone(r.status)}>
                        {paymentRequestStatusLabel(r.status as PaymentRequestStatus)}
                      </Badge>
                      {r.disputed ? <Badge tone="danger">Disputed</Badge> : null}
                      <Amount cents={r.amount_cents} />
                      {r.status === 'unpaid' ? (
                        <>
                          <Button
                            variant="ghost"
                            onClick={() => setAction({ kind: 'offline', row: r })}
                          >
                            Paid offline
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setAction({ kind: 'waive', row: r })}
                          >
                            Waive
                          </Button>
                        </>
                      ) : null}
                      {isAdmin &&
                      (r.status === 'paid' || r.status === 'partially_refunded') &&
                      r.paid_via === 'card' ? (
                        <Button
                          variant="ghost"
                          onClick={() => setAction({ kind: 'refund', row: r })}
                        >
                          Refund
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </LoadState>
            </>
          ) : null}
        </div>
      </LoadState>
      <ActionSheet
        action={action}
        onClose={() => setAction(null)}
        onDone={() => {
          setAction(null);
          reload();
        }}
      />
    </Card>
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
  const { kind, row } = action;

  const run = async () => {
    setBusy(true);
    setError(null);
    const c = getClient();
    let err: { message: string } | null = null;
    if (kind === 'waive') err = (await waiveRequest(c, row.request_id, note || undefined)).error;
    else if (kind === 'offline')
      err = (await recordOfflinePayment(c, row.request_id, method, note || undefined)).error;
    else {
      // The payer's money sits on the payment item: find it (staff can read their event's items).
      const { data: item } = await c
        .from('payment_items')
        .select('id,payment_id,amount_cents')
        .eq('payment_request_id', row.request_id)
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
          {row.player_name} · <Text variant="mono">{row.display_id}</Text> ·{' '}
          <Amount cents={row.amount_cents} />
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
