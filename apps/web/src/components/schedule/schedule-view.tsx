'use client';

import {
  addDays,
  groupByLocalDay,
  localDateKey,
  monthGrid,
  monthTitle,
  queryRangeForDays,
  shiftMonth,
  weekDays,
  weekTitle,
  type Sport,
} from '@athleit/core';
import { getHouseholdScheduleRange, getTeamScheduleRange } from '@athleit/db/scheduling';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import { LoadState } from '@/components/app/states';
import {
  Button,
  EmptyState,
  Glass,
  Icon,
  IconButton,
  SegmentedControl,
  Text,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { CalendarFeed } from './calendar-feed';
import { EventDetail } from './event-detail';
import { EventForm } from './event-form';
import { EventRow } from './event-row';
import { fromHouseholdRows, fromTeamRows, type ScheduleItem } from './items';
import { PlacesManager } from './places-manager';
import styles from './schedule.module.css';
import { useViewerZone } from './use-viewer-zone';

export type ScheduleScope =
  { kind: 'team'; teamId: string; sport: Sport; canManage: boolean } | { kind: 'household' };

type ViewMode = 'week' | 'month';
const WEEKDAY_HEADS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const dayHeading = (key: string) => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
};

/** The Schedule screen: Week/Month, rows with a date block, and the right-hand event drawer. */
export function ScheduleView({
  scope,
  title = 'Schedule',
}: {
  scope: ScheduleScope;
  title?: string;
}) {
  const viewerZone = useViewerZone() ?? 'UTC';
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const selectedId = params.get('event');
  const today = localDateKey(new Date(), viewerZone);

  const [mode, setMode] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState(today);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [places, setPlaces] = useState(false);
  const [feed, setFeed] = useState(false);

  const [y, m] = anchor.split('-').map(Number) as [number, number];
  const days = useMemo(
    () => (mode === 'week' ? weekDays(anchor) : monthGrid(y, m).flat()),
    [mode, anchor, y, m],
  );
  const first = days[0]!;
  const last = days[days.length - 1]!;

  const res = useLoad(async () => {
    const { from, to } = queryRangeForDays(first, last);
    const client = getClient();
    if (scope.kind === 'team') {
      const r = await getTeamScheduleRange(client, scope.teamId, from, to);
      return r.error ? r : { data: fromTeamRows(r.data), error: null };
    }
    const r = await getHouseholdScheduleRange(client, from, to);
    return r.error ? r : { data: fromHouseholdRows(r.data), error: null };
  }, [scope.kind === 'team' ? scope.teamId : 'household', first, last]);

  const grouped = useMemo(() => groupByLocalDay(res.data ?? []), [res.data]);
  const visible = new Set(days);
  const dayItems = (k: string): ScheduleItem[] => grouped.get(k) ?? [];

  const select = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set('event', id);
      else next.delete('event');
      router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const step = (dir: -1 | 1) => {
    if (mode === 'week') setAnchor(addDays(anchor, dir * 7));
    else {
      const s = shiftMonth(y, m, dir);
      setAnchor(`${s.year}-${String(s.month).padStart(2, '0')}-01`);
    }
    setPickedDay(null);
  };
  const rangeLabel = mode === 'week' ? weekTitle(days) : monthTitle(y, m);
  const canManage = scope.kind === 'team' && scope.canManage;

  const weekKeys = days.filter((k) => dayItems(k).length > 0);
  const listDays = mode === 'week' ? weekKeys : pickedDay ? [pickedDay] : [];
  const emptyWeek = mode === 'week' && weekKeys.length === 0;

  return (
    <div className={styles.layout}>
      <div className={styles.head}>
        <Text variant="title" as="h1">
          {title}
        </Text>
        <div className={styles.controls}>
          <SegmentedControl
            label="View"
            value={mode}
            onChange={(v) => {
              setMode(v);
              setPickedDay(null);
            }}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
            ]}
          />
          {canManage ? (
            <Button onClick={() => setCreating(true)} data-testid="new-event">
              <Icon name="plus" size="sm" /> New event
            </Button>
          ) : null}
        </div>
      </div>

      <div className={styles.head}>
        <div className={styles.nav}>
          <IconButton
            icon="caret-left"
            label={mode === 'week' ? 'Previous week' : 'Previous month'}
            onClick={() => step(-1)}
          />
          <span className={styles.range} aria-live="polite" data-testid="range-label">
            {rangeLabel}
          </span>
          <IconButton
            icon="caret-right"
            label={mode === 'week' ? 'Next week' : 'Next month'}
            onClick={() => step(1)}
          />
          <Button
            variant="ghost"
            onClick={() => {
              setAnchor(today);
              setPickedDay(null);
            }}
          >
            Today
          </Button>
        </div>
        <div className={styles.controls}>
          {canManage ? (
            <Button variant="ghost" onClick={() => setPlaces(true)}>
              <Icon name="map-pin" size="sm" /> Places
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => setFeed(true)}>
            <Icon name="link" size="sm" /> Calendar link
          </Button>
        </div>
      </div>

      <LoadState loading={res.loading && !res.data} error={res.error} onRetry={res.reload}>
        {mode === 'month' ? (
          <div className={styles.month} role="grid" aria-label={rangeLabel}>
            {WEEKDAY_HEADS.map((d) => (
              <div key={d} className={styles.monthHead} role="columnheader">
                {d}
              </div>
            ))}
            {days.map((k) => {
              const items = dayItems(k);
              const outside = k.slice(0, 7) !== `${y}-${String(m).padStart(2, '0')}`;
              return (
                <div
                  key={k}
                  role="gridcell"
                  className={[
                    styles.cell,
                    outside ? styles.cellOutside : '',
                    k === today ? styles.cellToday : '',
                    k === pickedDay ? styles.cellSelected : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setPickedDay(k)}
                >
                  <span className={styles.cellDay}>{Number(k.slice(8))}</span>
                  {items.slice(0, 3).map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      className={`${styles.cellEvent} ${it.status === 'cancelled' ? styles.cellEventCancelled : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        select(it.id);
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
        ) : null}

        {emptyWeek ? (
          <EmptyState
            icon="calendar-blank"
            title="Nothing scheduled this week"
            body={
              canManage
                ? 'Add a practice or game and families will see it right away.'
                : 'New events will show up here.'
            }
            action={
              canManage ? <Button onClick={() => setCreating(true)}>New event</Button> : undefined
            }
          />
        ) : (
          <ul className={styles.list} aria-label="Events">
            {listDays
              .filter((k) => visible.has(k))
              .map((k) => (
                <li key={k}>
                  <h2 className={styles.dayHeading}>{dayHeading(k)}</h2>
                  <ul className={styles.list}>
                    {dayItems(k).map((it) => (
                      <EventRow
                        key={it.id}
                        item={it}
                        selected={it.id === selectedId}
                        onSelect={select}
                      />
                    ))}
                  </ul>
                </li>
              ))}
          </ul>
        )}
      </LoadState>

      {selectedId ? (
        <Glass
          as="aside"
          level="sheet"
          className={styles.drawer}
          aria-label="Event details"
          data-testid="event-drawer"
        >
          <EventDetail
            key={selectedId}
            eventId={selectedId}
            variant="drawer"
            onClose={() => select(null)}
            onChanged={res.reload}
          />
        </Glass>
      ) : null}

      {scope.kind === 'team' ? (
        <EventForm
          open={creating}
          onClose={() => setCreating(false)}
          teamId={scope.teamId}
          sport={scope.sport}
          onSaved={(msg) => {
            toast(msg);
            res.reload();
          }}
        />
      ) : null}
      {scope.kind === 'team' ? (
        <PlacesManager open={places} onClose={() => setPlaces(false)} teamId={scope.teamId} />
      ) : null}
      <CalendarFeed open={feed} onClose={() => setFeed(false)} />
    </div>
  );
}
