'use client';

import { friendlyError, formatCents, installmentLabel } from '@athleit/core';
import { setPlanAutopay, type InstallmentRow, type InstallmentStatus } from '@athleit/db/payments';
import { useState } from 'react';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Text,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { Amount } from './money';
import styles from './parent-pay.module.css';
import { StatusPill, type PillTone } from './status-pill';

interface PlanRow {
  id: string;
  display_id: string;
  amount_cents: number;
  status: string;
  plan_count: number;
  autopay: boolean;
  payment_events: { title: string } | null;
  players: { first_name: string } | null;
  payment_request_installments: InstallmentRow[];
}

const OPEN: InstallmentStatus[] = ['scheduled', 'due', 'failed'];
const PAID: InstallmentStatus[] = ['paid', 'paid_offline', 'partially_refunded', 'refunded'];
const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function pill(
  i: InstallmentRow,
  now = Date.now(),
): { tone: PillTone; icon: Parameters<typeof StatusPill>[0]['icon']; text: string } {
  switch (i.status) {
    case 'paid':
    case 'paid_offline':
      return { tone: 'ok', icon: 'check-circle', text: 'Paid' };
    case 'processing':
      return { tone: 'warn', icon: 'hourglass', text: 'Processing' };
    case 'failed':
      return {
        tone: 'bad',
        icon: 'warning',
        text: i.attempt_count >= 3 ? 'Overdue: pay now' : 'Charge failed: pay now',
      };
    case 'due':
      return {
        tone: 'warn',
        icon: 'clock',
        text: new Date(i.due_at).getTime() < now ? 'Overdue' : 'Due now',
      };
    case 'waived':
      return { tone: 'neutral', icon: 'minus-circle', text: 'Waived' };
    case 'cancelled':
      return { tone: 'neutral', icon: 'minus-circle', text: 'Cancelled' };
    case 'refunded':
    case 'partially_refunded':
      return { tone: 'neutral', icon: 'arrow-bend-up-left', text: 'Refunded' };
    default:
      return { tone: 'neutral', icon: 'calendar-blank', text: `Due ${when(i.due_at)}` };
  }
}

/** Payment plans in progress: what is paid, what is due when, and the ways to pay ahead. Amounts are display only. */
export function PlansPanel({
  onPay,
  refreshKey,
}: {
  onPay: (installmentIds: string[]) => void;
  refreshKey: number;
}) {
  const toast = useToast();
  const plans = useLoad(async () => {
    const { data, error } = await getClient()
      .from('payment_requests')
      .select(
        'id, display_id, amount_cents, status, plan_count, autopay, payment_events(title), players(first_name), payment_request_installments(id, request_id, sequence, amount_cents, due_at, status, attempt_count, next_retry_at, paid_at, last_reminded_at)',
      )
      .not('plan_count', 'is', null)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });
    return error
      ? { data: null, error: { message: error.message } }
      : { data: (data ?? []) as unknown as PlanRow[], error: null };
  }, [refreshKey]);
  const [busy, setBusy] = useState<string | null>(null);

  if (plans.loading) return <LoadingSkeleton />;
  if (plans.error) return <ErrorState message={plans.error} onRetry={plans.reload} />;
  const rows = plans.data ?? [];
  if (rows.length === 0) return null;

  return (
    <section className={styles.main} aria-labelledby="plans-h" data-testid="plans-panel">
      <Text variant="heading" as="h2" id="plans-h">
        Payment plans
      </Text>
      {rows.map((r) => {
        const inst = [...r.payment_request_installments].sort((a, b) => a.sequence - b.sequence);
        const paid = inst.filter((i) => PAID.includes(i.status));
        const open = inst.filter((i) => OPEN.includes(i.status));
        const remaining = open.reduce((s, i) => s + i.amount_cents, 0);
        const next = open[0];
        return (
          <Card key={r.id} className={styles.summary} data-testid="plan-card">
            <div className={styles.row} style={{ justifyContent: 'space-between' }}>
              <div>
                <Text variant="bodyBold">{r.payment_events?.title ?? 'Payment'}</Text>
                <Text variant="caption" muted as="p">
                  {r.players?.first_name} · {r.display_id} · {paid.length} of {r.plan_count} paid
                </Text>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Amount cents={remaining} variant="monoLg" label="Still to pay" />
                <Text variant="caption" muted as="p">
                  still to pay
                </Text>
              </div>
            </div>
            <ol
              className={styles.stack}
              aria-label="Installments"
              style={{ listStyle: 'none', margin: 0, padding: 0 }}
            >
              {inst.map((i) => {
                const p = pill(i);
                return (
                  <li key={i.id} className={styles.line}>
                    <Text>
                      {installmentLabel(i.sequence, r.plan_count)} · {when(i.due_at)}
                    </Text>
                    <span className={styles.row}>
                      <Amount
                        cents={i.amount_cents}
                        label={installmentLabel(i.sequence, r.plan_count)}
                      />
                      <StatusPill tone={p.tone} icon={p.icon}>
                        {p.text}
                      </StatusPill>
                    </span>
                  </li>
                );
              })}
            </ol>
            <Text variant="caption" muted as="p">
              The total shown for each payment includes its own card fee. Paying several together
              costs less than paying them one at a time.
            </Text>
            {open.length > 0 ? (
              <div className={styles.row} style={{ flexWrap: 'wrap' }}>
                <Button onClick={() => onPay([next!.id])} disabled={next!.status === 'processing'}>
                  Pay next installment
                </Button>
                {open.length > 1 ? (
                  <Button variant="secondary" onClick={() => onPay(open.map((i) => i.id))}>
                    Pay remaining balance
                  </Button>
                ) : null}
                <label className={styles.row}>
                  <input
                    type="checkbox"
                    checked={r.autopay}
                    disabled={busy === r.id}
                    onChange={async (e) => {
                      setBusy(r.id);
                      const res = await setPlanAutopay(getClient(), r.id, e.target.checked);
                      setBusy(null);
                      if (res.error) toast(friendlyError(res.error), 'danger');
                      else
                        toast(
                          e.target.checked ? 'Automatic payments on' : 'Automatic payments off',
                        );
                      plans.reload();
                    }}
                  />
                  <Text variant="caption">Pay automatically</Text>
                </label>
              </div>
            ) : (
              <StatusPill tone="ok" icon="check-circle">
                Plan complete
              </StatusPill>
            )}
          </Card>
        );
      })}
      {rows.length === 0 ? <EmptyState title="No payment plans" /> : null}
    </section>
  );
}
