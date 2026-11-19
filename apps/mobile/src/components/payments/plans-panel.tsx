import { friendlyError, installmentLabel } from '@athleit/core';
import { setPlanAutopay, type InstallmentRow, type InstallmentStatus } from '@athleit/db/payments';
import { space } from '@athleit/tokens';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { Button, Card, ErrorState, LoadingSkeleton, Text, useToast } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { Amount } from './money';
import { Kicker, Row, StatusPill } from './pay-parts';

interface PlanRow {
  id: string;
  display_id: string;
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

function pill(i: InstallmentRow) {
  switch (i.status) {
    case 'paid':
    case 'paid_offline':
      return { tone: 'ok' as const, icon: 'check-circle' as const, text: 'Paid' };
    case 'processing':
      return { tone: 'warn' as const, icon: 'hourglass' as const, text: 'Processing' };
    case 'failed':
      return {
        tone: 'bad' as const,
        icon: 'warning' as const,
        text: i.attempt_count >= 3 ? 'Overdue: pay now' : 'Charge failed: pay now',
      };
    case 'due':
      return {
        tone: 'warn' as const,
        icon: 'clock' as const,
        text: new Date(i.due_at).getTime() < Date.now() ? 'Overdue' : 'Due now',
      };
    case 'waived':
    case 'cancelled':
      return {
        tone: 'neutral' as const,
        icon: 'minus-circle' as const,
        text: i.status === 'waived' ? 'Waived' : 'Cancelled',
      };
    case 'refunded':
    case 'partially_refunded':
      return { tone: 'neutral' as const, icon: 'arrow-bend-up-left' as const, text: 'Refunded' };
    default:
      return {
        tone: 'neutral' as const,
        icon: 'calendar-blank' as const,
        text: `Due ${when(i.due_at)}`,
      };
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
    const { data, error } = await supabase
      .from('payment_requests')
      .select(
        'id, display_id, status, plan_count, autopay, payment_events(title), players(first_name), payment_request_installments(id, request_id, sequence, amount_cents, due_at, status, attempt_count, next_retry_at, paid_at, last_reminded_at)',
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
    <View style={{ gap: space[3] }} testID="plans-panel">
      <Kicker>Payment plans</Kicker>
      {rows.map((r) => {
        const inst = [...r.payment_request_installments].sort((a, b) => a.sequence - b.sequence);
        const paid = inst.filter((i) => PAID.includes(i.status)).length;
        const open = inst.filter((i) => OPEN.includes(i.status));
        const remaining = open.reduce((s, i) => s + i.amount_cents, 0);
        return (
          <Card key={r.id} style={{ gap: space[2] }} testID="plan-card">
            <Row
              k={
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold">{r.payment_events?.title ?? 'Payment'}</Text>
                  <Text variant="caption" muted>
                    {r.players?.first_name} · {r.display_id} · {paid} of {r.plan_count} paid
                  </Text>
                </View>
              }
              v={<Amount cents={remaining} variant="monoLg" label="Still to pay" />}
            />
            {inst.map((i) => {
              const p = pill(i);
              return (
                <Row
                  key={i.id}
                  k={`${installmentLabel(i.sequence, r.plan_count)} · ${when(i.due_at)}`}
                  v={
                    <View style={{ alignItems: 'flex-end', gap: space[1] }}>
                      <Amount
                        cents={i.amount_cents}
                        label={installmentLabel(i.sequence, r.plan_count)}
                      />
                      <StatusPill tone={p.tone} icon={p.icon}>
                        {p.text}
                      </StatusPill>
                    </View>
                  }
                />
              );
            })}
            <Text variant="caption" muted>
              Each payment includes its own card fee. Paying several together costs less than paying
              them one at a time.
            </Text>
            {open.length > 0 ? (
              <View style={{ gap: space[2] }}>
                <Button
                  title="Pay next installment"
                  onPress={() => onPay([open[0]!.id])}
                  disabled={open[0]!.status === 'processing'}
                />
                {open.length > 1 ? (
                  <Button
                    title="Pay remaining balance"
                    variant="secondary"
                    onPress={() => onPay(open.map((i) => i.id))}
                  />
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                  <Switch
                    accessibilityLabel="Pay automatically"
                    value={r.autopay}
                    disabled={busy === r.id}
                    onValueChange={async (v) => {
                      setBusy(r.id);
                      const res = await setPlanAutopay(supabase, r.id, v);
                      setBusy(null);
                      if (res.error) toast(friendlyError(res.error), 'danger');
                      else toast(v ? 'Automatic payments on' : 'Automatic payments off');
                      plans.reload();
                    }}
                  />
                  <Text>Pay automatically</Text>
                </View>
              </View>
            ) : (
              <StatusPill tone="ok" icon="check-circle">
                Plan complete
              </StatusPill>
            )}
          </Card>
        );
      })}
    </View>
  );
}
