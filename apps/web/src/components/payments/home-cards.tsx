'use client';

import {
  getCollectionSummary,
  getHouseholdPayments,
  listPaymentEvents,
  type Owner,
} from '@athleit/db/payments';
import { sumCents } from '@athleit/core';
import Link from 'next/link';

import { Card, Icon, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { Amount, dueText } from './money';
import styles from './payments.module.css';

/** Staff: outstanding total in mono with a progress bar, linking to Payments. Hidden when nothing is open. */
export function StaffPaymentsCard({ owner, href }: { owner: Owner; href: string }) {
  const res = useLoad(async () => {
    const c = getClient();
    const events = await listPaymentEvents(c, owner);
    if (events.error) return events;
    const open = events.data.filter((e) => e.status === 'published').slice(0, 10);
    const sums = await Promise.all(open.map((e) => getCollectionSummary(c, e.id)));
    const rows = sums.flatMap((s) => (s.data ? [s.data] : []));
    return {
      data: {
        outstanding: sumCents(rows.map((r) => Number(r.outstanding_cents))),
        expected: sumCents(rows.map((r) => Number(r.expected_cents))),
        collected: sumCents(rows.map((r) => Number(r.collected_cents))),
        count: open.length,
      },
      error: null,
    };
  }, [owner.teamId, owner.clubId]);
  const d = res.data as {
    outstanding: number;
    expected: number;
    collected: number;
    count: number;
  } | null;
  if (!d || d.count === 0) return null;
  const pct = d.expected === 0 ? 0 : Math.min(100, Math.floor((d.collected * 100) / d.expected));
  return (
    <Link href={href} aria-label="Payments outstanding">
      <Card>
        <div className={styles.stack} data-testid="payments-card">
          <div className={styles.between}>
            <Text variant="bodyBold">Payments outstanding</Text>
            <Icon name="caret-right" />
          </div>
          <Amount cents={d.outstanding} variant="monoLg" label="Outstanding" />
          <div
            className={styles.bar}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Collected"
          >
            <span className={styles.barFill} style={{ display: 'block', width: `${pct}%` }} />
          </div>
        </div>
      </Card>
    </Link>
  );
}

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
