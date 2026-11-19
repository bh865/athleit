import { describe, expect, it } from 'vitest';

import {
  clearGroup,
  defaultSelection,
  dueLabel,
  dueState,
  dueThisWeek,
  filterCounts,
  groupFullySelected,
  groupReceiptsByMonth,
  groupRequests,
  netAfterRefund,
  overdueSummary,
  paidThisYear,
  preselect,
  receiptMatches,
  receiptSummary,
  receiptYears,
  refundState,
  selectGroup,
  separateInfo,
  toggleRequest,
  type PayRow,
  type ReceiptLite,
} from './parent-pay';

const NOW = new Date(2026, 10, 18, 10, 0, 0); // Nov 18, 2026 10:00 local
const at = (days: number) => new Date(2026, 10, 18 + days, 9, 0, 0).toISOString();

const row = (
  id: string,
  child: string,
  days: number,
  cents: number,
  extra: Partial<PayRow> = {},
): PayRow => ({
  request_id: id,
  title: `Req ${id}`,
  amount_cents: cents,
  due_at: at(days),
  status: 'unpaid',
  can_pay: true,
  player_first_name: child,
  issuer_name: 'Athleit FC',
  paid_at: null,
  ...extra,
});

describe('due state', () => {
  it('derives overdue, today, soon and later from the due date', () => {
    expect(dueState(row('a', 'M', -5, 1), NOW)).toEqual({ kind: 'overdue', days: 5 });
    expect(dueState(row('a', 'M', 0, 1), NOW)).toEqual({ kind: 'today' });
    expect(dueState(row('a', 'M', 3, 1), NOW)).toEqual({ kind: 'soon', days: 3 });
    expect(dueState(row('a', 'M', 7, 1), NOW)).toEqual({ kind: 'soon', days: 7 });
    expect(dueState(row('a', 'M', 8, 1), NOW)).toEqual({ kind: 'later' });
  });
  it('lets status win over the due date', () => {
    expect(dueState(row('a', 'M', -9, 1, { status: 'processing' }), NOW).kind).toBe('processing');
    expect(dueState(row('a', 'M', -9, 1, { status: 'paid' }), NOW).kind).toBe('paid');
    expect(dueState(row('a', 'M', -9, 1, { status: 'paid_offline' }), NOW).kind).toBe('paid');
    expect(dueState(row('a', 'M', -9, 1, { status: 'partially_refunded' }), NOW).kind).toBe(
      'refunded',
    );
    expect(dueState(row('a', 'M', -9, 1, { status: 'waived' }), NOW).kind).toBe('closed');
  });
  it('words the pill', () => {
    expect(dueLabel(row('a', 'M', -5, 1), NOW)).toBe('Overdue 5 days');
    expect(dueLabel(row('a', 'M', -1, 1), NOW)).toBe('Overdue 1 day');
    expect(dueLabel(row('a', 'M', 0, 1), NOW)).toBe('Due today');
    expect(dueLabel(row('a', 'M', 3, 1), NOW)).toBe('Due in 3 days');
    expect(dueLabel(row('a', 'M', 13, 1), NOW)).toBe('Due Dec 1');
    expect(dueLabel(row('a', 'M', 1, 1, { status: 'refunded' }), NOW)).toBe('Refunded');
  });
  it('summarizes what is overdue and what is due this week', () => {
    const rows = [
      row('a', 'Maya', -5, 1),
      row('b', 'Eli', -2, 1),
      row('c', 'Maya', 3, 1),
      row('d', 'Eli', 30, 1),
      row('e', 'Eli', 1, 1, { status: 'paid' }),
    ];
    expect(overdueSummary(rows, NOW)).toEqual({
      count: 2,
      oldest: { title: 'Req a', player: 'Maya', days: 5 },
    });
    expect(dueThisWeek(rows, NOW)).toBe(3);
    expect(overdueSummary([], NOW)).toEqual({ count: 0, oldest: null });
  });
  it('counts the filters', () => {
    const rows = [
      row('a', 'M', 1, 1),
      row('b', 'M', 1, 1, { status: 'processing', can_pay: false }),
      row('c', 'M', 1, 1, { status: 'paid', can_pay: false }),
      row('d', 'M', 1, 1, { status: 'cancelled', can_pay: false }),
    ];
    expect(filterCounts(rows)).toEqual({ needs: 1, processing: 1, paid: 1 });
  });
});

