'use client';

import {
  groupReceiptsByMonth,
  paidThisYear,
  receiptSummary,
  receiptYears,
  refundState,
  type ReceiptLite,
} from '@athleit/core';
import type { HouseholdReceiptRow } from '@athleit/db/payments';
import { useState } from 'react';

import { EmptyState, ErrorState, Icon, Mono, Select, Sheet, TextField } from '@/components/ui';

import { Amount, dueText } from './money';
import styles from './parent-pay.module.css';
import { ReceiptView } from './receipt';
import { StatusPill } from './status-pill';

/** The Receipts tab: year summary, search, month-grouped list, and a side sheet for one receipt. */
export function ReceiptsView({
  rows: data,
  loading,
  error,
  onRetry,
}: {
  rows: readonly HouseholdReceiptRow[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const rows = (data ?? []) as unknown as (HouseholdReceiptRow & ReceiptLite)[];
  const years = receiptYears(rows);
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear());
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<HouseholdReceiptRow | null>(null);

  if (loading)
    return (
      <div className={styles.main} role="status" aria-label="Loading receipts">
        <span className={styles.skel} />
        <span className={styles.skel} />
      </div>
    );
  if (error)
    return (
      <ErrorState
        message="Can’t load receipts. Check your connection and try again."
        onRetry={onRetry}
      />
    );
  if (rows.length === 0)
    return (
      <EmptyState
        icon="receipt"
        title="No receipts yet"
        body="They’ll show up here after your first payment."
      />
    );

  const sum = paidThisYear(rows, year);
  const groups = groupReceiptsByMonth(rows, year, search);

  return (
    <div className={styles.main}>
      <section className={styles.summary} aria-label="Paid this year">
        <span className={styles.kicker}>
          Paid this {year === new Date().getFullYear() ? 'year' : `year (${year})`}
        </span>
        <Amount cents={sum.cents} variant="monoXl" label="Paid this year" />
        <p className={styles.quiet}>
          {sum.count} {sum.count === 1 ? 'receipt' : 'receipts'}
          {sum.refunded > 0 ? (
            <>
              {' '}
              · <Icon name="arrow-bend-up-left" size="sm" /> <Amount cents={sum.refunded} />{' '}
              refunded
            </>
          ) : null}
        </p>
      </section>
      <div className={styles.toolbar}>
        <TextField
          label="Search receipts"
          type="search"
          value={search}
          placeholder="Child, item or receipt ID"
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          label="Year"
          value={String(year)}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
          onChange={(e) => setYear(Number(e.target.value))}
        />
      </div>
      {groups.length === 0 ? <p className={styles.quiet}>No receipts match.</p> : null}
      {groups.map((g) => (
        <section key={g.key} className={styles.group} aria-label={g.label}>
          <h2 className={styles.month}>{g.label}</h2>
          <ul className={styles.reqs}>
            {g.rows.map((r) => {
              const rs = refundState(r);
              return (
                <li key={r.payment_id}>
                  <button type="button" className={styles.receiptRow} onClick={() => setOpen(r)}>
                    <Icon name="receipt" />
                    <span className={styles.grow}>
                      <Mono>{r.receipt_display_id}</Mono>
                      <div>{receiptSummary(r)}</div>
                      <span className={styles.quiet}>
                        {r.succeeded_at ? dueText(r.succeeded_at) : ''}
                      </span>
                    </span>
                    {rs !== 'none' ? (
                      <StatusPill
                        tone={rs === 'full' ? 'neutral' : 'warn'}
                        icon="arrow-bend-up-left"
                      >
                        {rs === 'full' ? 'Refunded' : 'Partially refunded'}
                      </StatusPill>
                    ) : null}
                    <Amount cents={r.total_charged_cents} />
                    <Icon name="caret-right" size="sm" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title="Receipt"
        level="modal"
        placement="side"
      >
        {open ? <ReceiptView receipt={open} onDone={() => setOpen(null)} /> : null}
      </Sheet>
    </div>
  );
}
