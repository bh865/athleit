import type { ComponentProps } from 'react';

import styles from './card.module.css';

/** Content surface: solid surface, 1px line, radius 24. Never glass. */
export function Card({ className, ...rest }: ComponentProps<'div'>) {
  return <div {...rest} className={[styles.card, className ?? ''].filter(Boolean).join(' ')} />;
}
