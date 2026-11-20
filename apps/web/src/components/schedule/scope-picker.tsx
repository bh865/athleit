'use client';

import { EDIT_SCOPES, EDIT_SCOPE_LABELS, type EditScope } from '@athleit/core';
import { useId, type KeyboardEvent } from 'react';

import styles from './schedule.module.css';

const EFFECTS: Record<'edit' | 'cancel', Record<EditScope, string>> = {
  edit: {
    this: 'Only this event changes. The rest of the series stays as it is.',
    this_and_following: 'This event and every later one in the series change.',
    all: 'Every event in the series changes, past ones included.',
  },
  cancel: {
    this: 'Only this event is cancelled.',
    this_and_following: 'This event and every later one in the series are cancelled.',
    all: 'Every event in the series that has not happened yet is cancelled.',
  },
};

/**
 * "This event / This and following / All events" as radio cards, each with what it will do in plain words.
 * Shown only for events that belong to a series. Arrow keys move the choice.
 */
export function ScopePicker({
  value,
  onChange,
  kind = 'edit',
}: {
  value: EditScope;
  onChange: (v: EditScope) => void;
  kind?: 'edit' | 'cancel';
}) {
  const uid = useId();
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = EDIT_SCOPES.indexOf(value);
    const next = EDIT_SCOPES[(i + dir + EDIT_SCOPES.length) % EDIT_SCOPES.length]!;
    onChange(next);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[EDIT_SCOPES.indexOf(next)]?.focus();
  }
  return (
    <div role="radiogroup" aria-label="Apply to" className={styles.scope} onKeyDown={onKeyDown} data-testid="scope-picker">
      {EDIT_SCOPES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          aria-labelledby={`${uid}-${s}-t`}
          aria-describedby={`${uid}-${s}-d`}
          tabIndex={value === s ? 0 : -1}
          className={`${styles.scopeCard} ${value === s ? styles.scopeOn : ''}`}
          onClick={() => onChange(s)}
        >
          <span id={`${uid}-${s}-t`} className={styles.scopeTitle}>
            {EDIT_SCOPE_LABELS[s]}
          </span>
          <span id={`${uid}-${s}-d`} className={styles.meta}>
            {EFFECTS[kind][s]}
          </span>
        </button>
      ))}
    </div>
  );
}
