// CSV for registration exports. Rows come from export_registrations (RLS-equivalent checks, audited, sensitive data only
// with the capability). Every cell is neutralized against spreadsheet formula injection.
import { csvSafeCell } from './core/registration.ts';

interface ExportField {
  id: string;
  label: string;
  type: string;
  sensitive?: boolean;
}
interface ExportPayload {
  fields: ExportField[];
  rows: Array<Record<string, any>>;
  include_sensitive: boolean;
}

const BASE: Array<[string, string]> = [
  ['display_id', 'Registration'],
  ['status', 'Status'],
  ['submitted_at', 'Submitted'],
  ['guardian_name', 'Guardian name'],
  ['guardian_email', 'Guardian email'],
  ['guardian_phone', 'Guardian phone'],
  ['guardian_relationship', 'Relationship'],
  ['player_first_name', 'Player first name'],
  ['player_last_name', 'Player last name'],
  ['player_date_of_birth', 'Date of birth'],
];

const cellValue = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.join('; ')
    : v !== null && typeof v === 'object'
      ? Object.values(v as object).join(', ')
      : v;

export function registrationsToCsv(p: ExportPayload): string {
  const header = [...BASE.map(([, l]) => l), ...p.fields.map((f) => f.label)];
  const lines = [header.map(csvSafeCell).join(',')];
  for (const r of p.rows) {
    const cells = BASE.map(([k]) => r[k]);
    for (const f of p.fields)
      cells.push(cellValue((f.sensitive ? r.sensitive_answers : r.answers)?.[f.id]));
    lines.push(cells.map(csvSafeCell).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
