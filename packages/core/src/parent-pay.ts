import { DUE_SOON_DAYS } from './payments';

/**
 * Pure rules for the parent Pay screens: due states, grouping with subtotals, which requests are selected, "paid
 * this year" and month grouping for receipts. Amounts are only ever added up for display; the checkout total always
 * comes from the server quote.
 */

export interface PayRow {
  request_id: string;
  title: string;
  amount_cents: number;
  due_at: string;
  status: string;
  can_pay: boolean;
  player_first_name: string;
  issuer_name: string;
  paid_at: string | null;
  display_id?: string;
}

const DAY = 86_400_000;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** Whole calendar days from `now` to `iso` (negative when past). */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.round((dayStart(new Date(iso)) - dayStart(now)) / DAY);
}

export type DueState =
  | { kind: 'overdue'; days: number }
  | { kind: 'today' }
  | { kind: 'soon'; days: number }
  | { kind: 'later' }
  | { kind: 'processing' }
  | { kind: 'paid' }
  | { kind: 'refunded' }
  | { kind: 'closed' };

const PAID = new Set(['paid', 'paid_offline']);
const REFUNDED = new Set(['partially_refunded', 'refunded']);

/** Where one request stands. Status decides first; due date only matters while money is still owed. */
export function dueState(
  r: Pick<PayRow, 'status' | 'due_at' | 'can_pay'>,
  now: Date = new Date(),
): DueState {
  if (r.status === 'processing') return { kind: 'processing' };
  if (PAID.has(r.status)) return { kind: 'paid' };
  if (REFUNDED.has(r.status)) return { kind: 'refunded' };
  if (r.status !== 'unpaid') return { kind: 'closed' };
  const d = daysUntil(r.due_at, now);
  if (d < 0) return { kind: 'overdue', days: -d };
  if (d === 0) return { kind: 'today' };
  if (d <= DUE_SOON_DAYS) return { kind: 'soon', days: d };
  return { kind: 'later' };
}

