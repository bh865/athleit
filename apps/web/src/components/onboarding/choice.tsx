'use client';

import { Chip } from '@/components/ui';

import styles from './onboarding.module.css';

/** Radio-style chips for short lists. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className={styles.stack} role="group" aria-label={label}>
      <p className={styles.muted}>{label}</p>
      <div className={styles.row}>
        {options.map((o) => (
          <Chip key={o.value} selected={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
