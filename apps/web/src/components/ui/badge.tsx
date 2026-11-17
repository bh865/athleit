import type { ComponentProps } from 'react';

import styles from './badge.module.css';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

export function Badge({
  tone = 'neutral',
  className,
  ...rest
}: ComponentProps<'span'> & { tone?: BadgeTone }) {
  return (
    <span
      {...rest}
      className={[styles.badge, styles[tone], className ?? ''].filter(Boolean).join(' ')}
    />
  );
}
