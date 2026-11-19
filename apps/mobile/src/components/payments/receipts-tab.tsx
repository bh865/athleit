import {
  formatCents,
  groupReceiptsByMonth,
  paidThisYear,
  receiptSummary,
  receiptYears,
  refundState,
  type ReceiptLite,
} from '@athleit/core';
import type { HouseholdReceiptRow } from '@athleit/db/payments';
import { componentTokens, space } from '@athleit/tokens';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  IconCircle,
  LoadingSkeleton,
  Sheet,
  Text,
  TextField,
  useTheme,
} from '@/components/ui';

import { Amount, dueText } from './money';
import { Kicker, StatusPill } from './pay-parts';
import { ReceiptCard } from './receipt-card';

/** The Receipts tab: year summary, search and year, month-grouped receipts, and a bottom sheet for one receipt. */
export function ReceiptsTab({
  data,
  loading,
  error,
  onRetry,
}: {
  data: readonly HouseholdReceiptRow[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const rows = (data ?? []) as unknown as (HouseholdReceiptRow & ReceiptLite)[];
  const years = receiptYears(rows);
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear());
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<HouseholdReceiptRow | null>(null);

  if (loading) return <LoadingSkeleton />;
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
  const thisYear = year === new Date().getFullYear();

  return (
    <View style={{ gap: space[4] }}>
      <Card style={{ gap: space[2] }}>
        <Kicker>{thisYear ? 'Paid this year' : `Paid in ${year}`}</Kicker>
        <Amount cents={sum.cents} variant="monoXl" label="Paid this year" />
        <Text variant="caption" muted>
          {sum.count} {sum.count === 1 ? 'receipt' : 'receipts'}
          {sum.refunded > 0 ? ` · ${formatCents(sum.refunded)} refunded` : ''}
        </Text>
      </Card>

      <TextField
        label="Search receipts"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        placeholder="Child, item or receipt ID"
      />
      {years.length > 1 ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space[2] }}
          accessibilityRole="tablist"
        >
          {years.map((y) => (
            <Chip
              key={y}
              label={String(y)}
              selected={y === year}
              accessibilityRole="radio"
              onPress={() => setYear(y)}
            />
          ))}
        </ScrollView>
      ) : null}

      {groups.length === 0 ? <Text muted>No receipts match.</Text> : null}
      {groups.map((g) => (
        <View key={g.key} style={{ gap: space[2] }}>
          <Kicker>{g.label}</Kicker>
          {g.rows.map((r) => {
            const rs = refundState(r);
            return (
              <Pressable
                key={r.payment_id}
                onPress={() => setOpen(r)}
                accessibilityRole="button"
                accessibilityLabel={`Receipt ${r.receipt_display_id}, ${receiptSummary(r)}, ${r.succeeded_at ? dueText(r.succeeded_at) : ''}${rs === 'none' ? '' : rs === 'full' ? ', refunded' : ', partially refunded'}`}
                style={{
                  minHeight: componentTokens.listRow.height,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  padding: space[4],
                  borderRadius: componentTokens.card.radius,
                  borderWidth: componentTokens.card.border,
                  borderColor: c.line,
                  backgroundColor: c.surface,
                }}
              >
                <IconCircle>
                  <Icon name="receipt" />
                </IconCircle>
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text variant="monoSm" muted>
                    {r.receipt_display_id}
                  </Text>
                  <Text variant="bodyBold" numberOfLines={2}>
                    {receiptSummary(r)}
                  </Text>
                  <Text variant="caption" muted>
                    {r.succeeded_at ? dueText(r.succeeded_at) : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: space[1] }}>
                  <Amount cents={r.total_charged_cents} />
                  {rs !== 'none' ? (
                    <StatusPill tone={rs === 'full' ? 'neutral' : 'warn'} icon="arrow-bend-up-left">
                      {rs === 'full' ? 'Refunded' : 'Partially refunded'}
                    </StatusPill>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      {open ? (
        <Sheet open onClose={() => setOpen(null)} title="Receipt">
          <View style={{ gap: space[4] }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text variant="heading" accessibilityRole="header">
                Receipt
              </Text>
              <IconButton icon="x" label="Close receipt" onPress={() => setOpen(null)} />
            </View>
            <ReceiptCard r={open} onDone={() => setOpen(null)} />
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}
