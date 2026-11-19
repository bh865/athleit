import {
  formatCents,
  netAfterRefund,
  receiptItems,
  refundState,
  type ReceiptItemLite,
} from '@athleit/core';
import type { HouseholdReceiptRow } from '@athleit/db/payments';
import { componentTokens, radius, space } from '@athleit/tokens';
import * as Clipboard from 'expo-clipboard';
import { Pressable, View } from 'react-native';

import { Button, Icon, Text, useTheme, useToast } from '@/components/ui';

import { Amount, dueText } from './money';
import { Kicker, Row } from './pay-parts';

/**
 * Receipt detail (bottom sheet body): Paid + total, items grouped per child, Athleit charge and service fee, any
 * refund, date, and a receipt ID you can copy. `thanks` adds the "emailed to you" line right after checkout.
 */
export function ReceiptCard({
  r,
  onDone,
  thanks,
}: {
  r: HouseholdReceiptRow;
  onDone: () => void;
  thanks?: boolean;
}) {
  const toast = useToast();
  const { theme } = useTheme();
  const items = receiptItems(r);
  const byChild = new Map<string, ReceiptItemLite[]>();
  for (const i of items)
    byChild.set(i.player_first_name, [...(byChild.get(i.player_first_name) ?? []), i]);
  const refunded = Number(r.refunded_cents);
  const state = refundState(r);
  return (
    <View style={{ gap: space[4] }} testID="receipt">
      <View style={{ alignItems: 'center', gap: space[2] }}>
        <View
          style={{
            width: componentTokens.emptyState.iconCircle,
            height: componentTokens.emptyState.iconCircle,
            borderRadius: radius.pill,
            backgroundColor: theme.color.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          accessible={false}
        >
          <Icon name="check" size="xl" weight="fill" color={theme.color.accentInk} />
        </View>
        <Text variant="title">{state === 'full' ? 'Refunded' : 'Paid'}</Text>
        {thanks ? (
          <Text muted style={{ textAlign: 'center' }}>
            Thanks. A receipt was emailed to you.
          </Text>
        ) : null}
        <Amount cents={r.total_charged_cents} variant="monoXl" label="Total paid" />
        {refunded > 0 ? <Text muted>Net {formatCents(netAfterRefund(r))} after refund</Text> : null}
      </View>
      {[...byChild].map(([child, list]) => (
        <View key={child}>
          <Kicker>{child || 'Items'}</Kicker>
          {list.map((i) => (
            <Row key={i.display_id} k={i.title} v={<Amount cents={i.amount_cents} />} />
          ))}
        </View>
      ))}
      <View>
        {r.platform_fee_cents > 0 ? (
          <Row quiet k="Athleit charge" v={<Amount cents={r.platform_fee_cents} />} />
        ) : null}
        {r.processing_fee_passthrough_cents > 0 ? (
          <Row quiet k="Service fee" v={<Amount cents={r.processing_fee_passthrough_cents} />} />
        ) : null}
        {refunded > 0 ? (
          <Row
            k={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
                <Icon name="arrow-bend-up-left" size="sm" />
                <Text>{state === 'full' ? 'Refunded' : 'Partially refunded'}</Text>
              </View>
            }
            v={<Text variant="mono">−{formatCents(refunded)}</Text>}
          />
        ) : null}
        <Row
          quiet
          k="Date"
          v={<Text variant="bodyBold">{r.succeeded_at ? dueText(r.succeeded_at) : ''}</Text>}
        />
        <Row
          quiet
          k="Receipt ID"
          v={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Copy receipt ID ${r.receipt_display_id}`}
              onPress={() =>
                void Clipboard.setStringAsync(r.receipt_display_id).then(() =>
                  toast('Receipt ID copied'),
                )
              }
              style={{
                minHeight: componentTokens.minTarget,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[2],
              }}
            >
              <Text variant="mono">{r.receipt_display_id}</Text>
              <Icon name="copy" size="sm" />
            </Pressable>
          }
        />
      </View>
      <Button title="Done" size="lg" onPress={onDone} />
    </View>
  );
}
