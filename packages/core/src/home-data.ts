import { withinRsvpWindow, type AttentionItem } from './home-attention';

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
  gamesWithoutResult?: readonly { event_id: string; title: string; starts_at: string }[];
}

export function buildAttentionItems(i: AttentionInput): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const e of i.nextUp ?? []) {
    if (!withinRsvpWindow(e.starts_at, i.now)) continue;
    for (const c of e.children) {
      if (c.status) continue;
      out.push({
        kind: 'rsvp',
        key: `rsvp:${e.event_id}:${c.player_id}`,
        label: `RSVP for ${c.first_name}`,
        detail: e.title,
        href: `/events/${e.event_id}`,
        dueAt: e.starts_at,
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
    });
  }
  for (const p of i.payments ?? []) {
    if (!p.can_pay) continue;
    out.push({
      kind: 'payment',
      key: `pay:${p.request_id}`,
      label: p.title,
      detail: 'Payment due',
      href: '/pay',
      dueAt: p.due_at,
      overdue: Date.parse(p.due_at) < i.now.getTime(),
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
    });
  }
  return out;
}
