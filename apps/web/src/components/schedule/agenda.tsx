'use client';

import {
  applyFilters,
  groupAgenda,
  hasActiveFilters,
  showTeamName,
  type ScheduleFilters,
} from '@athleit/core';
import { getTeamRecord } from '@athleit/db/scheduling';
import { useEffect, useMemo, useRef } from 'react';

import { LoadState } from '@/components/app/states';
import { Button, EmptyState, Mono, SegmentedControl } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { EventRow } from './event-row';
import type { ScheduleItem } from './items';
import styles from './schedule.module.css';
import { ScheduleFilterBar } from './schedule-filters';
import type { ScheduleScope } from './schedule-view';
import { useAgenda } from './use-agenda';

export type AgendaWhen = 'upcoming' | 'past';

/** Team record header for Past: wins, losses, ties and the season label. Team places only. */
function RecordHeader({ teamId }: { teamId: string }) {
  const res = useLoad(() => getTeamRecord(getClient(), teamId), [teamId]);
  const r = res.data;
  if (!r || r.games === 0) return null;
  return (
    <div className={styles.record} data-testid="record-header">
      <span className={styles.recordNumbers}>
        <Mono>
          {r.wins}-{r.losses}-{r.ties}
        </Mono>
      </span>
      <span className={styles.meta}>
        W-L-T · {r.season_label} · {r.games} {r.games === 1 ? 'game' : 'games'}
      </span>
    </div>
  );
}

/**
 * Agenda: upcoming events grouped by day under sticky headings, or Past with the record and results. Filters sit
 * above; "Show more" pages the range (60 days at a time).
 */
export function Agenda({
  scope,
  when,
  onWhenChange,
  filters,
  onFiltersChange,
  now,
  todayKey,
  selectedId,
  onSelect,
  canManage,
  onNew,
  onChanged,
  reloadToken,
}: {
  scope: ScheduleScope;
  when: AgendaWhen;
  onWhenChange: (w: AgendaWhen) => void;
  filters: ScheduleFilters;
  onFiltersChange: (f: ScheduleFilters) => void;
  now: Date;
  todayKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  canManage: boolean;
  onNew: () => void;
  onChanged: () => void;
  /** Bump to reload after a write elsewhere (new event, edit, cancel). */
  reloadToken: number;
}) {
  const agenda = useAgenda(scope, when, todayKey, now);
  const family = scope.kind === 'household';
  const filtered = useMemo(() => applyFilters(agenda.items, filters, now), [agenda.items, filters, now]);
  const days = useMemo(
    () => groupAgenda(filtered, todayKey, when === 'upcoming' ? 'asc' : 'desc'),
    [filtered, todayKey, when],
  );
  const showTeam = family && showTeamName(agenda.items);

  // Writes elsewhere (new event, edit, cancel) bump the token; reload once per bump.
  const firstRun = useRef(true);
  const { reload } = agenda;
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    reload();
  }, [reloadToken, reload]);

  return (
    <div className={styles.agenda}>
      <div className={styles.head}>
        <SegmentedControl
          label="Upcoming or past"
          value={when}
          onChange={onWhenChange}
          options={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'past', label: 'Past' },
          ]}
        />
      </div>
      <ScheduleFilterBar filters={filters} onChange={onFiltersChange} items={agenda.items} family={family} />
      {when === 'past' && scope.kind === 'team' ? <RecordHeader teamId={scope.teamId} /> : null}
      <LoadState
        loading={agenda.loading && !agenda.loadedFully}
        error={agenda.error}
        onRetry={agenda.reload}
      >
        {days.length === 0 ? (
          hasActiveFilters(filters) ? (
            <EmptyState
              icon="funnel-simple"
              title="No events match these filters"
              body="Try removing a filter to see more."
              action={<Button variant="secondary" onClick={() => onFiltersChange({ types: [], childId: null, teamId: null, needsReply: false })}>Clear filters</Button>}
            />
          ) : when === 'past' ? (
            <EmptyState icon="calendar-blank" title="No past events yet" body="Finished games and practices will be listed here." />
          ) : (
            <EmptyState
              icon="calendar-blank"
              title="Nothing coming up"
              body={canManage ? 'Add a practice or game and families will see it right away.' : 'New events will show up here.'}
              action={canManage ? <Button onClick={onNew}>New event</Button> : undefined}
            />
          )
        ) : (
          <div className={styles.agendaDays} aria-label="Events">
            {days.map((d) => (
              <section key={d.dateKey} className={styles.agendaDay} aria-label={d.heading}>
                <h2 className={`${styles.stickyHeading} ${d.isToday ? styles.stickyToday : ''}`}>{d.heading}</h2>
                <ul className={styles.list}>
                  {d.items.map((it: ScheduleItem) => (
                    <EventRow
                      key={it.id}
                      item={it}
                      now={now}
                      selected={it.id === selectedId}
                      onSelect={onSelect}
                      showTeam={showTeam}
                      showCounts={!family && when === 'upcoming'}
                      onChanged={onChanged}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </LoadState>
      {agenda.hasMore && days.length > 0 ? (
        <div className={styles.showMore}>
          <Button variant="secondary" onClick={agenda.showMore} disabled={agenda.loading}>
            {when === 'upcoming' ? 'Show later events' : 'Show earlier events'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
