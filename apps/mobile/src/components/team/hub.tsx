import {
  buildTeamAttention,
  teamTabCounts,
  type TeamAttentionRow,
  type TeamTab,
} from '@athleit/core';
import { getJoinRequests, type Result } from '@athleit/db/api';
import { getCollectionSummary, listPaymentEvents } from '@athleit/db/payments';
import {
  getCapacitySummary,
  getWaiverCompliance,
  listRegistrationEvents,
} from '@athleit/db/registration';
import { createContext, use, useMemo, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { useTeam } from './team-context';

type JoinRows = NonNullable<Awaited<ReturnType<typeof getJoinRequests>>['data']>;

interface Hub {
  rows: TeamAttentionRow[];
  counts: Partial<Record<TeamTab, number>>;
  joinRequests: JoinRows;
  pendingRequests: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
}
const Ctx = createContext<Hub | null>(null);

const none = <T,>(): Promise<Result<T[]>> =>
  Promise.resolve({ data: [] as T[], error: null } as Result<T[]>);

/**
 * One set of queries for the Overview hub and the count badges on the tab pills. Each source loads on its own
 * so a failure only drops its own row; sources the person cannot read are never requested. Counts and first
 * names only.
 */
export function TeamHubProvider({ children }: { children: ReactNode }) {
  const { team, caps } = useTeam();
  const teamId = team.id;
  const canJoin = caps.has('joinRequests.decide');
  const canWaivers = caps.has('registration.view');
  const canPay = caps.has('payments.view');

  const joins = useLoad(
    () => (canJoin ? getJoinRequests(supabase, teamId) : none<never>()),
    [canJoin, teamId],
  );
  const waivers = useLoad(
    () => (canWaivers ? getWaiverCompliance(supabase, teamId) : none<never>()),
    [canWaivers, teamId],
  );
  const regs = useLoad(async () => {
    type R = Result<{ title: string; toReview: number }[]>;
    if (!canWaivers) return { data: [], error: null } as R;
    const events = await listRegistrationEvents(supabase, { teamId });
    if (events.error) return events as unknown as R;
    const open = events.data.filter((e) => e.status === 'open');
    const sums = await Promise.all(open.map((e) => getCapacitySummary(supabase, e.id)));
    return {
      data: open.map((e, i) => ({
        title: e.title,
        toReview: (sums[i]?.data?.submitted ?? 0) + (sums[i]?.data?.pending_verification ?? 0),
      })),
      error: null,
    } as R;
  }, [canWaivers, teamId]);
  const pay = useLoad(async () => {
    type R = Result<{ title: string; unpaid: number }[]>;
    if (!canPay) return { data: [], error: null } as R;
    const events = await listPaymentEvents(supabase, { teamId });
    if (events.error) return events as unknown as R;
    const now = Date.now();
    const due = events.data.filter(
      (e) => e.status !== 'draft' && e.status !== 'cancelled' && Date.parse(e.due_at) < now,
    );
    const sums = await Promise.all(due.map((e) => getCollectionSummary(supabase, e.id)));
    return {
      data: due.map((e, i) => ({ title: e.title, unpaid: sums[i]?.data?.unpaid_count ?? 0 })),
      error: null,
    } as R;
  }, [canPay, teamId]);

  const loading = [joins, waivers, regs, pay].some((s) => s.loading);
  const error = [joins, waivers, regs, pay].every((s) => s.error) ? (joins.error ?? 'Error') : null;
  const reload = () => [joins, waivers, regs, pay].forEach((s) => s.reload());
  const value = useMemo<Hub>(() => {
    const rows = buildTeamAttention({
      joinRequests: joins.data ?? [],
      waivers: waivers.data ?? [],
      registrations: regs.data ?? [],
      overduePayments: pay.data ?? [],
    });
    return {
      rows,
      counts: teamTabCounts(rows),
      joinRequests: joins.data ?? [],
      pendingRequests: (joins.data ?? []).filter((r) => r.status === 'pending').length,
      loading,
      error,
      reload,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reload` closes over the four loaders above
  }, [joins.data, waivers.data, regs.data, pay.data, loading, error]);
  return <Ctx value={value}>{children}</Ctx>;
}

export function useTeamHub() {
  const v = use(Ctx);
  if (!v) throw new Error('useTeamHub must be used inside <TeamHubProvider>');
  return v;
}
