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
import {
  getJoinRequests,
  getLinkRequests,
  getPlayerLoginClaims,
  type Result,
} from '@athleit/db/api';
import { getConnectedAccountStatus, getHouseholdPayments } from '@athleit/db/payments';
import { listMyRegistrations, getWaiverCompliance } from '@athleit/db/registration';
import { getNextUp, getTeamSchedule } from '@athleit/db/scheduling';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

type Ctx = Pick<AppContext, 'kind' | 'role' | 'id' | 'title'> & {
  roles?: readonly AppContext['role'][];
};
const none = <T>(): Promise<Result<T[]>> =>
  Promise.resolve({ data: [] as T[], error: null } as Result<T[]>);

/**
 * One set of Home queries for "Needs your attention". Each source loads independently and sources the person
 * cannot see are never requested. A failed source sets `error` (the section offers a retry) but never drops the
 * items the other sources produced. `now` ticks every minute so chips stay current without re-fetching.
 */
export function useHomeData(
  contexts: readonly Ctx[],
  active: Pick<AppContext, 'kind' | 'id'> | null,
) {
  const team = teamForScreen(contexts, active);
  const caps = team ? capabilitiesForPlace(contexts, 'team', team.id) : null;
  const club = contexts.find((c) => c.kind === 'club') ?? null;
  const clubCaps = club ? capabilitiesForPlace(contexts, 'club', club.id) : null;
  const views = payViewsFor(contexts, active);
  const staffCaps = views.staff
    ? capabilitiesForPlace(contexts, views.staff.kind, views.staff.id)
    : null;
  const sched = Boolean(caps?.has('schedule.view'));
  const staff = Boolean(team?.isStaff);
  const teamId = team?.id ?? '';
  const clubId = club?.id ?? '';
  const owner = views.staff
    ? views.staff.kind === 'team'
      ? { teamId: views.staff.id }
      : { clubId: views.staff.id }
    : null;
  const payoutsAdmin = Boolean(owner && staffCaps?.has('payments.setup'));
  const linkAdmin = Boolean(clubCaps?.has('club.decideLink'));

  const [k, setK] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const first = useRef(true);
  // Refetch when the screen regains focus (not on first mount); the clock alone ticks each minute.
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      setNow(new Date());
      setK((t) => t + 1);
    }, [setK]),
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const nextUp = useLoad(() => (sched ? getNextUp(supabase, 6) : none<never>()), [sched, k]);
  const pay = useLoad(
    () => (views.payer ? getHouseholdPayments(supabase) : none<never>()),
    [views.payer, k],
  );
  const regs = useLoad(
    () => (views.payer ? listMyRegistrations(supabase) : none<never>()),
    [views.payer, k],
  );
  const claims = useLoad(
    () => (views.payer ? getPlayerLoginClaims(supabase) : none<never>()),
    [views.payer, k],
  );
  const joins = useLoad(
    () =>
      staff && caps?.has('joinRequests.decide') ? getJoinRequests(supabase, teamId) : none<never>(),
    [staff, teamId, k],
  );
  const links = useLoad(
    () => (linkAdmin ? getLinkRequests(supabase, { clubId }) : none<never>()),
    [linkAdmin, clubId, k],
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
  const payout = useLoad(
    () =>
      payoutsAdmin && owner
        ? getConnectedAccountStatus(supabase, owner)
        : Promise.resolve({ data: null, error: null } as never),
    [payoutsAdmin, owner?.teamId, owner?.clubId, k],
  );

  const sources = [nextUp, pay, regs, claims, joins, links, waivers, past, payout];
  const loading = sources.some((r) => r.loading);
  const error = sources.find((r) => r.error)?.error ?? null;
  const reload = () => sources.forEach((r) => r.error && r.reload());

  // A merged list (the person is staff somewhere and a parent somewhere) tags each row with its place.
  const dual = Boolean(views.payer && (staff || owner || linkAdmin));
  const tags = dual
    ? { family: 'Household', team: team?.title ?? club?.title ?? 'Your team' }
    : undefined;

  const attention: AttentionResult = useMemo(() => {
    const games = (past.data ?? []).filter(
      (e) => e.type === 'game' && e.status !== 'cancelled' && e.our_score == null,
    );
    const pendingJoins = (joins.data ?? []).filter((r) => r.status === 'pending');
    const pendingClaims = claims.data ?? [];
    const payoutStatus = payout.data as {
      exists_account?: boolean;
      charges_enabled?: boolean;
      payouts_enabled?: boolean;
    } | null;
    return deriveAttention(
      buildAttentionItems({
        now,
        nextUp: (nextUp.data ?? []) as never,
        payments: pay.data ?? [],
        registrations: regs.data ?? [],
        pendingJoinRequests: pendingJoins.length,
        singleJoinRequestId: pendingJoins.length === 1 ? pendingJoins[0]!.id : null,
        loginClaims: {
          count: pendingClaims.length,
          singleId: pendingClaims.length === 1 ? pendingClaims[0]!.claim_id : null,
        },
        linkRequests: {
          count: (links.data ?? []).filter((r) => r.status === 'pending').length,
          href: `/clubs/${clubId}`,
        },
        payoutsNeedAction: Boolean(
          payoutStatus?.exists_account &&
          !(payoutStatus.charges_enabled && payoutStatus.payouts_enabled),
        ),
        waiversNeedingAction: (waivers.data ?? []).filter(
          (w) => normalizeWaiverStatus(w.status) !== 'signed',
        ).length,
        gamesWithoutResult: games.map((g) => ({
          event_id: g.id,
          title: g.title,
          starts_at: g.starts_at,
        })),
        ...(tags ? { tags } : {}),
      }),
      now,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    now,
    nextUp.data,
    pay.data,
    regs.data,
    claims.data,
    joins.data,
    links.data,
    waivers.data,
    past.data,
    payout.data,
    dual,
    clubId,
    team?.title,
  ]);

  const refresh = () => setK((t) => t + 1);
  return { attention, loading, error, reload, refresh, now };
}
