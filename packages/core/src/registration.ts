import type { FormField, FormSchema, ShowIf } from './schemas/registration';
import { MAX_ANSWERS_BYTES } from './schemas/registration';

/**
 * Answer validation against a published form version. Used by the public form (live errors) and by the
 * submit-registration Edge Function (authoritative on the server, before the database checks key membership).
 */

export type AnswerValue = string | number | boolean | string[] | Record<string, string> | null;
export type AnswerErrors = Record<string, string>;

export type AnswerResult =
  | { ok: true; answers: Record<string, unknown>; sensitive: Record<string, unknown> }
  | { ok: false; errors: AnswerErrors };

function matches(cond: ShowIf, answers: Record<string, unknown>): boolean {
  const v = answers[cond.field];
  if ('equals' in cond)
    return v === cond.equals || (Array.isArray(v) && v.includes(cond.equals as string));
  return Array.isArray(v)
    ? v.some((x) => cond.in.includes(String(x)))
    : cond.in.includes(String(v));
}

/** Fields shown for the current answers: a field is visible when it has no condition, or its condition holds
 * AND the field it depends on is itself visible. */
export function visibleFields(schema: FormSchema, answers: Record<string, unknown>): FormField[] {
  const shown = new Set<string>();
  const out: FormField[] = [];
  for (const f of schema.fields) {
    if (!f.show_if || (shown.has(f.show_if.field) && matches(f.show_if, answers))) {
      shown.add(f.id);
      out.push(f);
    }
  }
  return out;
}

const PHONE = /^[+()\-.\s\d]{7,25}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ADDRESS_KEYS = ['line1', 'line2', 'city', 'region', 'postal_code', 'country'] as const;

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function checkOne(f: FormField, v: unknown): string | null {
  const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  if (f.type === 'checkbox' || f.type === 'consent_checkbox') {
    if (v !== undefined && typeof v !== 'boolean') return 'Invalid answer';
    if (f.required && f.type === 'consent_checkbox' && v !== true) return 'This must be accepted';
    if (f.required && f.type === 'checkbox' && v !== true) return 'This is required';
    return null;
  }
  if (empty) return f.required ? 'This is required' : null;
  const val = f.validation ?? {};
  switch (f.type) {
    case 'short_text':
    case 'long_text': {
      if (typeof v !== 'string') return 'Invalid answer';
      const max = val.max_length ?? (f.type === 'short_text' ? 200 : 4000);
      if (v.length > max) return `Keep this under ${max} characters`;
      if (val.min_length && v.trim().length < val.min_length)
        return `Enter at least ${val.min_length} characters`;
      return null;
    }
    case 'email':
      return typeof v === 'string' && v.length <= 254 && EMAIL.test(v)
        ? null
        : 'Enter a valid email';
    case 'phone':
      return typeof v === 'string' && PHONE.test(v) ? null : 'Enter a valid phone number';
    case 'number': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'Enter a number';
      if (val.min !== undefined && v < val.min) return `Must be at least ${val.min}`;
      if (val.max !== undefined && v > val.max) return `Must be at most ${val.max}`;
      return null;
    }
    case 'date':
      return typeof v === 'string' && isValidDate(v) ? null : 'Enter a valid date';
    case 'single_choice':
    case 'dropdown':
      return typeof v === 'string' && f.options?.some((o) => o.value === v)
        ? null
        : 'Choose one of the options';
    case 'multiple_choice': {
      if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return 'Invalid answer';
      const allowed = new Set(f.options?.map((o) => o.value));
      if (new Set(v).size !== v.length || !v.every((x) => allowed.has(x)))
        return 'Choose from the options';
      return null;
    }
    case 'address': {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return 'Invalid address';
      const a = v as Record<string, unknown>;
      if (Object.keys(a).some((k) => !(ADDRESS_KEYS as readonly string[]).includes(k)))
        return 'Invalid address';
      if (Object.values(a).some((x) => typeof x !== 'string' || x.length > 120))
        return 'Invalid address';
      if (!a.line1 || !a.city || !a.postal_code) return 'Enter street, city and postal code';
      return null;
    }
    default:
      return 'Unsupported field';
  }
}