/** Pill wording: "Overdue 5 days", "Due today", "Due in 3 days", "Due Dec 1". */
export function dueLabel(
  r: Pick<PayRow, 'status' | 'due_at' | 'can_pay'>,
  now: Date = new Date(),
): string {
  const s = dueState(r, now);
  const plural = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
  switch (s.kind) {
    case 'overdue':
      return `Overdue ${plural(s.days)}`;
    case 'today':
      return 'Due today';
    case 'soon':
      return `Due in ${plural(s.days)}`;
    case 'later':
      return `Due ${new Date(r.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    case 'processing':
      return 'Processing';
    case 'paid':
      return 'Paid';
    case 'refunded':
      return r.status === 'refunded' ? 'Refunded' : 'Partially refunded';
    default:
      return 'Closed';
  }
}

export type DueFilter = 'needs' | 'processing' | 'paid';
export const filterOf = (r: Pick<PayRow, 'status' | 'can_pay'>): DueFilter | null =>
  r.status === 'unpaid'
    ? 'needs'
    : r.status === 'processing'
      ? 'processing'
      : r.status === 'cancelled'
        ? null
        : 'paid';

export function filterCounts(rows: readonly PayRow[]): Record<DueFilter, number> {
  const c: Record<DueFilter, number> = { needs: 0, processing: 0, paid: 0 };
  for (const r of rows) {
    const f = filterOf(r);
    if (f) c[f]++;
  }
  return c;
}

/** A request can be put in a payment only when it is unpaid and the server says the caller may pay it. */
export const isSelectable = (r: Pick<PayRow, 'status' | 'can_pay'>): boolean =>
  r.status === 'unpaid' && r.can_pay;

export interface OverdueSummary {
  count: number;
  oldest: { title: string; player: string; days: number } | null;
}
export function overdueSummary(rows: readonly PayRow[], now: Date = new Date()): OverdueSummary {
  let oldest: OverdueSummary['oldest'] = null;
  let count = 0;
  for (const r of rows) {
    const s = dueState(r, now);
    if (s.kind !== 'overdue') continue;
    count++;
    if (!oldest || s.days > oldest.days)
      oldest = { title: r.title, player: r.player_first_name, days: s.days };
  }
  return { count, oldest };
}

/** Unpaid requests due today or within the next week (overdue ones count too: they are due). */
export function dueThisWeek(rows: readonly PayRow[], now: Date = new Date()): number {
  return rows.filter((r) => {
    const s = dueState(r, now);
    return s.kind === 'overdue' || s.kind === 'today' || s.kind === 'soon';
  }).length;
}

// ------------------------------------------------------------------------------------------------- grouping
export type GroupBy = 'child' | 'team';
export interface PayGroup<T extends PayRow = PayRow> {
  key: string;
  label: string;
  rows: T[];
  cents: number;
}

/** Group by child (first name) or by team (the payee). Rows keep their order; groups are sorted by label. */
export function groupRequests<T extends PayRow>(rows: readonly T[], by: GroupBy): PayGroup<T>[] {
  const m = new Map<string, PayGroup<T>>();
  for (const r of rows) {
    const label = (by === 'child' ? r.player_first_name : r.issuer_name) || 'Other';
    const g = m.get(label) ?? { key: label, label, rows: [], cents: 0 };
    g.rows.push(r);
    g.cents += r.amount_cents;
    m.set(label, g);
  }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
}

// ------------------------------------------------------------------------------------------------ selection
const sortByDue = <T extends PayRow>(rows: readonly T[]) =>
  [...rows].sort((a, b) => a.due_at.localeCompare(b.due_at));

/** The payee a set of requests is paid to. Requests with different payees cannot share one payment. */
export const payeeOf = (r: Pick<PayRow, 'issuer_name'>): string => r.issuer_name;

/**
 * What is selected before the parent touches anything: every payable request, as before. When requests go to
 * different payees (the server would refuse them together), only the payee with the oldest due date is selected.
 */
export function defaultSelection(rows: readonly PayRow[]): Set<string> {
  const payable = sortByDue(rows.filter(isSelectable));
  const first = payable[0];
  if (!first) return new Set();
  const payee = payeeOf(first);
  return new Set(payable.filter((r) => payeeOf(r) === payee).map((r) => r.request_id));
}

/** Opened from a payment link: just that request, if it can be paid; otherwise the usual default. */
export function preselect(
  rows: readonly PayRow[],
  requestId: string | null | undefined,
): Set<string> {
  const hit = requestId
    ? rows.find((r) => r.request_id === requestId && isSelectable(r))
    : undefined;
  return hit ? new Set([hit.request_id]) : defaultSelection(rows);
}

/** Tick or untick one request. Picking a request for a different payee starts a new selection with it. */
export function toggleRequest(
  selected: ReadonlySet<string>,
  rows: readonly PayRow[],
  id: string,
): Set<string> {
  const row = rows.find((r) => r.request_id === id);
  if (!row || !isSelectable(row)) return new Set(selected);
  if (selected.has(id)) {
    const next = new Set(selected);
    next.delete(id);
    return next;
  }
  const others = rows.filter((r) => selected.has(r.request_id));
  if (others.some((r) => payeeOf(r) !== payeeOf(row))) return new Set([id]);
  return new Set([...selected, id]);
}

/** Select every payable request in a group (only those for one payee: the group's first payee). */
export function selectGroup(selected: ReadonlySet<string>, group: readonly PayRow[]): Set<string> {
  const payable = sortByDue(group.filter(isSelectable));
  const first = payable[0];
  if (!first) return new Set(selected);
  const payee = payeeOf(first);
  const ids = payable.filter((r) => payeeOf(r) === payee).map((r) => r.request_id);
  // Keep what is already selected only when it is for the same payee.
  return new Set(ids);
}
export function clearGroup(selected: ReadonlySet<string>, group: readonly PayRow[]): Set<string> {
  const gone = new Set(group.map((r) => r.request_id));
  return new Set([...selected].filter((id) => !gone.has(id)));
}
/** True when every payable request in the group is selected (the button then offers "Clear"). */
export const groupFullySelected = (
  selected: ReadonlySet<string>,
  group: readonly PayRow[],
): boolean => {
  const payable = group.filter(isSelectable);
  return payable.length > 0 && payable.every((r) => selected.has(r.request_id));
};

/** More than one payee among the payable requests, and the one that is paid after the selected group. */
export function separateInfo(rows: readonly PayRow[], selected: ReadonlySet<string>) {
  const payable = rows.filter(isSelectable);
  const chosen = payable.filter((r) => selected.has(r.request_id));
  const payee = chosen[0] ? payeeOf(chosen[0]) : null;
  const rest = payable.filter((r) => payeeOf(r) !== payee);
  const mixed = new Set(payable.map(payeeOf)).size > 1;
  const nextPayee = rest[0] ? payeeOf(sortByDue(rest)[0]!) : null;
  const next = nextPayee
    ? {
        payee: nextPayee,
        titles: rest.filter((r) => payeeOf(r) === nextPayee).map((r) => r.title),
        cents: rest.filter((r) => payeeOf(r) === nextPayee).reduce((n, r) => n + r.amount_cents, 0),
      }
    : null;
  return { mixed, next, chosenCount: chosen.length, payableCount: payable.length };
}

// ------------------------------------------------------------------------------------------------- receipts
export interface ReceiptItemLite {
  display_id: string;
  title: string;
  player_first_name: string;
  amount_cents: number;
}
export interface ReceiptLite {
  payment_id: string;
  receipt_display_id: string;
  total_charged_cents: number;
  refunded_cents: number;
  succeeded_at: string | null;
  items: unknown;
}
export const receiptItems = (r: Pick<ReceiptLite, 'items'>): ReceiptItemLite[] =>
  Array.isArray(r.items) ? (r.items as ReceiptItemLite[]) : [];

export type RefundState = 'none' | 'partial' | 'full';
export const refundState = (
  r: Pick<ReceiptLite, 'refunded_cents' | 'total_charged_cents'>,
): RefundState =>
  r.refunded_cents <= 0 ? 'none' : r.refunded_cents >= r.total_charged_cents ? 'full' : 'partial';

/** "Fall 2026 Registration, Maya +4 more". */
export function receiptSummary(r: Pick<ReceiptLite, 'items'>): string {
  const items = receiptItems(r);
  const first = items[0];
  if (!first) return 'Payment';
  const base = first.player_first_name ? `${first.title}, ${first.player_first_name}` : first.title;
  return items.length > 1 ? `${base} +${items.length - 1} more` : base;
}

export const receiptYear = (r: Pick<ReceiptLite, 'succeeded_at'>): number | null =>
  r.succeeded_at ? new Date(r.succeeded_at).getFullYear() : null;

/** Years that have receipts, newest first. The current year is always offered. */
export function receiptYears(rows: readonly ReceiptLite[], now: Date = new Date()): number[] {
  const ys = new Set<number>([now.getFullYear()]);
  for (const r of rows) {
    const y = receiptYear(r);
    if (y !== null) ys.add(y);
  }
  return [...ys].sort((a, b) => b - a);
}

/**
 * "Paid this year": what was charged in that calendar year, minus what was refunded, so it matches what actually
 * left the account. `refunded` is the refunded total shown beside it.
 */
export function paidThisYear(rows: readonly ReceiptLite[], year: number) {
  const mine = rows.filter((r) => receiptYear(r) === year);
  const charged = mine.reduce((n, r) => n + r.total_charged_cents, 0);
  const refunded = mine.reduce((n, r) => n + Math.max(0, r.refunded_cents), 0);
  return { cents: charged - refunded, charged, refunded, count: mine.length };
}

/** Match a receipt by its ID, an item title, or a child's name. */
export function receiptMatches(r: ReceiptLite, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return (
    r.receipt_display_id.toLowerCase().includes(n) ||
    receiptItems(r).some(
      (i) => i.title.toLowerCase().includes(n) || i.player_first_name.toLowerCase().includes(n),
    )
  );
}

export interface MonthGroup<T extends ReceiptLite = ReceiptLite> {
  key: string;
  label: string;
  rows: T[];
}
/** Receipts of one year (filtered by search) grouped by month, newest month and newest receipt first. */
export function groupReceiptsByMonth<T extends ReceiptLite>(
  rows: readonly T[],
  year: number,
  search = '',
): MonthGroup<T>[] {
  const by = new Map<string, MonthGroup<T>>();
  const sorted = rows
    .filter((r) => receiptYear(r) === year && receiptMatches(r, search))
    .sort((a, b) => (b.succeeded_at ?? '').localeCompare(a.succeeded_at ?? ''));
  for (const r of sorted) {
    const d = new Date(r.succeeded_at as string);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const g = by.get(key) ?? {
      key,
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      rows: [],
    };
    g.rows.push(r);
    by.set(key, g);
  }
  return [...by.values()];
}

/** What is left after a refund, for the receipt header: "Net $496.12 after refund". */
export const netAfterRefund = (
  r: Pick<ReceiptLite, 'total_charged_cents' | 'refunded_cents'>,
): number => r.total_charged_cents - Math.max(0, r.refunded_cents);
