'use client';

import {
  agendaWindow,
  addDays,
  mergeById,
  type ScheduleItemLike,
} from '@athleit/core';
import { getHouseholdScheduleRange, getTeamScheduleRange } from '@athleit/db/scheduling';
import { useMemo, useState } from 'react';

import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { fromHouseholdRows, fromTeamRows, type ScheduleItem } from './items';
import type { ScheduleScope } from './schedule-view';

/** Each page covers this many days (the range functions allow at most 100). */
export const AGENDA_PAGE_DAYS = 60;
/** How many pages "Show more" can add: about a year either way. */
export const AGENDA_MAX_PAGES = 6;

/**
 * The agenda's items: pages of range reads walking away from today (later for Upcoming, earlier for Past), merged
 * and de-duplicated. Older pages stay on screen while a new one loads.
 */
export function useAgenda(scope: ScheduleScope, direction: 'upcoming' | 'past', todayKey: string, now: Date) {
  const [pages, setPages] = useState(1);
  const scopeKey = scope.kind === 'team' ? scope.teamId : 'household';
  const res = useLoad(async () => {
    const client = getClient();
    const windows: { from: string; to: string }[] = [];
    let key = direction === 'upcoming' ? todayKey : addDays(todayKey, 0);
    for (let i = 0; i < pages; i++) {
      const w = agendaWindow(key, direction === 'upcoming' ? 'forward' : 'backward', AGENDA_PAGE_DAYS);
      windows.push(w);
      key = w.nextKey;
    }
    const lists = await Promise.all(
      windows.map(async (w) => {
        if (scope.kind === 'team') {
          const r = await getTeamScheduleRange(client, scope.teamId, w.from, w.to);
          return r.error ? r : { data: fromTeamRows(r.data), error: null };
        }
        const r = await getHouseholdScheduleRange(client, w.from, w.to);
        return r.error ? r : { data: fromHouseholdRows(r.data), error: null };
      }),
    );
    const failed = lists.find((l) => l.error);
    if (failed?.error) return { data: null, error: failed.error };
    return { data: mergeById(...lists.map((l) => l.data as ScheduleItem[])), error: null };
  }, [scopeKey, direction, todayKey, pages]) as ReturnType<typeof useLoad<ScheduleItem[]>>;

  const items = useMemo(() => {
    const t = now.getTime();
    return (res.data ?? []).filter((i: ScheduleItemLike) =>
      direction === 'upcoming' ? Date.parse(i.ends_at) >= t : Date.parse(i.ends_at) < t,
    );
  }, [res.data, direction, now]);

  return {
    items,
    loading: res.loading,
    error: res.error,
    reload: res.reload,
    hasMore: pages < AGENDA_MAX_PAGES,
    showMore: () => setPages((p) => Math.min(p + 1, AGENDA_MAX_PAGES)),
    loadedFully: res.data != null,
  };
}
