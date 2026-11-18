'use client';

import type { AttentionItem, AttentionKind } from '@athleit/core';
import type { IconName } from '@athleit/ui-core';
import Link from 'next/link';
import { useState } from 'react';

import { Badge, Card, Icon, ListGroup, ListRow, Sheet, Text } from '@/components/ui';

import styles from './home.module.css';

const ICON: Record<AttentionKind, IconName> = {
  rsvp: 'calendar-blank',
  result: 'flag',
  payment: 'credit-card',
  waiver: 'clipboard-text',
  registrationStep: 'receipt',
  joinRequests: 'users-three',
  loginClaims: 'user',
  linkRequests: 'link',
  registrationsToDecide: 'clipboard-text',
  payouts: 'bank',
  setup: 'list-checks',
};

/**
 * "Needs your attention". Only the first chip is lime; every chip pairs its icon with a text label so the
 * meaning never depends on colour. Hidden when nothing is open.
 */
export function AttentionStrip({
  shown,
  more,
}: {
  shown: readonly AttentionItem[];
  more: readonly AttentionItem[];
}) {
  const [open, setOpen] = useState(false);
  if (shown.length === 0) return null;
  return (
    <Card
      role="region"
      aria-labelledby="home-attention"
      className={styles.attention}
      data-testid="home-attention"
    >
      <div className={styles.attentionHead}>
        <h2 id="home-attention" className={styles.kicker}>
          Needs your attention
        </h2>
        <Badge tone="count">{shown.length + more.length}</Badge>
      </div>
      <ul className={styles.chips}>
        {shown.map((i, n) => (
          <li key={i.key}>
            <Link href={i.href} className={`${styles.chip} ${n === 0 ? styles.chipPrimary : ''}`}>
              <span className={styles.chipIcon}>
                <Icon name={ICON[i.kind]} size="sm" />
              </span>
              <span className={styles.chipText}>
                <span className={styles.chipLabel}>{i.label}</span>
                {i.detail ? <span className={styles.chipDetail}>{i.detail}</span> : null}
              </span>
              <Icon name="caret-right" size="sm" />
            </Link>
          </li>
        ))}
        {more.length > 0 ? (
          <li>
            <button type="button" className={styles.chip} onClick={() => setOpen(true)}>
              <span className={styles.chipText}>
                <span className={styles.chipLabel}>+{more.length} more</span>
              </span>
              <Icon name="caret-right" size="sm" />
            </button>
          </li>
        ) : null}
      </ul>
      <Sheet open={open} onClose={() => setOpen(false)} title="Needs your attention">
        <Text variant="heading" as="h2">
          Needs your attention
        </Text>
        <ListGroup>
          {[...shown, ...more].map((i) => (
            <ListRow
              key={i.key}
              href={i.href}
              title={i.label}
              {...(i.detail ? { subtitle: i.detail } : {})}
            />
          ))}
        </ListGroup>
      </Sheet>
    </Card>
  );
}
