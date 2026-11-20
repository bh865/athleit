'use client';

import { jerseyDigits, jerseySpoken, statusLabel, type RosterStatus } from '@athleit/core';

import appStyles from '@/components/app/app.module.css';

import { Chip, Icon, TextField } from '@/components/ui';

import styles from './roster.module.css';

/** Mono jersey number; screen readers hear "number 7" / "no number" instead of the symbol. */
export function Jersey({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string | undefined;
}) {
  return (
    <span className={className}>
      <span aria-hidden>{jerseyDigits(value)}</span>
      <span className={appStyles.visuallyHidden}>{jerseySpoken(value)}</span>
    </span>
  );
}

/** Status is icon plus word, never colour alone: "Active" / "Inactive". */
export function StatusMark({ status }: { status: RosterStatus }) {
  const active = status === 'active';
  return (
    <span className={`${styles.status} ${active ? styles.statusActive : ''}`}>
      <Icon name={active ? 'check-circle' : 'minus-circle'} size="sm" />
      {statusLabel(status)}
    </span>
  );
}

/** Quick-picks from the sport config fill the free-text field; the text stays the source of truth. */
export function PositionPicker({
  options,
  value,
  onChange,
  error,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
}) {
  return (
    <div>
      <span className={styles.fieldLabel} id="position-chips-label">
        Position
      </span>
      {options.length > 0 && (
        <div className={styles.posChips} role="group" aria-labelledby="position-chips-label">
          {options.map((p) => (
            <Chip
              key={p}
              className={styles.chipBtn}
              selected={value.trim() === p}
              onClick={() => onChange(value.trim() === p ? '' : p)}
            >
              {p}
            </Chip>
          ))}
        </div>
      )}
      <TextField
        label="Other position"
        name="position"
        value={value}
        maxLength={40}
        onChange={(e) => onChange(e.target.value)}
        error={error}
      />
    </div>
  );
}