/**
 * Validate raw answers against a form version. Rejects: unknown keys, answers for hidden fields
 * (hidden-field smuggling), wrong types, options that are not in the list, missing required visible fields,
 * and oversized payloads. Splits the result into ordinary and sensitive answers by the field's flag.
 */
export function validateAnswers(schema: FormSchema, raw: Record<string, unknown>): AnswerResult {
  const errors: AnswerErrors = {};
  if (JSON.stringify(raw).length > MAX_ANSWERS_BYTES)
    return { ok: false, errors: { _form: 'Answers are too large' } };
  const byId = new Map(schema.fields.map((f) => [f.id, f]));
  for (const key of Object.keys(raw)) if (!byId.has(key)) errors[key] = 'Unknown field';

  const visible = visibleFields(schema, raw);
  const visibleIds = new Set(visible.map((f) => f.id));
  for (const key of Object.keys(raw)) {
    if (byId.has(key) && !visibleIds.has(key)) errors[key] = 'This field is not part of the form';
  }
  const answers: Record<string, unknown> = {};
  const sensitive: Record<string, unknown> = {};
  for (const f of visible) {
    const err = checkOne(f, raw[f.id]);
    if (err) errors[f.id] = err;
    else if (raw[f.id] !== undefined && raw[f.id] !== null && raw[f.id] !== '') {
      (f.sensitive ? sensitive : answers)[f.id] = raw[f.id];
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers, sensitive };
}

/** Neutralize spreadsheet formula injection: a cell that starts with = + - @ (or tab/CR) gets a leading apostrophe. */
export function csvSafeCell(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Display rank labels for the spots_left availability string returned by get_public_registration. */
export const SPOTS_LABELS = {
  open: 'Spots available',
  few: 'Only a few spots left',
  waitlist: 'Full: join the waitlist',
  full: 'Full',
} as const;

// ------------------------------------------------------------------------------------------------ shared UI copy
export const REGISTRATION_STATUS_LABELS: Record<string, string> = {
  pending_verification: 'Confirm your email',
  submitted: 'Submitted',
  waitlisted: 'Waitlisted',
  accepted: 'Accepted',
  placed: 'Placed on a team',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};

export type RegistrationTone = 'neutral' | 'success' | 'warning' | 'danger';
export function registrationStatusTone(status: string): RegistrationTone {
  if (status === 'accepted' || status === 'placed') return 'success';
  if (status === 'waitlisted' || status === 'pending_verification') return 'warning';
  if (status === 'declined' || status === 'withdrawn') return 'danger';
  return 'neutral';
}

const EDGE_ERRORS: Record<string, string> = {
  invalid_input: 'Check the highlighted fields and try again.',
  invalid_answers: 'Some answers need attention.',
  captcha_failed: 'We could not confirm you are a person. Try again.',
  rate_limited: 'Too many tries. Wait a few minutes and try again.',
  not_found: 'We could not find that registration.',
  not_open_yet: 'Registration has not opened yet.',
  registration_closed: 'Registration is closed.',
  registration_full: 'This registration just filled up.',
  form_changed: 'The form was updated. Reload the page and try again.',
  account_required: 'Sign in to register for this event.',
  not_authenticated: 'Sign in to continue.',
  already_registered: 'This child is already registered for this event.',
  invalid_token: 'That link has expired or was already used.',
  already_signed: 'You already signed this waiver.',
  network: 'You seem to be offline. Check your connection and try again.',
  internal_error: 'Something went wrong on our side. Try again in a moment.',
};
export function registrationErrorMessage(code: unknown): string {
  return (typeof code === 'string' && EDGE_ERRORS[code]) || 'Something went wrong. Try again.';
}

/** Whole-dollar price label for a registration event ("Free" when there is no price). */
export function registrationPriceLabel(cents: number | null | undefined): string {
  if (!cents) return 'Free';
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/** Slug suggestion for a new event title (the database enforces uniqueness). */
export function suggestSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base.length >= 6
    ? base
    : `${base || 'event'}-${Math.random().toString(36).slice(2, 6)}`.slice(0, 80);
}

/** CSV for export_registrations: fixed columns, then one column per form field. Every cell is formula-safe. */
export function buildRegistrationCsv(
  fields: { id: string; label: string }[],
  rows: Record<string, unknown>[],
  includeSensitive: boolean,
): string {
  const base = [
    ['display_id', 'Reference'],
    ['status', 'Status'],
    ['submitted_at', 'Submitted'],
    ['player_first_name', 'Child first name'],
    ['player_last_name', 'Child last name'],
    ['player_date_of_birth', 'Date of birth'],
    ['guardian_name', 'Guardian'],
    ['guardian_email', 'Guardian email'],
    ['guardian_phone', 'Guardian phone'],
    ['guardian_relationship', 'Relationship'],
  ] as const;
  const head = [...base.map(([, l]) => l), ...fields.map((f) => f.label)];
  const lines = [head.map(csvSafeCell).join(',')];
  for (const r of rows) {
    const ordinary = (r.answers ?? {}) as Record<string, unknown>;
    const sensitive = (includeSensitive ? (r.sensitive_answers ?? {}) : {}) as Record<
      string,
      unknown
    >;
    const cells = [
      ...base.map(([k]) => r[k]),
      ...fields.map((f) => {
        const v = f.id in ordinary ? ordinary[f.id] : sensitive[f.id];
        return Array.isArray(v) ? v.join('; ') : v;
      }),
    ];
    lines.push(cells.map(csvSafeCell).join(','));
  }
  return lines.join('\r\n');
}

// ----------------------------------------------------------------------------------------- authoring templates
export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  fields: FormField[];
}
/**
 * Starter forms. They ask only what a youth program needs: no government IDs, no card data. Medical questions are
 * flagged sensitive, so they are stored apart and hidden from lists, exports and notifications.
 */
export const FORM_TEMPLATES: FormTemplate[] = [
  {
    id: 'season',
    name: 'Season registration',
    description: 'Shirt size, emergency contact and medical notes.',
    fields: [
      {
        id: 'shirt_size',
        type: 'dropdown',
        label: 'Shirt size',
        required: true,
        options: [
          { value: 'YS', label: 'Youth S' },
          { value: 'YM', label: 'Youth M' },
          { value: 'YL', label: 'Youth L' },
          { value: 'AS', label: 'Adult S' },
          { value: 'AM', label: 'Adult M' },
          { value: 'AL', label: 'Adult L' },
        ],
      },
      { id: 'emergency_name', type: 'short_text', label: 'Emergency contact name', required: true },
      { id: 'emergency_phone', type: 'phone', label: 'Emergency contact phone', required: true },
      {
        id: 'allergies',
        type: 'long_text',
        label: 'Allergies or conditions we should know about',
        sensitive: true,
      },
      {
        id: 'photo_ok',
        type: 'consent_checkbox',
        label: 'Photos of my child may be shared with the team',
      },
    ],
  },
  {
    id: 'tryout',
    name: 'Tryout',
    description: 'Position preference and previous experience.',
    fields: [
      {
        id: 'position',
        type: 'multiple_choice',
        label: 'Positions your child plays',
        required: true,
        options: [
          { value: 'goalie', label: 'Goalie' },
          { value: 'defense', label: 'Defense' },
          { value: 'midfield', label: 'Midfield' },
          { value: 'forward', label: 'Forward' },
        ],
      },
      { id: 'experience', type: 'long_text', label: 'Playing experience' },
      { id: 'previous_team', type: 'short_text', label: 'Previous team (optional)' },
      {
        id: 'medical',
        type: 'long_text',
        label: 'Anything medical we should know about?',
        sensitive: true,
      },
    ],
  },
  {
    id: 'camp',
    name: 'Camp or clinic',
    description: 'Sessions, pickup and medical notes.',
    fields: [
      {
        id: 'sessions',
        type: 'multiple_choice',
        label: 'Sessions',
        required: true,
        options: [
          { value: 'am', label: 'Morning' },
          { value: 'pm', label: 'Afternoon' },
        ],
      },
      {
        id: 'pickup_person',
        type: 'short_text',
        label: 'Who will pick up your child?',
        required: true,
      },
      { id: 'medications', type: 'long_text', label: 'Medications or conditions', sensitive: true },
    ],
  },
];
