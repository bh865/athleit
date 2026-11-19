'use client';

import { getHouseholdPayments } from '@athleit/db/payments';
import { sumCents } from '@athleit/core';
import Link from 'next/link';

import { Card, Icon, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { Amount, dueText } from './money';
import styles from './payments.module.css';

/** Parents: "amount due" in the Jersey-fee row pattern, linking to Pay. Hidden when nothing is due. */
export function DueCard() {
  const res = useLoad(() => getHouseholdPayments(getClient()), []);
  const due = (res.data ?? []).filter((r) => r.can_pay);
  if (due.length === 0) return null;
  const first = [...due].sort((a, b) => a.due_at.localeCompare(b.due_at))[0]!;
  return (
    <Link href="/pay" aria-label="Amount due">
      <Card>
        <div className={styles.row} data-testid="due-card">
          <Icon name="credit-card" />
          <div className={styles.grow}>
            <Text variant="bodyBold" as="div">
              {due.length === 1 ? first.title : `${due.length} payments due`}
            </Text>
            <Text variant="caption" muted as="div">
              Due {dueText(first.due_at)}
            </Text>
          </div>
          <Amount cents={sumCents(due.map((r) => r.amount_cents))} />
          <Icon name="caret-right" />
        </div>
      </Card>
    </Link>
  );
}
