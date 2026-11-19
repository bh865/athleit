// CSV export for staff. Money is rendered from integer cents with integer math; cells that a spreadsheet
// would execute as a formula (=, +, -, @) are neutralised. No card data exists in the source rows.
export interface ExportRow {
  household_name: string;
  player_name: string;
  display_id: string;
  /** Plan context: null for a request that is paid in one charge. */
  installment_number?: number | null;
  installment_count?: number | null;
  status: string;
  due_at: string | null;
  paid_at: string | null;
  paid_via: string | null;
  receipt_display_id: string | null;
  base_cents: number;
  athleit_charge_cents: number;
  service_fee_cents: number;
  total_charged_cents: number | null;
  refunded_cents: number;
}

export const cents = (c: number | null) =>
  c === null || c === undefined ? '' : `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;

export function cell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const COLUMNS: [string, (r: ExportRow) => unknown][] = [
  ['Household', (r) => r.household_name],
  ['Player', (r) => r.player_name],
  ['Request ID', (r) => r.display_id],
  [
    'Installment',
    (r) => (r.installment_number ? `${r.installment_number} of ${r.installment_count}` : ''),
  ],
  ['Status', (r) => r.status],
  ['Due', (r) => r.due_at],
  ['Paid', (r) => r.paid_at],
  ['Paid via', (r) => r.paid_via],
  ['Receipt ID', (r) => r.receipt_display_id],
  ['Amount', (r) => cents(r.base_cents)],
  ['Athleit charge', (r) => cents(r.athleit_charge_cents)],
  ['Service fee', (r) => cents(r.service_fee_cents)],
  ['Total charged', (r) => cents(r.total_charged_cents)],
  ['Refunded', (r) => cents(r.refunded_cents)],
];

export function toCsv(rows: ExportRow[]): string {
  const lines = [COLUMNS.map(([h]) => cell(h)).join(',')];
  for (const r of rows) lines.push(COLUMNS.map(([, f]) => cell(f(r))).join(','));
  return lines.join('\r\n') + '\r\n';
}
