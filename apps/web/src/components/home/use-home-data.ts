'use client';

import {
  billingAttention,
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
import { getBillingTerms, getTeamBilling } from '@athleit/db/billing';
import { getConnectedAccountStatus, getHouseholdPayments } from '@athleit/db/payments';
import { listMyRegistrations, getWaiverCompliance } from '@athleit/db/registration';
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

  const [now, setNow] = useState(() => new Date());
  // Refetch when the tab becomes visible again (no polling); the clock alone ticks each minute.
  const [visibleTick, setVisibleTick] = useState(0);
  useEffect(() => {
    const on = () => {
      if (document.visibilityState === 'visible') {
        setNow(new Date());
        setVisibleTick((t) => t + 1);
      }
    };
    document.addEventListener('visibilitychange', on);
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      document.removeEventListener('visibilitychange', on);
      clearInterval(timer);
    };
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
  const claims = useLoad(
    () => (views.payer ? getPlayerLoginClaims(getClient()) : none<never>()),
    [views.payer, k],
  );
  const joins = useLoad(
    () =>
      staff && caps?.has('joinRequests.decide')
        ? getJoinRequests(getClient(), teamId)
        : none<never>(),
    [staff, teamId, k],
  );
  const links = useLoad(
    () => (linkAdmin ? getLinkRequests(getClient(), { clubId }) : none<never>()),
    [linkAdmin, clubId, k],
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
  const payout = useLoad(
    () =>
      payoutsAdmin && owner
        ? getConnectedAccountStatus(getClient(), owner)
        : Promise.resolve({ data: null, error: null } as never),
    [payoutsAdmin, owner?.teamId, owner?.clubId, k],
  );

  // Team admins only: the team's own subscription (trial ending, payment problem, paused actions). Null while billing is off.
  const billingAdmin = Boolean(caps?.has('billing.manage'));
  const billingView = useLoad(
    () =>
      billingAdmin
        ? getTeamBilling(getClient(), teamId)
        : (Promise.resolve({ data: null, error: null }) as never),
    [billingAdmin, teamId, k],
  );
  const billingTerms = useLoad(
    () =>
      billingAdmin
        ? getBillingTerms(getClient())
        : (Promise.resolve({ data: null, error: null }) as never),
    [billingAdmin],
  );

  const sources = [
    nextUp,
    pay,
    regs,
    claims,
    joins,
    links,
    waivers,
    past,
    payout,
    billingView,
    billingTerms,
  ];
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
        billing: (() => {
          const b = billingAttention(
            billingView.data as never,
            now,
            (billingTerms.data as { trial_reminder_days?: number[] } | null)?.trial_reminder_days ??
              [],
          );
          return b
            ? {
                title: b.title,
                detail: b.detail,
                href: `/teams/${teamId}/billing`,
                urgent: b.tone === 'critical',
              }
            : null;
        })(),
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
    billingView.data,
    billingTerms.data,
    teamId,
    dual,
    clubId,
    team?.title,
  ]);

  const refresh = () => setVisibleTick((t) => t + 1);
  return { attention, loading, error, reload, refresh, tick: visibleTick, now };
}
