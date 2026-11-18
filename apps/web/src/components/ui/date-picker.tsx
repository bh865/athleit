'use client';

import {
  MONTH_NAMES,
  MONTH_SHORT,
  addDays,
  addMonths,
  clampIso,
  daysInMonth,
  formatDateFriendly,
  formatDateLong,
  isDateDisabled,
  monthGrid,
  parseIso,
  todayIso,
  toIso,
  weekdayOrder,
  yearRange,
  type DateLimits,
} from '@athleit/ui-core';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { IconButton } from './button';
import styles from './date-picker.module.css';
import { Icon } from './icon';
import { Popover } from './popover';

export interface DatePickerProps extends DateLimits {
  label: string;
  /** ISO date `YYYY-MM-DD`, or '' when empty. */
  value?: string;
  /** Uncontrolled initial value (forms that read the hidden `name` input). */
  defaultValue?: string;
  onChange?: (iso: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | undefined;
  hint?: string;
  /** Form field name (submits the ISO value). */
  name?: string;
  placeholder?: string;
  /** 0 = Sunday (default), 1 = Monday. */
  weekStart?: 0 | 1;
  /** Years offered when no min/max is set. Birth dates: `{ before: 100, after: 0 }`. */
  yearSpan?: { before: number; after: number };
  className?: string;
  'data-testid'?: string;
}

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type View = 'days' | 'months' | 'years';

/**
 * Calendar popover field. Selecting a day commits and closes at once (one tap, no Done button):
 * Escape or an outside press cancels. Month/year chooser for far-away dates such as a birth year.
 */
export function DatePicker({
  label,
  value: controlled,
  defaultValue = '',
  onChange,
  required,
  disabled,
  error,
  hint,
  name,
  placeholder = 'Select a date',
  min,
  max,
  disabledDates,
  weekStart = 0,
  yearSpan = { before: 100, after: 20 },
  className,
  'data-testid': testId,
}: DatePickerProps) {
  const [inner, setInner] = useState(defaultValue);
  const value = controlled ?? inner;
  const commit = (v: string) => {
    setInner(v);
    onChange?.(v);
  };
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const limits = useMemo(() => ({ min, max, disabledDates }), [min, max, disabledDates]);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const text = formatDateFriendly(value);

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
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="calendar-blank" size="sm" />
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
        <Calendar
          value={value}
          limits={limits}
          weekStart={weekStart}
          yearSpan={yearSpan}
          onPick={(iso) => {
            commit(iso);
            setOpen(false);
            trigger.current?.focus();
          }}
        />
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

/** The calendar itself (also used by the gallery). */
export function Calendar({
  value,
  limits,
  weekStart,
  yearSpan,
  onPick,
}: {
  value: string;
  limits: DateLimits;
  weekStart: 0 | 1;
  yearSpan: { before: number; after: number };
  onPick: (iso: string) => void;
}) {
  const today = todayIso();
  const start = useMemo(
    () => (parseIso(value) ? value : clampIso(today, limits)),
    // Only the value at open matters: later navigation is local state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [focus, setFocus] = useState(start);
  const [view, setView] = useState<View>('days');
  const gridRef = useRef<HTMLDivElement>(null);
  const focusPending = useRef(true);
  const fp = parseIso(focus)!;

  // Move DOM focus to the active day after keyboard navigation or opening.
  useEffect(() => {
    if (view !== 'days' || !focusPending.current) return;
    focusPending.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
  }, [focus, view]);

  const go = (iso: string) => {
    focusPending.current = true;
    setFocus(clampIso(iso, limits));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    const col = (new Date(Date.UTC(fp.y, fp.m - 1, fp.d)).getUTCDay() - weekStart + 7) % 7;
    const next =
      k === 'ArrowLeft'
        ? addDays(focus, -1)
        : k === 'ArrowRight'
          ? addDays(focus, 1)
          : k === 'ArrowUp'
            ? addDays(focus, -7)
            : k === 'ArrowDown'
              ? addDays(focus, 7)
              : k === 'PageUp'
                ? addMonths(focus, e.shiftKey ? -12 : -1)
                : k === 'PageDown'
                  ? addMonths(focus, e.shiftKey ? 12 : 1)
                  : k === 'Home'
                    ? addDays(focus, -col)
                    : k === 'End'
                      ? addDays(focus, 6 - col)
                      : null;
    if (next) {
      e.preventDefault();
      go(next);
    }
  };

  const years = yearRange(limits, yearSpan, new Date().getFullYear());
  const minYear = parseIso(limits.min)?.y;
  const maxYear = parseIso(limits.max)?.y;

  return (
    <div className={styles.calendar}>
      <div className={styles.head}>
        <IconButton
          icon="caret-left"
          label={view === 'days' ? 'Previous month' : 'Previous year'}
          onClick={() => go(addMonths(focus, view === 'days' ? -1 : -12))}
        />
        <button
          type="button"
          className={styles.title}
          aria-live="polite"
          aria-label={`${MONTH_NAMES[fp.m - 1]} ${fp.y}, choose month and year`}
          onClick={() => setView(view === 'days' ? 'years' : 'days')}
        >
          {MONTH_NAMES[fp.m - 1]} {fp.y}
          <Icon name="caret-down" size="sm" />
        </button>
        <IconButton
          icon="caret-right"
          label={view === 'days' ? 'Next month' : 'Next year'}
          onClick={() => go(addMonths(focus, view === 'days' ? 1 : 12))}
        />
      </div>

      {view === 'years' ? (
        <div className={styles.choices} role="group" aria-label="Choose a year">
          {years
            .slice()
            .reverse()
            .map((y) => (
              <button
                key={y}
                type="button"
                className={styles.choice}
                aria-pressed={y === fp.y}
                ref={(el) => {
                  if (el && y === fp.y) el.scrollIntoView?.({ block: 'center' });
                }}
                onClick={() => {
                  go(toIso({ y, m: fp.m, d: Math.min(fp.d, daysInMonth(y, fp.m)) }));
                  setView('months');
                }}
              >
                {y}
              </button>
            ))}
        </div>
      ) : view === 'months' ? (
        <div className={styles.choices} role="group" aria-label="Choose a month">
          {MONTH_SHORT.map((m, i) => {
            const first = `${String(fp.y).padStart(4, '0')}-${String(i + 1).padStart(2, '0')}-01`;
            const off =
              (minYear === fp.y && limits.min && first.slice(0, 7) < limits.min.slice(0, 7)) ||
              (maxYear === fp.y && limits.max && first.slice(0, 7) > limits.max.slice(0, 7));
            return (
              <button
                key={m}
                type="button"
                className={styles.choice}
                aria-pressed={i + 1 === fp.m}
                disabled={Boolean(off)}
                onClick={() => {
                  go(toIso({ y: fp.y, m: i + 1, d: Math.min(fp.d, daysInMonth(fp.y, i + 1)) }));
                  setView('days');
                }}
              >
                {m}
              </button>
            );
          })}
        </div>
      ) : (
        <div
          role="grid"
          aria-label={`${MONTH_NAMES[fp.m - 1]} ${fp.y}`}
          onKeyDown={onKeyDown}
          ref={gridRef}
        >
          <div className={styles.grid} role="row">
            {weekdayOrder(weekStart).map((w) => (
              <span
                key={w}
                className={styles.weekday}
                role="columnheader"
                aria-label={WEEKDAY_SHORT[w]}
              >
                {WEEKDAY_LETTERS[w]}
              </span>
            ))}
          </div>
          {monthGrid(fp.y, fp.m, weekStart).map((week, wi) => (
            <div key={wi} className={styles.grid} role="row">
              {week.map((d) => {
                const disabled = isDateDisabled(d.iso, limits);
                const selected = d.iso === value;
                return (
                  <div
                    key={d.iso}
                    role="gridcell"
                    aria-selected={selected}
                    style={{ display: 'contents' }}
                  >
                    <button
                      type="button"
                      className={[
                        styles.day,
                        d.inMonth ? '' : styles.outside,
                        d.iso === today ? styles.today : '',
                        selected ? styles.selected : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      tabIndex={d.iso === focus ? 0 : -1}
                      aria-label={`${formatDateLong(d.iso)}${d.iso === today ? ', today' : ''}`}
                      aria-current={d.iso === today ? 'date' : undefined}
                      aria-disabled={disabled || undefined}
                      onClick={() => !disabled && onPick(d.iso)}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && disabled) e.preventDefault();
                      }}
                    >
                      {d.day}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
