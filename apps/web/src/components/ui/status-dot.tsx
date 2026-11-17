import { statusColorToken, type StatusTone } from '@athleit/ui-core';
import { kebabToken } from './kebab';

import styles from './status-dot.module.css';

/** 8px status dot. Always pair it with a text label (colour alone is not enough). */
export function StatusDot({ tone }: { tone: Exclude<StatusTone, 'neutral'> }) {
  return (
    <span
      className={styles.dot}
      style={{ background: `var(--color-${kebabToken(statusColorToken[tone])})` }}
      aria-hidden
    />
  );
}