describe('grouping', () => {
  const rows = [
    row('a', 'Maya', 1, 18500),
    row('b', 'Maya', 1, 4500),
    row('c', 'Eli', 1, 18500, { issuer_name: 'Riverside' }),
  ];
  it('groups by child with subtotals', () => {
    const g = groupRequests(rows, 'child');
    expect(g.map((x) => [x.label, x.rows.length, x.cents])).toEqual([
      ['Eli', 1, 18500],
      ['Maya', 2, 23000],
    ]);
  });
  it('groups by team (the payee)', () => {
    const g = groupRequests(rows, 'team');
    expect(g.map((x) => [x.label, x.cents])).toEqual([
      ['Athleit FC', 23000],
      ['Riverside', 18500],
    ]);
  });
});

describe('selection rules', () => {
  const rows = [
    row('a', 'Maya', -5, 18500),
    row('b', 'Maya', 3, 4500),
    row('c', 'Eli', 3, 18500),
    row('p', 'Maya', 1, 100, { status: 'processing', can_pay: false }),
  ];
  it('selects every payable request by default, never paid or processing ones', () => {
    expect([...defaultSelection(rows)].sort()).toEqual(['a', 'b', 'c']);
  });
  it('preselects only the linked request, falling back to the default when it cannot be paid', () => {
    expect([...preselect(rows, 'b')]).toEqual(['b']);
    expect([...preselect(rows, 'p')].sort()).toEqual(['a', 'b', 'c']);
    expect([...preselect(rows, 'nope')].sort()).toEqual(['a', 'b', 'c']);
    expect([...preselect(rows, null)].sort()).toEqual(['a', 'b', 'c']);
  });
  it('toggles one request and ignores ones that cannot be paid', () => {
    let s = defaultSelection(rows);
    s = toggleRequest(s, rows, 'b');
    expect([...s].sort()).toEqual(['a', 'c']);
    s = toggleRequest(s, rows, 'b');
    expect([...s].sort()).toEqual(['a', 'b', 'c']);
    expect([...toggleRequest(s, rows, 'p')].sort()).toEqual(['a', 'b', 'c']);
  });
  it('selects and clears a group', () => {
    const maya = rows.filter((r) => r.player_first_name === 'Maya');
    expect(groupFullySelected(new Set(['a', 'b']), maya)).toBe(true);
    expect(groupFullySelected(new Set(['a']), maya)).toBe(false);
    expect([...selectGroup(new Set(), maya)].sort()).toEqual(['a', 'b']);
    expect([...clearGroup(new Set(['a', 'b', 'c']), maya)]).toEqual(['c']);
  });
});

describe('different payees', () => {
  const rows = [
    row('a', 'Maya', -5, 18500),
    row('b', 'Maya', 3, 4500),
    row('t', 'Maya', 13, 6000, { issuer_name: 'Riverside Youth Soccer Club' }),
    row('c', 'Eli', 3, 18500),
  ];
  it('selects only the payee with the oldest due date by default', () => {
    expect([...defaultSelection(rows)].sort()).toEqual(['a', 'b', 'c']);
  });
  it('explains what is paid next', () => {
    const info = separateInfo(rows, defaultSelection(rows));
    expect(info.mixed).toBe(true);
    expect(info.next).toEqual({
      payee: 'Riverside Youth Soccer Club',
      titles: ['Req t'],
      cents: 6000,
    });
    expect(info.chosenCount).toBe(3);
  });
  it('ticking a request for another payee starts a new selection', () => {
    expect([...toggleRequest(defaultSelection(rows), rows, 't')]).toEqual(['t']);
  });
  it('a single payee is never "mixed"', () => {
    const one = rows.filter((r) => r.issuer_name === 'Athleit FC');
    expect(separateInfo(one, defaultSelection(one))).toMatchObject({ mixed: false, next: null });
  });
});

