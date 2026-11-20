'use client';

import { EVENT_TYPE_LABELS, monthGrid, type EventType } from '@athleit/core';
import type { KeyboardEvent } from 'react';

import { Icon, Mono } from '@/components/ui';

import type { ScheduleItem } from './items';
import styles from './schedule.module.css';

const WEEKDAY_HEADS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TYPE_ICON: Record<EventType, 'flag' | 'users-three' | 'calendar-blank'> = {
  game: 'flag',
  practice: 'users-three',
  event: 'calendar-blank',
};
const TYPES: EventType[] = ['game', 'practice', 'event'];

/**
 * Month view: a calm Sunday-start grid. Each day shows one icon per event type with a count (cancelled events do
 * not count), today in lime; picking a day opens its list beside the grid. Arrow keys move by day and week.
 */
export function MonthGrid({
  year,
  month,
  label,
  today,
  pickedDay,
  itemsByDay,
  onPickDay,
}: {
  year: number;
  month: number;
  label: string;
  today: string;
  pickedDay: string | null;
  itemsByDay: ReadonlyMap<string, ScheduleItem[]>;
  onPickDay: (day: string) => void;
}) {
  const days = monthGrid(year, month).flat();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? 7 : e.key === 'ArrowUp' ? -7 : 0;
    if (!step) return;
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-day]');
    if (!cell) return;
    const i = days.indexOf(cell.dataset.day!);
    const next = days[i + step];
    if (!next) return;
    e.preventDefault();
    e.currentTarget.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus();
  }

  return (
    <div className={styles.month} role="group" aria-label={label} onKeyDown={onKeyDown} data-testid="month-grid">
      {WEEKDAY_HEADS.map((d) => (
        <div key={d} className={styles.monthHead} aria-hidden>
          {d}
        </div>
      ))}
      {days.map((k) => {
        const items = itemsByDay.get(k) ?? [];
        const live = items.filter((i) => i.status !== 'cancelled');
        const counts = TYPES.map((t) => [t, live.filter((i) => i.type === t).length] as const).filter(([, n]) => n > 0);
        const cls = [
          styles.cell,
          k.slice(0, 7) !== prefix ? styles.cellOutside : '',
          k === today ? styles.cellToday : '',
          k === pickedDay ? styles.cellSelected : '',
        ]
          .filter(Boolean)
          .join(' ');
        const spoken = counts.map(([t, n]) => `${n} ${EVENT_TYPE_LABELS[t].toLowerCase()}${n === 1 ? '' : 's'}`).join(', ');
        return (
          <button
            key={k}
            type="button"
            className={cls}
            data-day={k}
            aria-pressed={k === pickedDay}
            aria-label={`${k}${k === today ? ', today' : ''}${spoken ? `, ${spoken}` : ', no events'}`}
            onClick={() => onPickDay(k)}
          >
            <span className={styles.cellDay}>{Number(k.slice(8))}</span>
            <span className={styles.cellCounts} aria-hidden>
              {counts.map(([t, n]) => (
                <span key={t} className={styles.cellCount}>
                  <Icon name={TYPE_ICON[t]} size="sm" />
                  <Mono>{n}</Mono>
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
