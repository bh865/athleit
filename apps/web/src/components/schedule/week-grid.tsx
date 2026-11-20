'use client';

import {
  EVENT_TYPE_LABELS,
  dayHeading,
  groupByLocalDay,
  layoutDayBlocks,
  rowState,
  rowTimeLabel,
  weekGridHours,
  type EventType,
} from '@athleit/core';
import { useMemo, type KeyboardEvent } from 'react';

import { Icon, Mono } from '@/components/ui';

import type { ScheduleItem } from './items';
import styles from './schedule.module.css';

const TYPE_ICON: Record<EventType, 'flag' | 'users-three' | 'calendar-blank'> = {
  game: 'flag',
  practice: 'users-three',
  event: 'calendar-blank',
};
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;

/**
 * Week view: a real grid. One column per day, a time axis, and events as blocks positioned and sized by start and
 * end (in the viewer's zone). Overlapping events share the column. Staff blocks carry a compact Going and No reply
 * count. Arrow keys move between blocks (left and right by day, up and down in time order).
 */
export function WeekGrid({
  days,
  items,
  now,
  today,
  zone,
  showCounts,
  selectedId,
  onSelect,
}: {
  days: readonly string[];
  items: readonly ScheduleItem[];
  now: Date;
  today: string;
  zone: string;
  showCounts: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [startHour, endHour] = useMemo(() => weekGridHours(items, zone), [items, zone]);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const byDay = useMemo(() => {
    const out = new Map<string, ReturnType<typeof layoutDayBlocks<ScheduleItem>>>();
    for (const k of days)
      out.set(k, layoutDayBlocks(items, k, { zone, startHour, endHour }));
    return out;
  }, [days, items, zone, startHour, endHour]);
  const total = (endHour - startHour) * 60;
  // The hour height reuses the 64px schedule size token.
  const bodyHeight = `calc(${endHour - startHour} * var(--size-schedule-date-block-web))`;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-block]');
    if (!el) return;
    const col = Number(el.dataset.col);
    const idx = Number(el.dataset.idx);
    const root = e.currentTarget;
    const find = (c: number, i: number) =>
      root.querySelector<HTMLElement>(`[data-block][data-col="${c}"][data-idx="${i}"]`);
    let next: HTMLElement | null = null;
    if (e.key === 'ArrowDown') next = find(col, idx + 1);
    else if (e.key === 'ArrowUp') next = find(col, idx - 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      for (let c = col + dir; c >= 0 && c < days.length && !next; c += dir) next = find(c, 0);
    }
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  return (
    <div
      className={styles.week}
      style={{ gridTemplateColumns: `auto repeat(${days.length}, minmax(0, 1fr))` }}
      role="group"
      aria-label="Week schedule"
      onKeyDown={onKeyDown}
      data-testid="week-grid"
    >
      <div className={styles.weekCorner} />
      {days.map((k) => {
        const [, , d] = k.split('-');
        return (
          <div
            key={k}
            className={`${styles.weekDayHead} ${k === today ? styles.weekToday : ''}`}
            aria-label={dayHeading(k, today)}
          >
            <span>{dayHeading(k, today).split(',')[0]!.slice(0, 3).toUpperCase()}</span>
            <span className={styles.weekDayNum}>{Number(d)}</span>
          </div>
        );
      })}
      <div className={styles.weekAxis} style={{ height: bodyHeight }} aria-hidden>
        {hours.map((h) => (
          <span key={h} className={styles.weekAxisLabel} style={{ height: `${(100 / hours.length).toFixed(4)}%` }}>
            <Mono>{hourLabel(h)}</Mono>
          </span>
        ))}
      </div>
      {days.map((k, col) => {
        const blocks = byDay.get(k) ?? [];
        return (
          <div
            key={k}
            className={`${styles.weekCol} ${k === today ? styles.weekColToday : ''}`}
            style={{ height: bodyHeight }}
          >
            {hours.map((h) => (
              <span key={h} className={styles.weekHourLine} style={{ top: `${(((h - startHour) * 60) / total) * 100}%` }} aria-hidden />
            ))}
            {blocks.map((b, idx) => {
              const it = b.item;
              const state = rowState(it, now);
              const t = rowTimeLabel(it, zone);
              const cls = [
                styles.block,
                styles[`block_${it.type}`],
                state.live ? styles.blockLive : '',
                state.cancelled ? styles.blockCancelled : '',
                it.id === selectedId ? styles.blockSelected : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={it.id}
                  type="button"
                  className={cls}
                  data-block
                  data-col={col}
                  data-idx={idx}
                  data-testid="event-row"
                  data-event-id={it.id}
                  style={{
                    top: `${(b.top / total) * 100}%`,
                    height: `${(b.height / total) * 100}%`,
                    left: `${(b.column / b.columns) * 100}%`,
                    width: `${100 / b.columns}%`,
                  }}
                  onClick={() => onSelect(it.id)}
                  aria-current={it.id === selectedId ? 'true' : undefined}
                  aria-label={`${EVENT_TYPE_LABELS[it.type]}: ${it.title}, ${dayHeading(k, today)} ${t.range}${
                    state.cancelled ? ', cancelled' : state.live ? ', live now' : ''
                  }${showCounts && it.counts ? `, ${it.counts.going} going, ${it.counts.no_reply} no reply` : ''}`}
                >
                  <span className={styles.blockHead}>
                    <Icon name={TYPE_ICON[it.type]} size="sm" />
                    <Mono>{rowTimeLabel(it, zone).range.split(' – ')[0]}</Mono>
                    {state.live ? <span className={styles.liveDot} aria-hidden /> : null}
                  </span>
                  <span className={styles.blockTitle}>{it.title}</span>
                  {showCounts && it.counts && !state.cancelled ? (
                    <span className={styles.blockCounts} aria-hidden>
                      <Mono>
                        {it.counts.going} going · {it.counts.no_reply} no reply
                      </Mono>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Events grouped by their own local day, for callers that only need counts. */
export const itemsByDay = groupByLocalDay;
