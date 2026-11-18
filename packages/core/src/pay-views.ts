import { capabilitiesForPlace, type Capability } from './capabilities';
import type { AppContext } from './context';

/** Which Pay views a person gets. Decided from capabilities, never from the context kind. */
export interface PayViews {
  /** "My payments": requests, pay, receipts (any guardian of a household). */
  payer: boolean;
  /** "Team collection": payouts, new request, who paid (payments.view / payments.manage). */
  staff: {
    kind: 'team' | 'club';
    id: string;
    title: string;
    canSend: boolean;
    isAdmin: boolean;
  } | null;
  /** Segment to show first. */
  initial: 'payer' | 'staff';
}

const hasStaffPayments = (caps: ReadonlySet<Capability>) =>
  caps.has('payments.view') || caps.has('payments.manage');

/**
 * - guardians (payments.pay through a household) get the payer view;
 * - staff of the active team/club (or, when the active place is the family, the first team/club
 *   they hold payment rights in) get the collection view;
 * - someone who is both gets both, starting on the one matching the active place.
 */
export function payViewsFor(
  contexts: readonly Pick<AppContext, 'kind' | 'role' | 'id' | 'title'>[],
  active: Pick<AppContext, 'kind' | 'id'> | null,
): PayViews {
  const payer = contexts.some((c) => c.kind === 'family');
  const places = contexts.filter((c) => c.kind === 'team' || c.kind === 'club');
  const seen = new Set<string>();
  const candidates = [
    ...places.filter((c) => active && c.kind === active.kind && c.id === active.id),
    ...places,
  ].filter((c) => {
    const k = `${c.kind}:${c.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const pick = candidates.find((c) =>
    hasStaffPayments(capabilitiesForPlace(contexts, c.kind, c.id)),
  );
  const staff = pick
    ? (() => {
        const caps = capabilitiesForPlace(contexts, pick.kind, pick.id);
        return {
          kind: pick.kind as 'team' | 'club',
          id: pick.id,
          title: pick.title,
          canSend: caps.has('payments.manage'),
          isAdmin: caps.has('payments.refund'),
        };
      })()
    : null;
  const activeIsStaffPlace = Boolean(
    staff && active && active.kind === staff.kind && active.id === staff.id,
  );
  return { payer, staff, initial: staff && (!payer || activeIsStaffPlace) ? 'staff' : 'payer' };
}
