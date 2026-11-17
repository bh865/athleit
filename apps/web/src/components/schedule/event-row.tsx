'use client';

import { EVENT_TYPE_LABELS, describeEventTime } from '@athleit/core';

import { Icon } from '@/components/ui';

import type { ScheduleItem } from './items';
import styles from './schedule.module.css';
import { useViewerZone } from './use-viewer-zone';

/** "Tue 5:30 PM · Field 3" style caption, in the event's own time zone. */
export function eventCaption(item: ScheduleItem, viewerZone: string | null): string {
  const t = describeEventTime(item.starts_at, item.ends_at, item.timezone, viewerZone);
  return [t.startLabel, item.location].filter(Boolean).join(' · ');
}

export function EventRow({
  item,
  selected,
  onSelect,
}: {
  item: ScheduleItem;
  selected?: boolean;
  onSelect: (id: string) => void;
}) {
  const viewerZone = useViewerZone();
  const t = describeEventTime(item.starts_at, item.ends_at, item.timezone, viewerZone);
  const cancelled = item.status === 'cancelled';
  const cls = [styles.row, selected ? styles.rowSelected : '', cancelled ? styles.rowCancelled : '']
    .filter(Boolean)
    .join(' ');
  const result = item.result
    ? `${item.result.outcome === 'win' ? 'W' : item.result.outcome === 'loss' ? 'L' : 'T'} ${item.result.our}-${item.result.their}`
    : null;
  const label = `${EVENT_TYPE_LABELS[item.type]}: ${item.title}, ${t.dateLabel} ${t.startLabel}${
    item.location ? `, ${item.location}` : ''
  }${cancelled ? ', cancelled' : ''}`;
  return (
    <li>
      <button
        type="button"
        className={cls}
        onClick={() => onSelect(item.id)}
        aria-label={label}
        aria-current={selected ? 'true' : undefined}
        data-testid="event-row"
        data-event-id={item.id}
      >
        <span className={styles.dateBlock} aria-hidden>
          <span className={styles.weekday}>{t.weekdayShort}</span>
          <span className={styles.dayNumber}>{t.dayNumber}</span>
        </span>
        <span className={styles.body}>
          <span className={styles.title}>{item.title}</span>
          <span className={styles.meta}>
            {cancelled
              ? `Cancelled${item.cancelled_reason ? `: ${item.cancelled_reason}` : ''}`
              : eventCaption(item, viewerZone)}
          </span>
          {item.team_name ? <span className={styles.meta}>{item.team_name}</span> : null}
        </span>
        <span className={styles.tags}>
          {result ? <span className={styles.typeChip}>{result}</span> : null}
          <span className={styles.typeChip}>{EVENT_TYPE_LABELS[item.type]}</span>
          <Icon name="caret-right" size="sm" />
        </span>
      </button>
    </li>
  );
}
