import type { StatusTone } from '@athleit/ui-core';
import type { ReactNode } from 'react';

import styles from './badge.module.css';
import { StatusDot } from './status-dot';

export type BadgeTone = StatusTone | 'count';

/**
 * neutral: quiet pill. success / warning / danger: an 8px status dot with its label.
 * count: lime pill with mono text (unread counts and similar).
 */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  if (tone === 'success' || tone === 'warning' || tone === 'danger')
    return (
      <span className={styles.status}>
        <StatusDot tone={tone} />
        {children}
      </span>
    );
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
