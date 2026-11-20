import {
  agendaWindow,
  mergeById,
  type ScheduleItemLike,
} from '@athleit/core';
import { getHouseholdScheduleRange, getTeamScheduleRange } from '@athleit/db/scheduling';
import { useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { fromHouseholdRows, fromTeamRows, type ScheduleItem } from './items';

const PAGE_DAYS = 60;
const MAX_PAGES = 6;

export type ScheduleScope = { kind: 'team'; teamId: string } | { kind: 'household' };

/**
 * Agenda items: pages of range reads walking away from today (later for Upcoming, earlier for Past), merged and
 * de-duplicated. Earlier pages stay on screen while the next one loads.
 */
export function useAgenda(
  scope: ScheduleScope | null,
  direction: 'upcoming' | 'past',
  todayKey: string,
  now: Date,
) {
  const [pages, setPages] = useState(1);
  const scopeKey = !scope ? 'none' : scope.kind === 'team' ? scope.teamId : 'household';
  const res = useLoad<ScheduleItem[]>(async () => {
    if (!scope) return { data: [], error: null };
    let key = todayKey;
    const windows: { from: string; to: string }[] = [];
    for (let i = 0; i < pages; i++) {
      const w = agendaWindow(key, direction === 'upcoming' ? 'forward' : 'backward', PAGE_DAYS);
      windows.push(w);
      key = w.nextKey;
    }
    const lists = await Promise.all(
      windows.map(async (w) => {
        if (scope.kind === 'team') {
          const r = await getTeamScheduleRange(supabase, scope.teamId, w.from, w.to);
          return r.error ? r : { data: fromTeamRows(r.data), error: null };
        }
        const r = await getHouseholdScheduleRange(supabase, w.from, w.to);
        return r.error ? r : { data: fromHouseholdRows(r.data), error: null };
      }),
    );
    const failed = lists.find((l) => l.error);
    if (failed?.error) return { data: null, error: failed.error };
    return { data: mergeById(...lists.map((l) => l.data as ScheduleItem[])), error: null };
  }, [scopeKey, direction, todayKey, pages]);

  const items = useMemo(() => {
    const t = now.getTime();
    return (res.data ?? []).filter((i: ScheduleItemLike) =>
      direction === 'upcoming' ? Date.parse(i.ends_at) >= t : Date.parse(i.ends_at) < t,
    );
  }, [res.data, direction, now]);

  return {
    items,
    loading: res.loading && res.data == null,
    loadingMore: res.loading && res.data != null,
    error: res.error,
    reload: res.reload,
    hasMore: pages < MAX_PAGES,
    showMore: () => setPages((p) => Math.min(p + 1, MAX_PAGES)),
  };
}
