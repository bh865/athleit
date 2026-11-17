'use client';

import type { HouseholdReceiptRow } from '@athleit/db/payments';

import { Button, Icon, Text } from '@/components/ui';

import { Amount, dueText } from './money';
import styles from './payments.module.css';

type ReceiptItem = {
  display_id: string;
  title: string;
  player_first_name: string;
  amount_cents: number;
};

/** Receipt: 88px lime circle with a check, "Paid", mono amount, details card, lime Done. */
export function ReceiptView({
  receipt,
  onDone,
}: {
  receipt: HouseholdReceiptRow;
  onDone: () => void;
}) {
  const items = (receipt.items ?? []) as unknown as ReceiptItem[];
  return (
    <div className={styles.center} data-testid="receipt">
      <span className={styles.success} aria-hidden>
        <Icon name="check" size="xl" weight="fill" />
      </span>
      <Text variant="title" as="h2">
        Paid
      </Text>
      <Amount cents={receipt.total_charged_cents} variant="monoXl" label="Total paid" />
      <div className={styles.lines} style={{ width: '100%' }}>
        {items.map((i) => (
          <div key={i.display_id} className={styles.line}>
            <Text muted>
              {i.title} · {i.player_first_name}
            </Text>
            <Amount cents={i.amount_cents} />
          </div>
        ))}
        {receipt.platform_fee_cents > 0 ? (
          <div className={styles.line}>
            <Text muted>Athleit charge</Text>
            <Amount cents={receipt.platform_fee_cents} />
          </div>
        ) : null}
        {receipt.processing_fee_passthrough_cents > 0 ? (
          <div className={styles.line}>
            <Text muted>Service fee</Text>
            <Amount cents={receipt.processing_fee_passthrough_cents} />
          </div>
        ) : null}
        <div className={styles.line}>
          <Text muted>Date</Text>
          <Text variant="bodyBold">
            {receipt.succeeded_at ? dueText(receipt.succeeded_at) : ''}
          </Text>
        </div>
        <div className={`${styles.line} ${styles.total}`}>
          <Text muted>Receipt ID</Text>
          <Text variant="mono" data-testid="receipt-id">
            {receipt.receipt_display_id}
          </Text>
        </div>
      </div>
      {receipt.refunded_cents > 0 ? (
        <Text muted>
          Refunded <Amount cents={Number(receipt.refunded_cents)} />
        </Text>
      ) : null}
      <Button size="lg" fullWidth onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
