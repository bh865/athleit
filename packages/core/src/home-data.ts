import { RSVP_LISTING_MS, type AttentionItem } from './home-attention';
import { formatCents } from './money';

/**
 * Pure builder for the attention strip. Takes the shapes the Home queries already return (structural, so core
 * does not depend on the db package) and produces items. Counts and first names only: nothing here may carry
 * last names, emails or notes.
 */
export interface AttentionInput {
  now: Date;
  nextUp?: readonly {
    event_id: string;
    title: string;
    starts_at: string;
    type?: string;
    children: readonly { player_id: string; first_name: string; status: string | null }[];
  }[];
  payments?: readonly {
    request_id: string;
    title: string;
    amount_cents: number;
    due_at: string;
    can_pay: boolean;
  }[];
  registrations?: readonly {
    id: string;
    player_first_name: string | null;
    event_title: string;
    next_step: string | null;
  }[];
  /** Staff only. */
  pendingJoinRequests?: number;
  waiversNeedingAction?: number;
  /** When exactly one request is pending its id lets the row approve or decline in place. */
  singleJoinRequestId?: string | null;
  /** The viewer's own pending player-login claims (guardians decide these). */
  loginClaims?: { count: number; singleId?: string | null };
  /** Pending club link requests a club admin can decide; `href` is the club page. */
  linkRequests?: { count: number; href: string };
  /** A payout account that has an account but cannot yet take charges or pay out. */
  payoutsNeedAction?: boolean;
  /** Place tags, set only when one list merges several places ("Household", a team name). */
  tags?: { family?: string; team?: string };
  gamesWithoutResult?: readonly { event_id: string; title: string; starts_at: string }[];
}

export function buildAttentionItems(i: AttentionInput): AttentionItem[] {
  const out: AttentionItem[] = [];
  const fam = i.tags?.family ? { placeTag: i.tags.family } : {};
  const team = i.tags?.team ? { placeTag: i.tags.team } : {};
  for (const e of i.nextUp ?? []) {
    const startsIn = Date.parse(e.starts_at) - i.now.getTime();
    if (!(startsIn <= RSVP_LISTING_MS)) continue;
    for (const c of e.children) {
      if (c.status) continue;
      out.push({
        kind: 'rsvp',
        key: `rsvp:${e.event_id}:${c.player_id}`,
        label: `RSVP for ${c.first_name}`,
        detail: e.title,
        href: `/events/${e.event_id}`,
        dueAt: e.starts_at,
        dueMode: 'event',
        eventNoun: e.type === 'game' ? 'Game' : e.type === 'practice' ? 'Practice' : 'Event',
        action: { type: 'rsvp', eventId: e.event_id, playerId: c.player_id, firstName: c.first_name },
        ...fam,
      });
    }
  }
  for (const g of i.gamesWithoutResult ?? []) {
    out.push({
      kind: 'result',
      key: `result:${g.event_id}`,
      label: 'Enter result',
      detail: g.title,
      href: `/events/${g.event_id}`,
      dueAt: g.starts_at,
      dueMode: 'event',
      eventNoun: 'Game',
      ...team,
    });
  }
  for (const p of i.payments ?? []) {
    if (!p.can_pay) continue;
    out.push({
      kind: 'payment',
      key: `pay:${p.request_id}`,
      label: p.title,
      detail: formatCents(p.amount_cents),
      href: '/pay',
      dueAt: p.due_at,
      dueMode: 'due',
      overdue: Date.parse(p.due_at) < i.now.getTime(),
      action: { type: 'link', label: `Pay ${formatCents(p.amount_cents)}` },
      ...fam,
    });
  }
  for (const r of i.registrations ?? []) {
    if (r.next_step !== 'sign_waivers' && r.next_step !== 'pay') continue;
    out.push({
      kind: r.next_step === 'sign_waivers' ? 'waiver' : 'registrationStep',
      key: `reg:${r.id}`,
      label: r.next_step === 'sign_waivers' ? 'Sign waiver' : 'Finish payment',
      detail: r.player_first_name ? `${r.player_first_name} · ${r.event_title}` : r.event_title,
      href: '/registrations',
      ...fam,
    });
  }
  if ((i.waiversNeedingAction ?? 0) > 0) {
    const n = i.waiversNeedingAction!;
    out.push({
      kind: 'waiver',
      key: 'waivers:team',
      label: `${n} waiver${n === 1 ? '' : 's'} missing`,
      href: '/registrations',
      count: n,
      ...team,
    });
  }
  if ((i.pendingJoinRequests ?? 0) > 0) {
    const n = i.pendingJoinRequests!;
    out.push({
      kind: 'joinRequests',
      key: 'join:team',
      label: `${n} join request${n === 1 ? '' : 's'}`,
      detail: 'Approve or decline',
      href: '/roster',
      count: n,
      ...(n === 1 && i.singleJoinRequestId
        ? { action: { type: 'decide' as const, what: 'join' as const, id: i.singleJoinRequestId } }
        : {}),
      ...team,
    });
  }
  const lc = i.loginClaims;
  if (lc && lc.count > 0) {
    out.push({
      kind: 'loginClaims',
      key: 'claims:household',
      label: `${lc.count} player login request${lc.count === 1 ? '' : 's'}`,
      detail: 'Approve or decline',
      href: '/family',
      count: lc.count,
      ...(lc.count === 1 && lc.singleId
        ? { action: { type: 'decide' as const, what: 'login' as const, id: lc.singleId } }
        : {}),
      ...fam,
    });
  }
  if (i.linkRequests && i.linkRequests.count > 0) {
    const n = i.linkRequests.count;
    out.push({
      kind: 'linkRequests',
      key: 'link:club',
      label: `${n} club link request${n === 1 ? '' : 's'}`,
      detail: 'Approve or decline',
      href: i.linkRequests.href,
      count: n,
      ...team,
    });
  }
  if (i.payoutsNeedAction) {
    out.push({
      kind: 'payouts',
      key: 'payouts',
      label: 'Payouts need action',
      detail: 'Finish payout setup to collect payments',
      href: '/pay',
      ...team,
    });
  }
  return out;
}
