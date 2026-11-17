import { useId, type ComponentProps } from 'react';

import styles from './text-field.module.css';

export interface TextAreaProps extends Omit<ComponentProps<'textarea'>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string;
}

/** Multi-line field styled like TextField (notes, reasons). */
export function TextArea({ label, error, hint, className, rows = 3, ...rest }: TextAreaProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={[styles.field, className ?? ''].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <textarea
        {...rest}
        id={id}
        rows={rows}
        className={[styles.input, styles.area, error ? styles.invalid : '']
          .filter(Boolean)
          .join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
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
