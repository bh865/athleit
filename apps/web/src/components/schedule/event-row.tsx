'use client';

import { EVENT_TYPE_LABELS, rowState, rowTimeLabel, type EventType } from '@athleit/core';

import { Icon } from '@/components/ui';

import { CountsBar } from './counts-bar';
import type { ScheduleItem } from './items';
import { RsvpChipRow } from './rsvp-chips';
import styles from './schedule.module.css';
import { useViewerZone } from './use-viewer-zone';

const TYPE_ICON: Record<EventType, 'flag' | 'users-three' | 'calendar-blank'> = {
  game: 'flag',
  practice: 'users-three',
  event: 'calendar-blank',
};

/** "Tue 5:30 PM · Field 3" style caption, in the event's own time zone. */
export function eventCaption(item: ScheduleItem, viewerZone: string | null): string {
  const t = rowTimeLabel(item, viewerZone);
  return [t.range, item.location].filter(Boolean).join(' · ');
}

const OUTCOME = { win: 'W', loss: 'L', tie: 'T' } as const;

/**
 * One event in the agenda (and the day lists). Same item model on every audience; what differs is the state
 * line: a chip and quick actions per child for families, the counts bar for staff and club admins.
 * Priority when several states apply: Live now, then Cancelled, then Needs reply, then Updated.
 */
export function EventRow({
  item,
  now,
  selected,
  onSelect,
  showTeam = false,
  showCounts = false,
  onChanged,
}: {
  item: ScheduleItem;
  now: Date;
  selected?: boolean;
  onSelect: (id: string) => void;
  /** Households with more than one team. */
  showTeam?: boolean;
  /** Staff and club admins see the counts bar. */
  showCounts?: boolean;
  onChanged?: () => void;
}) {
  const viewerZone = useViewerZone();
  const t = rowTimeLabel(item, viewerZone);
  const state = rowState(item, now);
  const cancelled = state.cancelled;
  const when = new Date(item.starts_at);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: item.timezone,
    weekday: 'short',
    day: 'numeric',
  }).formatToParts(when);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const result = item.result
    ? `${OUTCOME[item.result.outcome as keyof typeof OUTCOME] ?? ''} ${item.result.our}–${item.result.their}`.trim()
    : null;
  const vs = item.type === 'game' && item.opponent ? `vs. ${item.opponent}${item.home_away === 'home' ? ' · Home' : item.home_away === 'away' ? ' · Away' : ''}` : null;
  const label = [
    `${EVENT_TYPE_LABELS[item.type]}: ${item.title}`,
    `${weekday} ${t.range}`,
    item.location,
    cancelled ? 'cancelled' : state.live ? 'live now' : null,
  ]
    .filter(Boolean)
    .join(', ');
  const cls = [
    styles.row,
    selected ? styles.rowSelected : '',
    cancelled ? styles.rowCancelled : '',
    state.live ? styles.rowLive : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li>
      <div className={cls} data-testid="event-row" data-event-id={item.id} data-emphasis={state.emphasis ?? ''}>
        <button
          type="button"
          className={styles.rowMain}
          onClick={() => onSelect(item.id)}
          aria-label={label}
          aria-current={selected ? 'true' : undefined}
        >
          <span className={styles.dateBlock} aria-hidden>
            <span className={styles.weekday}>{weekday.toUpperCase()}</span>
            <span className={styles.dayNumber}>{day}</span>
          </span>
          <span className={styles.body}>
            <span className={styles.title}>
              {item.title}
              {state.series ? (
                <span className={styles.seriesIcon} title="Part of a series">
                  <Icon name="repeat" size="sm" />
                  <span className={styles.srOnly}>Part of a series</span>
                </span>
              ) : null}
            </span>
            <span className={styles.meta}>
              {cancelled ? (
                <>
                  <Icon name="x-circle" size="sm" /> Cancelled
                  {item.cancelled_reason ? `: ${item.cancelled_reason}` : ''}
                </>
              ) : (
                <>
                  <span className={styles.mono}>{t.range}</span>
                  {item.location ? ` · ${item.location}` : ''}
                  {t.yourTime ? <span className={styles.yourTime}> · Your time {t.yourTime}</span> : null}
                </>
              )}
            </span>
            {vs ? <span className={styles.meta}>{vs}</span> : null}
            {showTeam && item.team_name ? <span className={styles.meta}>{item.team_name}</span> : null}
          </span>
          <span className={styles.tags}>
            {state.live ? (
              <span className={styles.livePill}>
                <span className={styles.liveDot} aria-hidden /> Live now
              </span>
            ) : null}
            {state.needsReply && !cancelled ? <span className={styles.needsReply}>Needs reply</span> : null}
            {state.updated ? <span className={styles.typeChip}>Updated</span> : null}
            {result ? (
              <span className={styles.typeChip}>
                <span className={styles.mono}>Final {result}</span>
              </span>
            ) : null}
            <span className={styles.typeChip}>
              <Icon name={TYPE_ICON[item.type]} size="sm" /> {EVENT_TYPE_LABELS[item.type]}
            </span>
            <Icon name="caret-right" size="sm" />
          </span>
        </button>
        {item.children && item.children.length > 0 ? (
          <div className={styles.replies}>
            {item.children.map((c) => (
              <RsvpChipRow
                key={c.player_id}
                eventId={item.id}
                child={c}
                quickActions={state.quickActions}
                onChanged={onChanged}
              />
            ))}
          </div>
        ) : null}
        {showCounts && item.counts && !cancelled ? (
          <div className={styles.replies}>
            <CountsBar counts={item.counts} legend={false} />
          </div>
        ) : null}
      </div>
    </li>
  );
}
