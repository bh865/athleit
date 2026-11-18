'use client';

import {
  buildAttentionItems,
  capabilitiesForPlace,
  deriveAttention,
  payViewsFor,
  teamForScreen,
  type AppContext,
  type AttentionResult,
} from '@athleit/core';
import { getJoinRequests, type Result } from '@athleit/db/api';
import { listMyRegistrations, getWaiverCompliance } from '@athleit/db/registration';
import { getHouseholdPayments } from '@athleit/db/payments';
import { getNextUp, getTeamSchedule } from '@athleit/db/scheduling';
import { useEffect, useMemo, useState } from 'react';

import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

type Ctx = Pick<AppContext, 'kind' | 'role' | 'id' | 'title'> & {
  roles?: readonly AppContext['role'][];
};
const none = <T>(): Promise<Result<T[]>> =>
  Promise.resolve({ data: [] as T[], error: null } as Result<T[]>);

/**
 * One set of Home queries for the attention strip. Each source loads independently, so one failure only
 * drops its own chips. Sources the person cannot see are never requested.
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

  const [now, setNow] = useState(() => new Date());
  // Refetch when the tab becomes visible again (no polling).
  const [visibleTick, setVisibleTick] = useState(0);
  useEffect(() => {
    const on = () => {
      if (document.visibilityState === 'visible') {
        setNow(new Date());
        setVisibleTick((t) => t + 1);
      }
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  const k = visibleTick;
  const nextUp = useLoad(() => (sched ? getNextUp(getClient(), 6) : none<never>()), [sched, k]);
  const pay = useLoad(
    () => (views.payer ? getHouseholdPayments(getClient()) : none<never>()),
    [views.payer, k],
  );
  const regs = useLoad(
    () => (views.payer ? listMyRegistrations(getClient()) : none<never>()),
    [views.payer, k],
  );
  const joins = useLoad(
    () =>
      staff && caps?.has('joinRequests.decide')
        ? getJoinRequests(getClient(), teamId)
        : none<never>(),
    [staff, teamId, k],
  );
  const waivers = useLoad(
    () =>
      staff && caps?.has('registration.view')
        ? getWaiverCompliance(getClient(), teamId)
        : none<never>(),
    [staff, teamId, k],
  );
  const past = useLoad(
    () => (staff ? getTeamSchedule(getClient(), teamId, 'past', 10) : none<never>()),
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
        waiversNeedingAction: (waivers.data ?? []).filter((w) => w.status !== 'signed').length,
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
