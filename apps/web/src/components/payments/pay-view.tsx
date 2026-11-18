'use client';

import { paymentRequestStatusLabel, sumCents, type PaymentRequestStatus } from '@athleit/core';
import {
  getHouseholdPayments,
  getHouseholdReceipts,
  type HouseholdReceiptRow,
} from '@athleit/db/payments';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { LoadState } from '@/components/app/states';
import { Badge, Button, Card, Icon, SegmentedControl, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { CheckoutSheet } from './checkout';
import { Amount, dueText, requestSummaryLabel } from './money';
import styles from './payments.module.css';
import { ReceiptView } from './receipt';

type Tab = 'due' | 'receipts';

const tone = (s: string) =>
  s === 'paid' || s === 'paid_offline' || s === 'partially_refunded' || s === 'refunded'
    ? 'success'
    : s === 'processing'
      ? 'warning'
      : s === 'unpaid'
        ? 'warning'
        : 'neutral';

/** Parent Pay: "Amount due" over a 56px mono total, request cards, a lime Pay pill; Receipts tab. */
export function PayView() {
  const [tab, setTab] = useState<Tab>('due');
  const linked = useSearchParams().get('request');
  const [picked, setPicked] = useState<Set<string> | null>(linked ? new Set([linked]) : null);
  const [checkout, setCheckout] = useState<string[] | null>(null);
  const [receipt, setReceipt] = useState<HouseholdReceiptRow | null>(null);
  const due = useLoad(() => getHouseholdPayments(getClient()), []);
  const receipts = useLoad(() => getHouseholdReceipts(getClient()), []);

  const rows = due.data ?? [];
  const payable = rows.filter((r) => r.can_pay);
  // Requests of different payees / fee terms must be paid separately: pay one group at a time.
  const selected = picked ?? new Set(payable.map((r) => r.request_id));
  const chosen = payable.filter((r) => selected.has(r.request_id));
  const total = sumCents(chosen.map((r) => r.amount_cents));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const others = rows.filter((r) => !r.can_pay);

  return (
    <div className={styles.layout}>
      <Text variant="title" as="h1">
        Pay
      </Text>
      <SegmentedControl
        label="Pay sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'due', label: 'Due' },
          { value: 'receipts', label: 'Receipts' },
        ]}
      />

      {tab === 'due' ? (
        <LoadState
          loading={due.loading}
          error={due.error}
          empty={rows.length === 0}
          emptyText="Nothing to pay"
          onRetry={due.reload}
        >
          <div>
            <Text variant="bodyBold" muted as="div">
              Amount due
            </Text>
            <Amount cents={total} variant="monoXl" label="Amount due" />
          </div>
          <ul
            className={styles.list}
            aria-label="Payment requests"
            style={{ gap: 'var(--space-3)' }}
          >
            {payable.map((r) => (
              <li key={r.request_id} className={styles.requestRow}>
                <input
                  type="checkbox"
                  className={styles.check}
                  checked={selected.has(r.request_id)}
                  onChange={() => toggle(r.request_id)}
                  aria-label={requestSummaryLabel({
                    title: r.title,
                    cents: r.amount_cents,
                    dueAt: r.due_at,
                    status: 'unpaid',
                  })}
                />
                <div className={styles.grow}>
                  <Text variant="bodyBold" as="div">
                    {r.title}
                  </Text>
                  <Text variant="caption" muted as="div">
                    {r.player_first_name} · due {dueText(r.due_at)}
                  </Text>
                </div>
                <Amount cents={r.amount_cents} />
              </li>
            ))}
            {others.map((r) => (
              <li key={r.request_id} className={styles.requestRow}>
                <div className={styles.grow}>
                  <Text variant="bodyBold" as="div">
                    {r.title}
                  </Text>
                  <Text variant="caption" muted as="div">
                    {r.player_first_name} ·{' '}
                    {r.paid_at ? `paid ${dueText(r.paid_at)}` : `due ${dueText(r.due_at)}`}
                  </Text>
                </div>
                <Badge tone={tone(r.status)}>
                  {paymentRequestStatusLabel(r.status as PaymentRequestStatus)}
                </Badge>
                <Amount cents={r.amount_cents} />
              </li>
            ))}
          </ul>
          {chosen.length > 0 ? (
            <Button
              size="lg"
              fullWidth
              onClick={() => setCheckout(chosen.map((r) => r.request_id))}
            >
              Pay <Amount cents={total} />
            </Button>
          ) : null}
        </LoadState>
      ) : (
        <LoadState
          loading={receipts.loading}
          error={receipts.error}
          empty={(receipts.data ?? []).length === 0}
          emptyText="No receipts yet"
          onRetry={receipts.reload}
        >
          <ul className={styles.list} aria-label="Receipts" style={{ gap: 'var(--space-3)' }}>
            {(receipts.data ?? []).map((r) => (
              <li key={r.payment_id}>
                <button type="button" className={styles.requestRow} onClick={() => setReceipt(r)}>
                  <Icon name="receipt" />
                  <div className={styles.grow}>
                    <Text variant="mono" as="div">
                      {r.receipt_display_id}
                    </Text>
                    <Text variant="caption" muted as="div">
                      {r.succeeded_at ? dueText(r.succeeded_at) : ''}
                    </Text>
                  </div>
                  <Amount cents={r.total_charged_cents} />
                  <Icon name="caret-right" />
                </button>
              </li>
            ))}
          </ul>
        </LoadState>
      )}

      <CheckoutSheet
        requestIds={checkout}
        onClose={() => setCheckout(null)}
        onFinished={() => {
          due.reload();
          receipts.reload();
          setPicked(null);
        }}
      />
      {receipt ? (
        <Card>
          <ReceiptView receipt={receipt} onDone={() => setReceipt(null)} />
        </Card>
      ) : null}
    </div>
  );
}
