'use client';

import {
  addDays,
  applyFilters,
  dayHeading,
  shortDate,
  filtersFromParams,
  filtersToParams,
  groupByLocalDay,
  localDateKey,
  monthGrid,
  monthTitle,
  queryRangeForDays,
  shiftMonth,
  weekDays,
  weekTitle,
  type ScheduleFilters,
  type Sport,
} from '@athleit/core';
import { getHouseholdScheduleRange, getTeamScheduleRange } from '@athleit/db/scheduling';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { LoadState } from '@/components/app/states';
import {
  Button,
  EmptyState,
  Glass,
  Icon,
  IconButton,
  PageHeader,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';
import { useMinWidth } from '@/components/roster/use-media-query';

import { Agenda, type AgendaWhen } from './agenda';
import { CalendarFeed } from './calendar-feed';
import { EventDetail } from './event-detail';
import { EventForm } from './event-form';
import { EventRow } from './event-row';
import { MonthGrid } from './month-grid';
import { WeekGrid } from './week-grid';
import { MoreMenu } from './more-menu';
import { ScheduleFilterBar } from './schedule-filters';
import { fromHouseholdRows, fromTeamRows, type ScheduleItem } from './items';
import { OpponentsManager } from './opponents-manager';
import { PlacesManager } from './places-manager';
import styles from './schedule.module.css';
import { useViewerZone } from './use-viewer-zone';

export type ScheduleScope =
  { kind: 'team'; teamId: string; sport: Sport; canManage: boolean } | { kind: 'household' };

type ViewMode = 'agenda' | 'week' | 'month';

/** The Schedule screen: Week/Month, rows with a date block, and the right-hand event drawer. */
export function ScheduleView({
  scope,
  subtitle,
  embedded = false,
}: {
  scope: ScheduleScope;
  /** Line under the page title, e.g. the team name. */
  subtitle?: string;
  /** Inside a team page that already has a heading: render only the controls. */
  embedded?: boolean;
}) {
  const viewerZone = useViewerZone() ?? 'UTC';
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const selectedId = params.get('event');
  const today = localDateKey(new Date(), viewerZone);

  const canManage = scope.kind === 'team' && scope.canManage;
  // Agenda is the default for families and players (what needs a reply), Week for staff (the shape of the week).
  const viewParam = params.get('view');
  const mode: ViewMode =
    viewParam === 'agenda' || viewParam === 'week' || viewParam === 'month'
      ? viewParam
      : canManage
        ? 'week'
        : 'agenda';
  const when: AgendaWhen = params.get('when') === 'past' ? 'past' : 'upcoming';
  const filters = useMemo(() => filtersFromParams((k) => params.get(k)), [params]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const [reloadToken, setReloadToken] = useState(0);
  const [anchor, setAnchor] = useState(today);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [places, setPlaces] = useState(false);
  const [opponents, setOpponents] = useState(false);
  const [feed, setFeed] = useState(false);

  const [y, m] = anchor.split('-').map(Number) as [number, number];
  const days = useMemo(
    () => (mode === 'month' ? monthGrid(y, m).flat() : weekDays(anchor)),
    [mode, anchor, y, m],
  );
  // Tablet and below: three days at a time (the anchor day and the next two), stepped with the arrows.
  const wide = useMinWidth(1100);
  const gridDays = useMemo(() => (wide ? days : [anchor, addDays(anchor, 1), addDays(anchor, 2)]), [wide, days, anchor]);
  const first = days[0]!;
  const last = days[days.length - 1]!;

  const res = useLoad(async () => {
    if (mode === 'agenda') return { data: [] as ScheduleItem[], error: null };
    const { from, to } = queryRangeForDays(first, last);
    const client = getClient();
    if (scope.kind === 'team') {
      const r = await getTeamScheduleRange(client, scope.teamId, from, to);
      return r.error ? r : { data: fromTeamRows(r.data), error: null };
    }
    const r = await getHouseholdScheduleRange(client, from, to);
    return r.error ? r : { data: fromHouseholdRows(r.data), error: null };
  }, [scope.kind === 'team' ? scope.teamId : 'household', first, last, mode]);

  const filteredItems = useMemo(
    () => applyFilters(res.data ?? [], filters, now),
    [res.data, filters, now],
  );
  const grouped = useMemo(() => groupByLocalDay(filteredItems), [filteredItems]);
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

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const setFilters = (f: ScheduleFilters) =>
    patchParams({ type: null, child: null, team: null, needs: null, ...filtersToParams(f) });
  const reloadAll = () => {
    res.reload();
    setReloadToken((t) => t + 1);
  };

  const step = (dir: -1 | 1) => {
    if (mode === 'week') setAnchor(addDays(anchor, dir * (wide ? 7 : 3)));
    else {
      const s = shiftMonth(y, m, dir);
      setAnchor(`${s.year}-${String(s.month).padStart(2, '0')}-01`);
    }
    setPickedDay(null);
  };
  const rangeLabel =
    mode === 'week'
      ? wide
        ? weekTitle(days)
        : `${shortDate(gridDays[0]!)} – ${shortDate(gridDays[2]!)}`
      : monthTitle(y, m);
  const hasFilters = filters.types.length > 0 || filters.childId != null || filters.teamId != null || filters.needsReply;
  const emptyWeek = mode === 'week' && gridDays.every((k) => dayItems(k).length === 0) && !hasFilters;

  const headerControls = (
    <div className={styles.controls}>
      <SegmentedControl
        label="View"
        value={mode}
        onChange={(v) => {
          setPickedDay(null);
          patchParams({ view: v });
        }}
        options={[
          { value: 'agenda', label: 'Agenda' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
      />
      {canManage ? (
        <Button onClick={() => setCreating(true)} data-testid="new-event">
          <Icon name="plus" size="sm" /> New event
        </Button>
      ) : null}
      <MoreMenu
        canManage={canManage}
        onChoose={(k) => (k === 'places' ? setPlaces(true) : k === 'opponents' ? setOpponents(true) : setFeed(true))}
      />
    </div>
  );

  return (
    <div className={styles.layout}>
      {embedded ? (
        <div className={styles.head}>{headerControls}</div>
      ) : (
        <PageHeader title="Schedule" subtitle={subtitle} actions={headerControls} />
      )}

      {mode === 'agenda' ? (
        <Agenda
          scope={scope}
          when={when}
          onWhenChange={(w) => patchParams({ when: w === 'past' ? 'past' : null })}
          filters={filters}
          onFiltersChange={setFilters}
          now={now}
          todayKey={today}
          selectedId={selectedId}
          onSelect={select}
          canManage={canManage}
          onNew={() => setCreating(true)}
          onChanged={reloadAll}
          reloadToken={reloadToken}
        />
      ) : (
        <>
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
          </div>
          <ScheduleFilterBar
            filters={filters}
            onChange={setFilters}
            items={res.data ?? []}
            family={scope.kind === 'household'}
          />
        </>
      )}

      {mode !== 'agenda' ? (
      <LoadState loading={res.loading && !res.data} error={res.error} onRetry={res.reload}>
        {mode === 'month' ? (
          <div className={styles.monthLayout}>
            <MonthGrid
              year={y}
              month={m}
              label={rangeLabel}
              today={today}
              pickedDay={pickedDay}
              itemsByDay={grouped}
              onPickDay={setPickedDay}
            />
            <section className={styles.dayPanel} aria-label="Selected day" data-testid="day-panel">
              {pickedDay ? (
                <>
                  <h2 className={styles.dayHeading}>{dayHeading(pickedDay, today)}</h2>
                  {dayItems(pickedDay).length === 0 ? (
                    <p className={styles.meta}>Nothing scheduled this day.</p>
                  ) : (
                    <ul className={styles.list}>
                      {dayItems(pickedDay).map((it) => (
                        <EventRow
                          key={it.id}
                          item={it}
                          now={now}
                          selected={it.id === selectedId}
                          onSelect={select}
                          showCounts={canManage}
                          showTeam={scope.kind === 'household'}
                          onChanged={reloadAll}
                        />
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className={styles.meta}>Pick a day to see its events.</p>
              )}
            </section>
          </div>
        ) : null}

        {mode === 'week' ? (
          emptyWeek ? (
            <EmptyState
              icon="calendar-blank"
              title="Nothing scheduled this week"
              body={
                canManage
                  ? 'Add a practice or game and families will see it right away.'
                  : 'New events will show up here.'
              }
              action={canManage ? <Button onClick={() => setCreating(true)}>New event</Button> : undefined}
            />
          ) : (
            <WeekGrid
              days={gridDays}
              items={filteredItems}
              now={now}
              today={today}
              zone={viewerZone}
              showCounts={canManage}
              selectedId={selectedId}
              onSelect={select}
            />
          )
        ) : null}
      </LoadState>
      ) : null}

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
            onChanged={reloadAll}
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
            reloadAll();
          }}
        />
      ) : null}
      {scope.kind === 'team' ? (
        <PlacesManager open={places} onClose={() => setPlaces(false)} teamId={scope.teamId} />
      ) : null}
      {scope.kind === 'team' ? (
        <OpponentsManager
          open={opponents}
          onClose={() => setOpponents(false)}
          teamId={scope.teamId}
        />
      ) : null}
      <CalendarFeed open={feed} onClose={() => setFeed(false)} />
    </div>
  );
}
