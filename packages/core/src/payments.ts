/** Shared payment constants, statuses and presentation helpers (web + mobile). */
export const PAYMENT_AUDIENCES = ['all_active_roster', 'selected_players'] as const;
export type PaymentAudience = (typeof PAYMENT_AUDIENCES)[number];

export const PAYMENT_REQUEST_STATUSES = [
  'unpaid',
  'processing',
  'paid',
  'paid_offline',
  'partially_refunded',
  'refunded',
  'waived',
  'cancelled',
] as const;
export type PaymentRequestStatus = (typeof PAYMENT_REQUEST_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'requires_payment_method',
  'processing',
  'succeeded',
  'failed',
  'canceled',
  'partially_refunded',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_EVENT_STATUSES = ['draft', 'published', 'closed', 'cancelled'] as const;
export type PaymentEventStatus = (typeof PAYMENT_EVENT_STATUSES)[number];

export const ONBOARDING_STATUSES = [
  'not_started',
  'in_review',
  'needs_info',
  'ready',
  'disconnected',
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const OFFLINE_METHODS = ['cash', 'check', 'other'] as const;
export type OfflineMethod = (typeof OFFLINE_METHODS)[number];

export const MAX_PAYMENT_TITLE_LENGTH = 100;
export const MAX_PAYMENT_DESCRIPTION_LENGTH = 1000;
export const MAX_CHECKOUT_REQUESTS = 25;
export const MAX_PAYMENT_NOTE_LENGTH = 300;
/** A staff reminder can go to a given request at most once per this many hours. */
export const REMINDER_COOLDOWN_HOURS = 24;

/** Statuses that mean "money is settled for this request" (no further action by the payer). */
export const SETTLED_PAYMENT_REQUEST_STATUSES: readonly PaymentRequestStatus[] = [
  'paid',
  'paid_offline',
  'partially_refunded',
  'refunded',
  'waived',
];

export function paymentRequestStatusLabel(s: PaymentRequestStatus): string {
  switch (s) {
    case 'unpaid':
      return 'Unpaid';
    case 'processing':
      return 'Processing';
    case 'paid':
      return 'Paid';
    case 'paid_offline':
      return 'Paid offline';
    case 'partially_refunded':
      return 'Partly refunded';
    case 'refunded':
      return 'Refunded';
    case 'waived':
      return 'Waived';
    case 'cancelled':
      return 'Cancelled';
  }
}

export type CollectionState = 'open' | 'due_soon' | 'overdue' | 'closed';

/** Days ahead that count as "due soon" on the staff Pay list. */
export const DUE_SOON_DAYS = 7;

/**
 * Where a payment request stands for staff: closed (not published any more, or nothing left to collect),
 * overdue (past due with money outstanding), due soon (within a week), else open.
 */
export function collectionState(
  a: { status: string; dueAt: string; outstandingCents: number; totalRequests: number },
  now: Date = new Date(),
): { state: CollectionState; daysLeft: number } {
  const due = new Date(a.dueAt);
  const daysLeft = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  if (a.status !== 'published' || (a.totalRequests > 0 && a.outstandingCents <= 0))
    return { state: 'closed', daysLeft };
  if (due.getTime() < now.getTime()) return { state: 'overdue', daysLeft };
  if (daysLeft <= DUE_SOON_DAYS) return { state: 'due_soon', daysLeft };
  return { state: 'open', daysLeft };
}

export function collectionStateLabel(state: CollectionState, daysLeft: number): string {
  if (state === 'closed') return 'Closed';
  if (state === 'overdue') return 'Overdue';
  if (state === 'due_soon')
    return daysLeft <= 0 ? 'Due today' : `Due in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`;
  return 'Open';
}

export const audienceLabel = (audience: string) =>
  audience === 'selected_players' ? 'Selected players' : 'Active roster';
