import { useId, type ComponentProps, type ReactNode } from 'react';

import styles from './text-field.module.css';

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string;
  /** Use the monospace face for codes, IDs and amounts. */
  mono?: boolean;
  /** A control inside the field's right edge (for example Show/Hide), at least 44px wide and high. */
  trailing?: ReactNode;
}

export function TextField({
  label,
  error,
  hint,
  mono,
  trailing,
  className,
  ...input
}: TextFieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={[styles.field, className ?? ''].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        <input
          {...input}
          id={id}
          className={[
            styles.input,
            mono ? styles.mono : '',
            error ? styles.invalid : '',
            trailing ? styles.withTrailing : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
      </div>
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
