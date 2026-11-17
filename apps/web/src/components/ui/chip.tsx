import type { ComponentProps } from 'react';

import styles from './chip.module.css';

export interface ChipProps extends ComponentProps<'button'> {
  selected?: boolean;
}

/** Filter/choice chip. Selected = "sent" fill. Renders a button (use `ChipLabel` for non-interactive tags). */
export function Chip({ selected, className, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={selected}
      className={[styles.chip, selected ? styles.selected : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    />
  );
}

export function ChipLabel({ children }: { children: React.ReactNode }) {
  return <span className={`${styles.chip} ${styles.static}`}>{children}</span>;
}
