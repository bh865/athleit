import { useId, type ComponentProps } from 'react';

import styles from './text-field.module.css';

export interface SelectProps extends Omit<ComponentProps<'select'>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string;
  options: readonly { value: string; label: string }[];
}

/** Native select (best accessibility and mobile behaviour), styled like TextField. */
export function Select({ label, error, hint, options, className, ...rest }: SelectProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={[styles.field, className ?? ''].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        {...rest}
        id={id}
        className={[styles.input, error ? styles.invalid : ''].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
