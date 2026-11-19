import {
  buildAttentionItems,
  normalizeWaiverStatus,
  capabilitiesForPlace,
  deriveAttention,
  payViewsFor,
  teamForScreen,
  type AppContext,
  type AttentionResult,
} from '@athleit/core';
import { getJoinRequests, type Result } from '@athleit/db/api';
import { getHouseholdPayments } from '@athleit/db/payments';
import { getWaiverCompliance, listMyRegistrations } from '@athleit/db/registration';
import { getNextUp, getTeamSchedule } from '@athleit/db/scheduling';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

type Ctx = Pick<AppContext, 'kind' | 'role' | 'id' | 'title'> & {
  roles?: readonly AppContext['role'][];
};
const none = <T>(): Promise<Result<T[]>> =>
  Promise.resolve({ data: [] as T[], error: null } as Result<T[]>);

/**
 * Same queries as web Home, one set per page. Each source loads independently so one failure only drops its
 * own chips; sources the person cannot see are never requested. Refetches when the screen regains focus.
 */
export function useHomeData(
  contexts: readonly Ctx[],
  active: Pick<AppContext, 'kind' | 'id'> | null,
) {
  const team = teamForScreen(contexts, active);
  const caps = team ? capabilitiesForPlace(contexts, 'team', team.id) : null;
  const views = payViewsFor(contexts, active);
  const sched = Boolean(caps?.has('schedule.view'));
  const staff = Boolean(team?.isStaff);
  const teamId = team?.id ?? '';

  const [k, setK] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      setNow(new Date());
      setK((t) => t + 1);
    }, []),
  );

  const nextUp = useLoad(() => (sched ? getNextUp(supabase, 6) : none<never>()), [sched, k]);
  const pay = useLoad(
    () => (views.payer ? getHouseholdPayments(supabase) : none<never>()),
    [views.payer, k],
  );
  const regs = useLoad(
    () => (views.payer ? listMyRegistrations(supabase) : none<never>()),
    [views.payer, k],
  );
  const joins = useLoad(
    () =>
      staff && caps?.has('joinRequests.decide') ? getJoinRequests(supabase, teamId) : none<never>(),
    [staff, teamId, k],
  );
  const waivers = useLoad(
    () =>
      staff && caps?.has('registration.view')
        ? getWaiverCompliance(supabase, teamId)
        : none<never>(),
    [staff, teamId, k],
  );
  const past = useLoad(
    () => (staff ? getTeamSchedule(supabase, teamId, 'past', 10) : none<never>()),
    [staff, teamId, k],
  );

  const loading = [nextUp, pay, regs, joins, waivers, past].some((r) => r.loading);

  const attention: AttentionResult = useMemo(() => {
    const games = (past.data ?? []).filter(
      (e) => e.type === 'game' && e.status !== 'cancelled' && e.our_score == null,
    );
    return deriveAttention(
      buildAttentionItems({
        now,
        nextUp: (nextUp.data ?? []) as never,
        payments: pay.data ?? [],
        registrations: regs.data ?? [],
        pendingJoinRequests: (joins.data ?? []).filter((r) => r.status === 'pending').length,
        waiversNeedingAction: (waivers.data ?? []).filter(
          (w) => normalizeWaiverStatus(w.status) !== 'signed',
        ).length,
        gamesWithoutResult: games.map((g) => ({
          event_id: g.id,
          title: g.title,
          starts_at: g.starts_at,
        })),
      }),
    );
  }, [now, nextUp.data, pay.data, regs.data, joins.data, waivers.data, past.data]);

  return { attention, loading };
}