describe('receipts', () => {
  const rec = (
    id: string,
    iso: string,
    cents: number,
    refunded: number,
    items: { title: string; child: string }[] = [{ title: 'Jersey', child: 'Maya' }],
  ): ReceiptLite => ({
    payment_id: id,
    receipt_display_id: `ATH-${id}`,
    total_charged_cents: cents,
    refunded_cents: refunded,
    succeeded_at: iso,
    items: items.map((i, n) => ({
      display_id: `${id}-${n}`,
      title: i.title,
      player_first_name: i.child,
      amount_cents: 100,
    })),
  });
  const rows = [
    rec('0142', '2026-11-09T12:00:00', 54112, 7200, [
      { title: 'Fall 2026 Registration', child: 'Maya' },
      { title: 'Team Jersey', child: 'Maya' },
      { title: 'Fee', child: 'Eli' },
    ]),
    rec('0139', '2026-11-02T12:00:00', 5220, 0),
    rec('0120', '2026-10-18T12:00:00', 2630, 0, [{ title: 'Photo Package', child: 'Eli' }]),
    rec('0099', '2025-12-30T12:00:00', 9999, 0),
  ];
  it('computes paid this year as charged minus refunded, for that year only', () => {
    expect(paidThisYear(rows, 2026)).toEqual({
      cents: 54112 + 5220 + 2630 - 7200,
      charged: 54112 + 5220 + 2630,
      refunded: 7200,
      count: 3,
    });
    expect(paidThisYear(rows, 2025).cents).toBe(9999);
    expect(paidThisYear([], 2026)).toEqual({ cents: 0, charged: 0, refunded: 0, count: 0 });
  });
  it('lists years, newest first, always including this year', () => {
    expect(receiptYears(rows, new Date(2026, 5, 1))).toEqual([2026, 2025]);
    expect(receiptYears([], new Date(2026, 5, 1))).toEqual([2026]);
  });
  it('groups a year by month, newest first', () => {
    const g = groupReceiptsByMonth(rows, 2026);
    expect(g.map((x) => [x.label, x.rows.map((r) => r.payment_id)])).toEqual([
      ['November 2026', ['0142', '0139']],
      ['October 2026', ['0120']],
    ]);
  });
  it('searches by id, title and child within the year', () => {
    expect(
      groupReceiptsByMonth(rows, 2026, 'eli')
        .flatMap((g) => g.rows)
        .map((r) => r.payment_id)
        .sort(),
    ).toEqual(['0120', '0142']);
    expect(groupReceiptsByMonth(rows, 2026, 'ATH-0139').flatMap((g) => g.rows)).toHaveLength(1);
    expect(receiptMatches(rows[0]!, 'jersey')).toBe(true);
    expect(groupReceiptsByMonth(rows, 2026, 'zzz')).toEqual([]);
  });
  it('shows the refund state and what was left after it', () => {
    expect(refundState(rows[0]!)).toBe('partial');
    expect(refundState(rows[1]!)).toBe('none');
    expect(refundState({ refunded_cents: 100, total_charged_cents: 100 })).toBe('full');
    expect(netAfterRefund(rows[0]!)).toBe(54112 - 7200);
  });
  it('summarizes the first item and how many more', () => {
    expect(receiptSummary(rows[0]!)).toBe('Fall 2026 Registration, Maya +2 more');
    expect(receiptSummary(rows[1]!)).toBe('Jersey, Maya');
    expect(receiptSummary({ items: null })).toBe('Payment');
  });
});
