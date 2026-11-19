import { friendlyError, installmentLabel } from '@athleit/core';
import {
  getRequestInstallments,
  recordOfflineInstallment,
  restructurePlan,
  retryInstallmentCharge,
  sendInstallmentReminder,
  waiveInstallment,
  waiveRemainingBalance,
  type CollectionRow,
  type InstallmentRow,
} from '@athleit/db/payments';
import { space } from '@athleit/tokens';
import { useState } from 'react';
import { View } from 'react-native';

import { LoadState } from '@/components/app/kit';
import { Button, Sheet, Text, TextField, useToast } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { Amount } from './money';
import { Row } from './pay-parts';
import { StatusPill, type PillTone } from './staff-parts';

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
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** One family's plan on the phone: installments and the staff actions (all checked and audited in the database). */
export function PlanSheet({
  row,
  canManage,
  onClose,
  onChanged,
}: {
  row: CollectionRow;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const list = useLoad(
    () => getRequestInstallments(supabase, row.request_id),
    [row.request_id, tick],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [restructure, setRestructure] = useState(false);
  const [count, setCount] = useState('1');
  const [days, setDays] = useState('7');
  const inst: InstallmentRow[] = list.data ?? [];
  const open = inst.filter((i) => OPEN.includes(i.status));

  const run = async (
    key: string,
    fn: () => Promise<{ error: { message: string } | null }>,
    ok: string,
  ) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (r.error) toast(friendlyError(r.error as Parameters<typeof friendlyError>[0]), 'danger');
    else {
      toast(ok);
      setTick((t) => t + 1);
      onChanged();
    }
  };

  return (
    <Sheet open onClose={onClose} title="Payment plan">
      <View style={{ gap: space[3] }} testID="plan-sheet">
        <Text variant="heading" accessibilityRole="header">
          {row.player_name}
        </Text>
        <Text variant="caption" muted>
          {row.display_id} · {row.household_name} ·{' '}
          {row.autopay ? 'automatic payments on' : 'pays by hand'}
        </Text>
        <LoadState loading={list.loading && !list.data} error={list.error} onRetry={list.reload}>
          {inst.map((i) => {
            const t = TEXT[i.status] ?? { tone: 'neutral' as PillTone, text: i.status };
            const isOpen = OPEN.includes(i.status);
            return (
              <View key={i.id} style={{ gap: space[1] }}>
                <Row
                  k={
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyBold">
                        {installmentLabel(i.sequence, row.plan_count ?? inst.length)}
                      </Text>
                      <Text variant="caption" muted>
                        Due {when(i.due_at)}
                        {i.attempt_count > 0
                          ? ` · ${i.attempt_count} automatic attempt${i.attempt_count === 1 ? '' : 's'}`
                          : ''}
                      </Text>
                    </View>
                  }
                  v={
                    <View style={{ alignItems: 'flex-end', gap: space[1] }}>
                      <Amount cents={i.amount_cents} />
                      <StatusPill tone={t.tone} icon="circle-dashed">
                        {t.text}
                      </StatusPill>
                    </View>
                  }
                />
                {isOpen && canManage ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                    <Button
                      title="Paid cash"
                      variant="ghost"
                      loading={busy === `o${i.id}`}
                      onPress={() =>
                        run(
                          `o${i.id}`,
                          () => recordOfflineInstallment(supabase, i.id, 'cash'),
                          'Marked paid',
                        )
                      }
                    />
                    <Button
                      title="Waive"
                      variant="ghost"
                      loading={busy === `w${i.id}`}
                      onPress={() =>
                        run(
                          `w${i.id}`,
                          () => waiveInstallment(supabase, i.id),
                          'Installment waived',
                        )
                      }
                    />
                    <Button
                      title="Remind"
                      variant="ghost"
                      loading={busy === `r${i.id}`}
                      onPress={async () => {
                        setBusy(`r${i.id}`);
                        const r = await sendInstallmentReminder(supabase, i.id);
                        setBusy(null);
                        toast(
                          r.error
                            ? friendlyError(r.error)
                            : r.data
                              ? 'Reminder sent'
                              : 'Already reminded in the last 24 hours',
                          r.error ? 'danger' : 'success',
                        );
                      }}
                    />
                    {i.status === 'failed' && row.autopay ? (
                      <Button
                        title="Retry charge"
                        variant="ghost"
                        loading={busy === `t${i.id}`}
                        onPress={() =>
                          run(
                            `t${i.id}`,
                            () => retryInstallmentCharge(supabase, i.id),
                            'We will try the card again shortly',
                          )
                        }
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
          {canManage && open.length > 0 ? (
            <View style={{ gap: space[2] }}>
              <Button
                title="Waive remaining balance"
                variant="secondary"
                loading={busy === 'wr'}
                onPress={() =>
                  run(
                    'wr',
                    () => waiveRemainingBalance(supabase, row.request_id),
                    'Remaining balance waived',
                  )
                }
              />
              <Button
                title="Restructure"
                variant="secondary"
                onPress={() => setRestructure((v) => !v)}
              />
              {restructure ? (
                <View style={{ gap: space[2] }}>
                  <Text variant="caption" muted>
                    Re-lay what is still owed (the total never changes). The family is notified.
                  </Text>
                  <TextField
                    label="Installments still to pay (1 to 5)"
                    keyboardType="number-pad"
                    value={count}
                    onChangeText={setCount}
                  />
                  <TextField
                    label="First one due in (days)"
                    keyboardType="number-pad"
                    value={days}
                    onChangeText={setDays}
                  />
                  <Button
                    title="Update plan"
                    loading={busy === 'rs'}
                    onPress={() =>
                      run(
                        'rs',
                        () =>
                          restructurePlan(
                            supabase,
                            row.request_id,
                            Number(count),
                            new Date(Date.now() + Number(days) * 86_400_000).toISOString(),
                          ),
                        'Plan updated; the family was told',
                      )
                    }
                  />
                </View>
              ) : null}
            </View>
          ) : null}
        </LoadState>
        <Button title="Close" variant="ghost" onPress={onClose} />
      </View>
    </Sheet>
  );
}
