'use client';

import { netAfterRefund, receiptItems, refundState, type ReceiptItemLite } from '@athleit/core';
import type { HouseholdReceiptRow } from '@athleit/db/payments';

import { Button, Icon, IconButton, Text, useToast } from '@/components/ui';

import { Amount, dueText } from './money';
import styles from './parent-pay.module.css';

/** Receipt detail: paid total, items grouped per child, the Athleit charge and service fee, any refund, date and ID. */
export function ReceiptView({
  receipt,
  onDone,
}: {
  receipt: HouseholdReceiptRow;
  onDone: () => void;
}) {
  const toast = useToast();
  const items = receiptItems(receipt);
  const byChild = new Map<string, ReceiptItemLite[]>();
  for (const i of items)
    byChild.set(i.player_first_name, [...(byChild.get(i.player_first_name) ?? []), i]);
  const refunded = Number(receipt.refunded_cents);
  const state = refundState(receipt);

  async function copy() {
    try {
      await navigator.clipboard.writeText(receipt.receipt_display_id);
      toast('Receipt ID copied');
    } catch {
      toast('Could not copy the receipt ID', 'danger');
    }
  }

  return (
    <div className={styles.stack} data-testid="receipt">
      <div className={styles.center}>
        <span className={styles.ok} aria-hidden>
          <Icon name="check" size="xl" weight="fill" />
        </span>
        <Text variant="title" as="h2">
          {state === 'full' ? 'Refunded' : 'Paid'}
        </Text>
        <Amount cents={receipt.total_charged_cents} variant="monoXl" label="Total paid" />
        {refunded > 0 ? (
          <Text muted as="p">
            Net <Amount cents={netAfterRefund(receipt)} /> after refund
          </Text>
        ) : null}
      </div>
      {[...byChild].map(([child, list]) => (
        <section key={child} className={styles.lines} aria-label={child || 'Items'}>
          <span className={styles.kicker}>{child}</span>
          {list.map((i) => (
            <div key={i.display_id} className={styles.line}>
              <Text>{i.title}</Text>
              <Amount cents={i.amount_cents} />
            </div>
          ))}
        </section>
      ))}
      <div className={styles.lines}>
        {receipt.platform_fee_cents > 0 ? (
          <div className={`${styles.line} ${styles.lineQuiet}`}>
            <span>Athleit charge</span>
            <Amount cents={receipt.platform_fee_cents} />
          </div>
        ) : null}
        {receipt.processing_fee_passthrough_cents > 0 ? (
          <div className={`${styles.line} ${styles.lineQuiet}`}>
            <span>Service fee</span>
            <Amount cents={receipt.processing_fee_passthrough_cents} />
          </div>
        ) : null}
        {refunded > 0 ? (
          <div className={styles.line}>
            <span>
              <Icon name="arrow-bend-up-left" size="sm" />{' '}
              {state === 'full' ? 'Refunded' : 'Partially refunded'}
            </span>
            <span className={styles.row}>
              −<Amount cents={refunded} />
            </span>
          </div>
        ) : null}
        <div className={styles.line}>
          <span className={styles.quiet}>Date</span>
          <Text variant="bodyBold">
            {receipt.succeeded_at ? dueText(receipt.succeeded_at) : ''}
          </Text>
        </div>
        <div className={styles.line}>
          <span className={styles.quiet}>Receipt ID</span>
          <span className={styles.row}>
            <Text variant="mono" data-testid="receipt-id">
              {receipt.receipt_display_id}
            </Text>
            <IconButton icon="copy" label="Copy receipt ID" onClick={() => void copy()} />
          </span>
        </div>
      </div>
      <Button size="lg" fullWidth onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
