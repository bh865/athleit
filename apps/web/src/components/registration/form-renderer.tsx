'use client';

import { visibleFields, type FormField, type FormSchema } from '@athleit/core';
import { useId } from 'react';

import { DatePicker, TextArea, TextField, Select } from '@/components/ui';

import styles from './registration.module.css';

export type Answers = Record<string, unknown>;

const ADDRESS_PARTS = [
  ['line1', 'Street address'],
  ['city', 'City'],
  ['region', 'State or region'],
  ['postal', 'Postal code'],
] as const;

/** Renders a published form schema. Hidden (show_if) fields are not shown, and their stale answers are dropped. */
export function FormRenderer({
  schema,
  answers,
  errors,
  onChange,
  compact = false,
}: {
  schema: FormSchema;
  answers: Answers;
  errors: Record<string, string>;
  onChange: (next: Answers) => void;
  /** One column, like a phone: half-width questions stack. Used by the builder's mobile preview. */
  compact?: boolean;
}) {
  const set = (id: string, v: unknown) => {
    const next = { ...answers, [id]: v };
    // Drop answers for fields that just became hidden, so they are never submitted.
    const shown = new Set(visibleFields(schema, next).map((f) => f.id));
    for (const k of Object.keys(next)) if (!shown.has(k)) delete next[k];
    onChange(next);
  };
  return (
    <div className={compact ? styles.stack : styles.formGrid}>
      {visibleFields(schema, answers).map((f) => (
        <div key={f.id} className={f.width === 'half' && !compact ? styles.half : styles.fullCol}>
          <Field f={f} value={answers[f.id]} error={errors[f.id]} set={(v) => set(f.id, v)} />
        </div>
      ))}
    </div>
  );
}

function Field({
  f,
  value,
  error,
  set,
}: {
  f: FormField;
  value: unknown;
  error: string | undefined;
  set: (v: unknown) => void;
}) {
  const id = useId();
  const label = `${f.label}${f.required ? '' : ' (optional)'}`;
  const common = {
    label,
    error,
    ...(f.help ? { hint: f.help } : {}),
    ...(f.placeholder ? { placeholder: f.placeholder } : {}),
  };
  switch (f.type) {
    case 'long_text':
      return (
        <TextArea
          {...common}
          value={String(value ?? '')}
          onChange={(e) => set(e.target.value)}
          rows={4}
        />
      );
    case 'dropdown':
      return (
        <Select
          {...common}
          value={String(value ?? '')}
          options={[{ value: '', label: 'Choose one' }, ...(f.options ?? [])]}
          onChange={(e) => set(e.target.value)}
        />
      );
    case 'single_choice':
      return (
        <fieldset className={styles.fieldset} aria-describedby={error ? `${id}-e` : undefined}>
          <legend className={styles.legend}>{label}</legend>
          {f.help ? <p className={styles.hint}>{f.help}</p> : null}
          {(f.options ?? []).map((o) => (
            <label key={o.value} className={styles.choice}>
              <input
                type="radio"
                name={id}
                checked={value === o.value}
                onChange={() => set(o.value)}
              />
              {o.label}
            </label>
          ))}
          {error ? (
            <p id={`${id}-e`} className={styles.err} role="alert">
              {error}
            </p>
          ) : null}
        </fieldset>
      );
    case 'multiple_choice': {
      const sel = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{label}</legend>
          {f.help ? <p className={styles.hint}>{f.help}</p> : null}
          {(f.options ?? []).map((o) => (
            <label key={o.value} className={styles.choice}>
              <input
                type="checkbox"
                checked={sel.includes(o.value)}
                onChange={(e) =>
                  set(e.target.checked ? [...sel, o.value] : sel.filter((x) => x !== o.value))
                }
              />
              {o.label}
            </label>
          ))}
          {error ? (
            <p className={styles.err} role="alert">
              {error}
            </p>
          ) : null}
        </fieldset>
      );
    }
    case 'checkbox':
    case 'consent_checkbox':
      return (
        <div className={styles.fieldset}>
          <label className={styles.choice}>
            <input
              type="checkbox"
              checked={value === true}
              onChange={(e) => set(e.target.checked)}
            />
            {f.label}
          </label>
          {f.help ? <p className={styles.hint}>{f.help}</p> : null}
          {error ? (
            <p className={styles.err} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      );
    case 'address': {
      const v = (value && typeof value === 'object' ? value : {}) as Record<string, string>;
      return (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{label}</legend>
          {ADDRESS_PARTS.map(([k, l]) => (
            <TextField
              key={k}
              label={l}
              value={v[k] ?? ''}
              onChange={(e) => set({ ...v, [k]: e.target.value })}
            />
          ))}
          {error ? (
            <p className={styles.err} role="alert">
              {error}
            </p>
          ) : null}
        </fieldset>
      );
    }
    case 'number':
      return (
        <TextField
          {...common}
          type="number"
          inputMode="decimal"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      );
    case 'date':
      return <DatePicker {...common} value={String(value ?? '')} onChange={set} />;
    case 'email':
      return (
        <TextField
          {...common}
          type="email"
          autoComplete="off"
          value={String(value ?? '')}
          onChange={(e) => set(e.target.value)}
        />
      );
    case 'phone':
      return (
        <TextField
          {...common}
          type="tel"
          value={String(value ?? '')}
          onChange={(e) => set(e.target.value)}
        />
      );
    default:
      return (
        <TextField {...common} value={String(value ?? '')} onChange={(e) => set(e.target.value)} />
      );
  }
}
