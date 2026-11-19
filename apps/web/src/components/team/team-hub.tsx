'use client';

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
import {
  createContext,
  use,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { createPortal } from 'react-dom';

import { useTeam } from '@/components/app/team-context';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

type JoinRows = Awaited<ReturnType<typeof getJoinRequests>>['data'];
type WaiverRows = Awaited<ReturnType<typeof getWaiverCompliance>>['data'];

interface Hub {
  rows: TeamAttentionRow[];
  counts: Partial<Record<TeamTab, number>>;
  joinRequests: NonNullable<JoinRows>;
  waivers: NonNullable<WaiverRows>;
  pendingRequests: number;
  loading: boolean;
  /** Set when every source the person may read failed. */
  error: string | null;
  reload: () => void;
  headerSlot: HTMLElement | null;
  setHeaderSlot: Dispatch<SetStateAction<HTMLElement | null>>;
}
const Ctx = createContext<Hub | null>(null);

const none = <T,>(): Promise<Result<T[]>> =>
  Promise.resolve({ data: [] as T[], error: null } as Result<T[]>);

/**
 * One set of queries for the Overview hub and the count badges on the tab row. Each source loads on its own,
 * so a failure only drops its own row; sources the person cannot read are never requested. Counts and first
 * names only: nothing here carries last names, medical answers or signed text.
 */
export function TeamHubProvider({ children }: { children: ReactNode }) {
  const { team, caps } = useTeam();
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const teamId = team.id;
  const canJoin = caps.has('joinRequests.decide');
  const canWaivers = caps.has('registration.view');
  const canPay = caps.has('payments.view');

  const joins = useLoad(
    () => (canJoin ? getJoinRequests(getClient(), teamId) : none<never>()),
    [canJoin, teamId],
  );
  const waivers = useLoad(
    () => (canWaivers ? getWaiverCompliance(getClient(), teamId) : none<never>()),
    [canWaivers, teamId],
  );
  const regs = useLoad(async () => {
    if (!canWaivers)
      return { data: [], error: null } as Result<{ title: string; toReview: number }[]>;
    const events = await listRegistrationEvents(getClient(), { teamId });
    if (events.error) return events as unknown as Result<{ title: string; toReview: number }[]>;
    const open = events.data.filter((e) => e.status === 'open');
    const sums = await Promise.all(open.map((e) => getCapacitySummary(getClient(), e.id)));
    const failed = sums.find((s) => s.error);
    if (failed?.error) return { data: null, error: failed.error } as Result<never>;
    return {
      data: open.map((e, i) => ({
        title: e.title,
        toReview: (sums[i]?.data?.submitted ?? 0) + (sums[i]?.data?.pending_verification ?? 0),
      })),
      error: null,
    } as Result<{ title: string; toReview: number }[]>;
  }, [canWaivers, teamId]);
  const pay = useLoad(async () => {
    if (!canPay) return { data: [], error: null } as Result<{ title: string; unpaid: number }[]>;
    const events = await listPaymentEvents(getClient(), { teamId });
    if (events.error) return events as unknown as Result<{ title: string; unpaid: number }[]>;
    const now = Date.now();
    const due = events.data.filter(
      (e) => e.status !== 'draft' && e.status !== 'cancelled' && Date.parse(e.due_at) < now,
    );
    const sums = await Promise.all(due.map((e) => getCollectionSummary(getClient(), e.id)));
    return {
      data: due.map((e, i) => ({ title: e.title, unpaid: sums[i]?.data?.unpaid_count ?? 0 })),
      error: null,
    } as Result<{ title: string; unpaid: number }[]>;
  }, [canPay, teamId]);

  const sources = [joins, waivers, regs, pay];
  const loading = sources.some((s) => s.loading);
  const error = sources.every((s) => s.error) ? (joins.error ?? 'Could not load.') : null;
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
      waivers: waivers.data ?? [],
      pendingRequests: (joins.data ?? []).filter((r) => r.status === 'pending').length,
      loading,
      error,
      reload: () => sources.forEach((s) => s.reload()),
      headerSlot,
      setHeaderSlot,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sources` is rebuilt every render; its data is listed
  }, [joins.data, waivers.data, regs.data, pay.data, loading, error, headerSlot]);

  return <Ctx value={value}>{children}</Ctx>;
}

export function useTeamHub() {
  const v = use(Ctx);
  if (!v) throw new Error('useTeamHub must be used inside <TeamHubProvider>');
  return v;
}

/** Puts a tab's one primary action in the page header, to the right of the team name. */
export function HeaderAction({ children }: { children: ReactNode }) {
  const { headerSlot } = useTeamHub();
  return headerSlot ? createPortal(children, headerSlot) : null;
}

/** The empty element the header's primary action is portaled into. */
export function HeaderSlot({ className }: { className?: string }) {
  const { setHeaderSlot } = useTeamHub();
  return <div ref={setHeaderSlot} className={className} />;
}
