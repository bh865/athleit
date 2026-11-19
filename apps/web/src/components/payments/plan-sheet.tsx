'use client';

import { friendlyError, installmentLabel, parseDollarsToCents } from '@athleit/core';
import {
  getRequestInstallments,
  recordOfflineInstallment,
  refundPayment,
  restructurePlan,
  retryInstallmentCharge,
  sendInstallmentReminder,
  waiveInstallment,
  waiveRemainingBalance,
  type CollectionRow,
  type InstallmentRow,
} from '@athleit/db/payments';
import { todayIso } from '@athleit/ui-core';
import { useState } from 'react';

import { LoadState } from '@/components/app/states';
import { Button, DatePicker, Select, Sheet, Text, TextField, useToast } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { Amount } from './money';
import styles from './payments.module.css';
import { StatusPill, type PillTone } from './status-pill';

const OPEN = ['scheduled', 'due', 'failed'];
const TEXT: Record<string, { tone: PillTone; text: string }> = {
  scheduled: { tone: 'neutral', text: 'Scheduled' },
  due: { tone: 'warn', text: 'Due' },
  processing: { tone: 'warn', text: 'Processing' },
  paid: { tone: 'ok', text: 'Paid' },
  paid_offline: { tone: 'ok', text: 'Paid offline' },
  failed: { tone: 'bad', text: 'Failed' },
  waived: { tone: 'neutral', text: 'Waived' },
  cancelled: { tone: 'neutral', text: 'Cancelled' },
  refunded: { tone: 'neutral', text: 'Refunded' },
  partially_refunded: { tone: 'neutral', text: 'Partly refunded' },
};
const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** One family's plan: every installment with its status, and the staff actions. All of them are checked and audited in the database. */
export function PlanSheet({
  row,
  canManage,
  isAdmin,
  onClose,
  onChanged,
}: {
  row: CollectionRow | null;
  canManage: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const list = useLoad(
    () =>
      row
        ? getRequestInstallments(getClient(), row.request_id)
        : Promise.resolve({ data: [] as InstallmentRow[], error: null }),
    [row?.request_id, tick],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [method, setMethod] = useState<'cash' | 'check' | 'other'>('cash');
  const [restructure, setRestructure] = useState(false);
  const [count, setCount] = useState('1');
  const [next, setNext] = useState('');
  const [refund, setRefund] = useState('');

  const done = (msg: string) => {
    toast(msg);
    setTick((t) => t + 1);
    onChanged();
  };
  const run = async (
    key: string,
    fn: () => Promise<{ error: { message: string } | null }>,
    ok: string,
  ) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (r.error) toast(friendlyError(r.error as Parameters<typeof friendlyError>[0]), 'danger');
    else done(ok);
  };
  if (!row) return null;
  const inst = list.data ?? [];
  const open = inst.filter((i) => OPEN.includes(i.status));
  const c = getClient();

  return (
    <Sheet open onClose={onClose} title="Payment plan" placement="right">
      <div className={styles.stack} data-testid="plan-sheet">
        <Text variant="heading" as="h2">
          {row.player_name}
        </Text>
        <Text variant="caption" muted as="p">
          {row.display_id} · {row.household_name}
          {row.autopay ? ' · automatic payments on' : ' · pays by hand'}
        </Text>
        <LoadState loading={list.loading && !list.data} error={list.error} onRetry={list.reload}>
          <ol
            className={styles.stack}
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
            aria-label="Installments"
          >
            {inst.map((i) => {
              const t = TEXT[i.status] ?? { tone: 'neutral' as PillTone, text: i.status };
              const isOpen = OPEN.includes(i.status);
              return (
                <li key={i.id} className={styles.lines} data-testid="installment-row">
                  <div className={styles.line}>
                    <Text variant="bodyBold">
                      {installmentLabel(i.sequence, row.plan_count ?? inst.length)}
                    </Text>
                    <span className={styles.row}>
                      <Amount
                        cents={i.amount_cents}
                        label={installmentLabel(i.sequence, inst.length)}
                      />
                      <StatusPill tone={t.tone} icon="circle-dashed">
                        {t.text}
                      </StatusPill>
                    </span>
                  </div>
                  <Text variant="caption" muted as="p">
                    Due {when(i.due_at)}
                    {i.attempt_count > 0
                      ? ` · ${i.attempt_count} automatic ${i.attempt_count === 1 ? 'attempt' : 'attempts'}`
                      : ''}
                    {i.next_retry_at && i.status === 'failed'
                      ? ` · next try ${when(i.next_retry_at)}`
                      : ''}
                  </Text>
                  {isOpen && canManage ? (
                    <div className={styles.row} style={{ flexWrap: 'wrap' }}>
                      <Button
                        variant="ghost"
                        loading={busy === `o${i.id}`}
                        onClick={() =>
                          void run(
                            `o${i.id}`,
                            () => recordOfflineInstallment(c, i.id, method),
                            'Marked paid offline',
                          )
                        }
                      >
                        Paid offline
                      </Button>
                      <Button
                        variant="ghost"
                        loading={busy === `w${i.id}`}
                        onClick={() =>
                          void run(
                            `w${i.id}`,
                            () => waiveInstallment(c, i.id),
                            'Installment waived',
                          )
                        }
                      >
                        Waive
                      </Button>
                      <Button
                        variant="ghost"
                        loading={busy === `r${i.id}`}
                        onClick={async () => {
                          setBusy(`r${i.id}`);
                          const r = await sendInstallmentReminder(c, i.id);
                          setBusy(null);
                          if (r.error) toast(friendlyError(r.error), 'danger');
                          else
                            toast(
                              r.data ? 'Reminder sent' : 'Already reminded in the last 24 hours',
                            );
                        }}
                      >
                        Remind
                      </Button>
                      {i.status === 'failed' && row.autopay ? (
                        <Button
                          variant="ghost"
                          loading={busy === `t${i.id}`}
                          onClick={() =>
                            void run(
                              `t${i.id}`,
                              () => retryInstallmentCharge(c, i.id),
                              'We will try the card again shortly',
                            )
                          }
                        >
                          Retry charge
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {canManage && open.length > 0 ? (
            <div className={styles.stack}>
              <Select
                label="Offline payments are recorded as"
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'check', label: 'Check' },
                  { value: 'other', label: 'Other' },
                ]}
              />
              <div className={styles.row} style={{ flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  loading={busy === 'wr'}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Waive everything still owed on this plan? Paid installments stay.',
                      )
                    )
                      void run(
                        'wr',
                        () => waiveRemainingBalance(c, row.request_id),
                        'Remaining balance waived',
                      );
                  }}
                >
                  Waive remaining balance
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setRestructure((v) => !v)}
                  aria-expanded={restructure}
                >
                  Restructure
                </Button>
              </div>
              {restructure ? (
                <form
                  className={styles.stack}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!next) return toast('Choose the next due date', 'danger');
                    void run(
                      'rs',
                      () =>
                        restructurePlan(
                          c,
                          row.request_id,
                          Number(count),
                          new Date(`${next}T12:00:00`).toISOString(),
                        ),
                      'Plan updated; the family was told',
                    );
                  }}
                >
                  <Text variant="caption" muted as="p">
                    Re-lay what is still owed (the total never changes). The family is notified.
                  </Text>
                  <Select
                    label="Installments still to pay"
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
                  />
                  <DatePicker
                    label="Next due date"
                    value={next}
                    onChange={setNext}
                    min={todayIso()}
                    yearSpan={{ before: 0, after: 2 }}
                  />
                  <Button type="submit" loading={busy === 'rs'}>
                    Update plan
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}
          {isAdmin && inst.some((i) => i.status === 'paid') ? (
            <form
              className={styles.stack}
              onSubmit={(e) => {
                e.preventDefault();
                const cents = parseDollarsToCents(refund);
                if (cents === null || cents <= 0)
                  return toast('Enter an amount to refund', 'danger');
                void run(
                  'rf',
                  () => refundPayment(c, { requestId: row.request_id, baseCents: cents }),
                  'Refund started',
                );
              }}
            >
              <TextField
                label="Refund (base amount)"
                mono
                inputMode="decimal"
                value={refund}
                onChange={(e) => setRefund(e.target.value)}
                placeholder="10.00"
                hint="Refunded from the most recently paid installment first."
              />
              <Button type="submit" variant="secondary" loading={busy === 'rf'}>
                Refund
              </Button>
            </form>
          ) : null}
        </LoadState>
      </div>
    </Sheet>
  );
}
