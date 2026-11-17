'use client';

import { monthGrid } from '@athleit/core';

import type { ScheduleItem } from './items';
import styles from './schedule.module.css';

const WEEKDAY_HEADS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Month view: a Sunday-start grid, up to three events per day, today in lime. */
export function MonthGrid({
  year,
  month,
  label,
  today,
  pickedDay,
  itemsByDay,
  onPickDay,
  onSelect,
}: {
  year: number;
  month: number;
  label: string;
  today: string;
  pickedDay: string | null;
  itemsByDay: ReadonlyMap<string, ScheduleItem[]>;
  onPickDay: (day: string) => void;
  onSelect: (id: string) => void;
}) {
  const days = monthGrid(year, month).flat();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return (
    <div className={styles.month} role="grid" aria-label={label}>
      {WEEKDAY_HEADS.map((d) => (
        <div key={d} className={styles.monthHead} role="columnheader">
          {d}
        </div>
      ))}
      {days.map((k) => {
        const items = itemsByDay.get(k) ?? [];
        const cls = [
          styles.cell,
          k.slice(0, 7) !== prefix ? styles.cellOutside : '',
          k === today ? styles.cellToday : '',
          k === pickedDay ? styles.cellSelected : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div key={k} role="gridcell" className={cls} onClick={() => onPickDay(k)}>
            <span className={styles.cellDay}>{Number(k.slice(8))}</span>
            {items.slice(0, 3).map((it) => (
              <button
                key={it.id}
                type="button"
                className={`${styles.cellEvent} ${it.status === 'cancelled' ? styles.cellEventCancelled : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(it.id);
                }}
                aria-label={`${it.title}${it.status === 'cancelled' ? ', cancelled' : ''}`}
              >
                {it.title}
              </button>
            ))}
            {items.length > 3 ? (
              <span className={styles.cellMore}>+{items.length - 3} more</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
