'use client';

import { formatTimeFriendly, parseTime, toTime } from '@athleit/ui-core';
import { useId, useRef, useState } from 'react';

import { Button } from './button';
import styles from './date-picker.module.css';
import { Icon } from './icon';
import { Popover } from './popover';

export interface TimePickerProps {
  label: string;
  /** 24-hour `HH:MM`, or '' when empty. */
  value?: string;
  /** Uncontrolled initial value (forms that read the hidden `name` input). */
  defaultValue?: string;
  onChange?: (hhmm: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | undefined;
  hint?: string;
  name?: string;
  placeholder?: string;
  /** Minute step (default 5). */
  minuteStep?: number;
  className?: string;
  'data-testid'?: string;
}

/** Time popover: hour, minute and AM/PM columns, then Done (a time needs three choices, so it confirms). */
export function TimePicker({
  label,
  value: controlled,
  defaultValue = '',
  onChange,
  required,
  disabled,
  error,
  hint,
  name,
  placeholder = 'Select a time',
  minuteStep = 5,
  className,
  'data-testid': testId,
}: TimePickerProps) {
  const [inner, setInner] = useState(defaultValue);
  const value = controlled ?? inner;
  const commit = (v: string) => {
    setInner(v);
    onChange?.(v);
  };
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(parseTime(value) ?? { h: 9, min: 0 });
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const text = formatTimeFriendly(value);
  const h12 = draft.h % 12 === 0 ? 12 : draft.h % 12;
  const pm = draft.h >= 12;
  const setHour = (h: number) => setDraft({ ...draft, h: (h % 12) + (pm ? 12 : 0) });
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);

  return (
    <div className={[styles.field, className ?? ''].filter(Boolean).join(' ')}>
      <span id={`${id}-label`} className={styles.label}>
        {label}
        {required ? <span aria-hidden> *</span> : null}
      </span>
      <button
        ref={trigger}
        type="button"
        id={id}
        className={[styles.trigger, error ? styles.invalid : ''].filter(Boolean).join(' ')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}`}
        aria-describedby={describedBy}
        disabled={disabled}
        data-testid={testId}
        onClick={() => {
          if (!open) setDraft(parseTime(value) ?? { h: 9, min: 0 });
          setOpen((o) => !o);
        }}
      >
        <Icon name="clock" size="sm" />
        <span className={[styles.value, text ? '' : styles.placeholder].join(' ')}>
          {text || placeholder}
        </span>
      </button>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={trigger}
        label={`Choose ${label}`}
      >
        <div className={styles.calendar}>
          <div className={styles.columns}>
            <div className={styles.column} role="group" aria-label="Hour">
              {Array.from({ length: 12 }, (_, i) => (i === 0 ? 12 : i)).map((h) => (
                <button
                  key={h}
                  type="button"
                  className={styles.choice}
                  aria-pressed={h === h12}
                  onClick={() => setHour(h)}
                >
                  {h}
                </button>
              ))}
            </div>
            <div className={styles.column} role="group" aria-label="Minute">
              {minutes.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={styles.choice}
                  aria-pressed={m === draft.min}
                  onClick={() => setDraft({ ...draft, min: m })}
                >
                  {String(m).padStart(2, '0')}
                </button>
              ))}
            </div>
            <div className={styles.column} role="group" aria-label="AM or PM">
              {(['AM', 'PM'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={styles.choice}
                  aria-pressed={(p === 'PM') === pm}
                  onClick={() => setDraft({ ...draft, h: (draft.h % 12) + (p === 'PM' ? 12 : 0) })}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                commit(toTime(draft));
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </Popover>
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
