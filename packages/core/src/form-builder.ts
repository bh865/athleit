import type { FormField, FormFieldType } from './schemas/registration';
import {
  CHOICE_FIELD_TYPES,
  FORBIDDEN_FIELD_MESSAGE,
  MAX_FIELD_OPTIONS,
  MAX_FORM_FIELDS,
  formFieldSchema,
  isForbiddenFieldText,
} from './schemas/registration';

/**
 * Pure model behind the form builder: the question palette, edits that keep ids and conditions consistent,
 * undo/redo, per-question validation, and a read-time adapter for stored schemas. No React here so the rules
 * are unit-tested and the web builder stays thin.
 */

export interface PaletteItem {
  type: FormFieldType;
  label: string;
  /** Icon name from @athleit/ui-core. */
  icon: string;
}

/** The question types a parent can answer. File upload and signature are not supported by the backend yet. */
export const PALETTE: readonly PaletteItem[] = [
  { type: 'short_text', label: 'Short text', icon: 'text-aa' },
  { type: 'long_text', label: 'Long text', icon: 'text-align-left' },
  { type: 'single_choice', label: 'Multiple choice', icon: 'radio-button' },
  { type: 'multiple_choice', label: 'Checkboxes', icon: 'check-square' },
  { type: 'dropdown', label: 'Dropdown', icon: 'caret-circle-down' },
  { type: 'date', label: 'Date', icon: 'calendar-blank' },
  { type: 'number', label: 'Number', icon: 'hash' },
  { type: 'email', label: 'Email', icon: 'envelope-simple' },
  { type: 'phone', label: 'Phone', icon: 'phone' },
  { type: 'address', label: 'Address', icon: 'map-pin' },
  { type: 'checkbox', label: 'Yes / no', icon: 'check-square' },
  { type: 'consent_checkbox', label: 'Consent', icon: 'signature' },
];

export const typeLabel = (t: FormFieldType): string =>
  PALETTE.find((p) => p.type === t)?.label ?? t;

export const isChoice = (t: FormFieldType): boolean => CHOICE_FIELD_TYPES.includes(t);

// --------------------------------------------------------------------------------------------- ids and options
const slug = (label: string, max: number) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, max);

/** A field id (`^[a-z][a-z0-9_]{0,39}$`) from a label, unique among `taken`. */
export function uniqueId(label: string, taken: ReadonlySet<string>, fallback = 'question'): string {
  const base = slug(label, 30) || fallback;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base.slice(0, 36)}_${n}`;
  return id;
}

/** Option list from labels; keeps the value of an existing option with the same label so answers stay valid. */
export function optionsFromLabels(
  labels: readonly string[],
  existing: readonly { value: string; label: string }[] = [],
): { value: string; label: string }[] {
  const byLabel = new Map(existing.map((o) => [o.label, o.value]));
  const used = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const raw of labels) {
    const label = raw.trim().slice(0, 100);
    if (!label) continue;
    const keep = byLabel.get(label);
    let value = keep && !used.has(keep) ? keep : uniqueId(label, used, 'option');
    if (used.has(value)) value = uniqueId(label, used, 'option');
    used.add(value);
    out.push({ value, label });
  }
  return out.slice(0, MAX_FIELD_OPTIONS);
}

/** Bulk paste: one option per line; commas and tabs also split, and bullets or numbers are stripped. */
export function parseBulkOptions(text: string): string[] {
  return text
    .split(/\r?\n|\t|,/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

// -------------------------------------------------------------------------------------------------- field edits
export function blankField(type: FormFieldType, taken: ReadonlySet<string>): FormField {
  const label = typeLabel(type);
  const f: FormField = { id: uniqueId('question', taken), type, label: '' };
  if (isChoice(type))
    f.options = [
      { value: 'option_1', label: 'Option 1' },
      { value: 'option_2', label: 'Option 2' },
    ];
  void label;
  return f;
}

/** Insert a new question after `afterId` (or at the end). Returns the new list and the new question's id. */
export function insertField(
  fields: readonly FormField[],
  type: FormFieldType,
  afterId?: string | null,
): { fields: FormField[]; id: string } {
  const f = blankField(type, new Set(fields.map((x) => x.id)));
  const at = afterId ? fields.findIndex((x) => x.id === afterId) + 1 : fields.length;
  const next = [...fields];
  next.splice(at < 0 ? fields.length : at, 0, f);
  return { fields: next, id: f.id };
}

/** Copy a question right below itself with a fresh id. Its condition stays, so the copy behaves the same. */
export function duplicateField(
  fields: readonly FormField[],
  id: string,
): { fields: FormField[]; id: string } {
  const i = fields.findIndex((x) => x.id === id);
  if (i < 0) return { fields: [...fields], id };
  const src = fields[i]!;
  const copy: FormField = {
    ...(JSON.parse(JSON.stringify(src)) as FormField),
    id: uniqueId(src.label || 'question', new Set(fields.map((x) => x.id))),
  };
  const next = [...fields];
  next.splice(i + 1, 0, copy);
  return { fields: next, id: copy.id };
}

/** Remove a question. Conditions that pointed at it are dropped so no field is left waiting on a missing answer. */
export function removeField(fields: readonly FormField[], id: string): FormField[] {
  const gone = new Set([id]);
  const out: FormField[] = [];
  for (const f of fields) {
    if (gone.has(f.id)) continue;
    if (f.show_if && gone.has(f.show_if.field)) {
      const { show_if: _drop, ...rest } = f;
      void _drop;
      out.push(rest);
    } else out.push(f);
  }
  return out;
}

/** Move a question from one index to another (drag, or Alt+arrow). */
export function moveField(fields: readonly FormField[], from: number, to: number): FormField[] {
  if (from === to || from < 0 || to < 0 || from >= fields.length || to >= fields.length)
    return [...fields];
  const next = [...fields];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it!);
  return next;
}

export function patchField(
  fields: readonly FormField[],
  id: string,
  patch: Partial<FormField>,
): FormField[] {
  return fields.map((f) => {
    if (f.id !== id) return f;
    const next = { ...f, ...patch };
    // `undefined` removes a key, so the saved schema never carries empty settings.
    for (const k of Object.keys(next) as (keyof FormField)[])
      if (next[k] === undefined) delete next[k];
    return next;
  });
}

/** Change a question's type, keeping what still makes sense (label, help, required) and fixing what does not. */
export function changeType(
  fields: readonly FormField[],
  id: string,
  type: FormFieldType,
): FormField[] {
  return fields.map((f) => {
    if (f.id !== id) return f;
    const { options, validation, ...rest } = f;
    const next: FormField = { ...rest, type };
    if (isChoice(type)) next.options = options ?? [{ value: 'option_1', label: 'Option 1' }];
    if (validation && (type === 'short_text' || type === 'long_text' || type === 'number'))
      next.validation = validation;
    // A condition on this question compared against old option values is no longer valid.
    return next;
  });
}

/** Questions a condition on `id` may look at: only earlier ones. */
export const conditionCandidates = (fields: readonly FormField[], id: string): FormField[] => {
  const i = fields.findIndex((f) => f.id === id);
  return i <= 0 ? [] : fields.slice(0, i);
};

/** Answer choices for a condition's "Answer" control; `null` means free text. */
export function conditionAnswers(
  f: FormField | undefined,
): { value: string; label: string }[] | null {
  if (!f) return null;
  if (f.options) return f.options;
  if (f.type === 'checkbox' || f.type === 'consent_checkbox')
    return [
      { value: 'true', label: 'Checked' },
      { value: 'false', label: 'Not checked' },
    ];
  return null;
}

// ----------------------------------------------------------------------------------------------- validation
export interface FieldIssues {
  label?: string;
  options?: string;
  logic?: string;
  other?: string;
}

/** Problems per question id. Empty object means the form can be saved and published. */
export function validateFields(fields: readonly FormField[]): Record<string, FieldIssues> {
  const out: Record<string, FieldIssues> = {};
  const add = (id: string, k: keyof FieldIssues, m: string) => {
    out[id] = { ...out[id], [k]: out[id]?.[k] ?? m };
  };
  const seen = new Set<string>();
  const sensitive = new Set<string>();
  for (const f of fields) {
    if (!f.label.trim()) add(f.id, 'label', 'Add a question label.');
    else if (isForbiddenFieldText(f.label) || isForbiddenFieldText(f.help))
      add(f.id, 'label', FORBIDDEN_FIELD_MESSAGE);
    if (isChoice(f.type)) {
      const opts = f.options ?? [];
      if (opts.length < 2) add(f.id, 'options', 'Add at least 2 options.');
      else if (opts.some((o) => !o.label.trim()))
        add(f.id, 'options', 'Every option needs a label.');
      else if (opts.some((o) => isForbiddenFieldText(o.label)))
        add(f.id, 'options', FORBIDDEN_FIELD_MESSAGE);
    }
    if (f.show_if) {
      if (!seen.has(f.show_if.field))
        add(f.id, 'logic', 'Show-if can only use an earlier question.');
      else if (sensitive.has(f.show_if.field) && !f.sensitive)
        add(
          f.id,
          'logic',
          'A question that depends on a medical answer must be marked medical too.',
        );
      else if ('equals' in f.show_if && f.show_if.equals === '')
        add(f.id, 'logic', 'Pick the answer that shows this question.');
    }
    if (f.sensitive) sensitive.add(f.id);
    seen.add(f.id);
    // Anything the schema rejects that we did not name above still blocks saving.
    const r = formFieldSchema.safeParse(f);
    if (!r.success && !out[f.id])
      add(f.id, 'other', r.error.issues[0]?.message ?? 'Check this question.');
  }
  if (fields.length > MAX_FORM_FIELDS && fields[0])
    add(fields[0].id, 'other', `A form can have up to ${MAX_FORM_FIELDS} questions.`);
  return out;
}

export const issueCount = (issues: Record<string, FieldIssues>): number =>
  Object.keys(issues).length;

// -------------------------------------------------------------------------------------------- legacy adapter
/**
 * Read-time adapter: turns whatever is stored (older forms, hand-edited drafts) into builder fields without
 * losing a question. Missing or repeated ids are repaired, choice questions get an options list, and anything
 * else is kept as is, so a problem shows up in the builder's validation rather than as a silently deleted question.
 */
export function adaptFormSchema(raw: unknown): { fields: FormField[]; repaired: number } {
  const list = (raw as { fields?: unknown } | null)?.fields;
  const rows = Array.isArray(list) ? list : [];
  const taken = new Set<string>();
  let repaired = 0;
  const fields = rows.map((r, i) => {
    const f = { ...((r && typeof r === 'object' ? r : {}) as Record<string, unknown>) };
    const label = typeof f.label === 'string' ? f.label : '';
    let id = typeof f.id === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(f.id) ? f.id : '';
    if (!id || taken.has(id)) {
      id = uniqueId(label, taken, `question_${i + 1}`);
      repaired++;
    }
    taken.add(id);
    const type = (typeof f.type === 'string' ? f.type : 'short_text') as FormFieldType;
    const out = { ...f, id, type, label } as FormField;
    if (isChoice(type) && !Array.isArray(out.options)) {
      out.options = [];
      repaired++;
    }
    return out;
  });
  return { fields, repaired };
}

// ---------------------------------------------------------------------------------------------- undo / redo
export interface Snapshot {
  name: string;
  fields: FormField[];
}
export interface History {
  past: Snapshot[];
  present: Snapshot;
  future: Snapshot[];
}
const LIMIT = 100;

export const startHistory = (present: Snapshot): History => ({ past: [], present, future: [] });

/** Record a change. Edits to the same `merge` key within one run (typing in a label) collapse into one step. */
export function commit(
  h: History,
  next: Snapshot,
  merge?: { key: string; last?: string },
): History {
  if (next === h.present) return h;
  const collapse = merge && merge.last === merge.key && h.past.length > 0;
  return {
    past: collapse ? h.past : [...h.past, h.present].slice(-LIMIT),
    present: next,
    future: [],
  };
}
export const canUndo = (h: History) => h.past.length > 0;
export const canRedo = (h: History) => h.future.length > 0;
export function undo(h: History): History {
  const prev = h.past[h.past.length - 1];
  return prev ? { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] } : h;
}
export function redo(h: History): History {
  const nxt = h.future[0];
  return nxt ? { past: [...h.past, h.present], present: nxt, future: h.future.slice(1) } : h;
}

// ------------------------------------------------------------------------------------------------ templates
const opts = (...labels: string[]) => optionsFromLabels(labels);

export interface FormStarter {
  id: string;
  name: string;
  description: string;
  icon: string;
  fields: FormField[];
}

/** Starter forms shown in the empty library and the empty builder. */
export const FORM_STARTERS: readonly FormStarter[] = [
  {
    id: 'player_info',
    name: 'Player Info',
    description: 'Name, birthdate, grade, T-shirt size and position.',
    icon: 'user-circle',
    fields: [
      {
        id: 'player_name',
        type: 'short_text',
        label: 'Player full name',
        required: true,
        placeholder: 'First and last name',
      },
      { id: 'birthdate', type: 'date', label: 'Date of birth', required: true, width: 'half' },
      {
        id: 'grade',
        type: 'dropdown',
        label: 'Grade',
        width: 'half',
        options: opts('Pre-K', 'K', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'),
      },
      {
        id: 'shirt_size',
        type: 'single_choice',
        label: 'T-shirt size',
        required: true,
        help: 'Used for the team jersey order.',
        options: opts('Youth Small', 'Youth Medium', 'Youth Large', 'Adult Small'),
      },
      {
        id: 'jersey_number',
        type: 'number',
        label: 'Jersey number preference',
        width: 'half',
        validation: { min: 0, max: 99 },
      },
      { id: 'position', type: 'short_text', label: 'Preferred position', width: 'half' },
      { id: 'school', type: 'short_text', label: 'School' },
      { id: 'experience', type: 'long_text', label: 'Past experience' },
      { id: 'notes', type: 'long_text', label: 'Anything else the coach should know?' },
    ],
  },
  {
    id: 'medical_emergency',
    name: 'Medical & Emergency',
    description: 'Emergency contacts, allergies and medical notes.',
    icon: 'first-aid-kit',
    fields: [
      {
        id: 'emergency_name',
        type: 'short_text',
        label: 'Emergency contact name',
        required: true,
        width: 'half',
      },
      {
        id: 'emergency_phone',
        type: 'phone',
        label: 'Emergency contact phone',
        required: true,
        width: 'half',
      },
      { id: 'emergency_relationship', type: 'short_text', label: 'Relationship to player' },
      {
        id: 'has_allergies',
        type: 'single_choice',
        label: 'Does your child have allergies?',
        sensitive: true,
        options: opts('Yes', 'No'),
      },
      {
        id: 'allergies',
        type: 'long_text',
        label: 'Describe the allergies',
        sensitive: true,
        show_if: { field: 'has_allergies', equals: 'yes' },
      },
      { id: 'medications', type: 'long_text', label: 'Medications or conditions', sensitive: true },
      { id: 'doctor', type: 'short_text', label: 'Family doctor or clinic', sensitive: true },
    ],
  },
  {
    id: 'photo_release',
    name: 'Photo Release',
    description: 'Permission to use photos and video of players.',
    icon: 'camera',
    fields: [
      {
        id: 'photo_team',
        type: 'consent_checkbox',
        label: 'Photos of my child may be shared with the team',
      },
      {
        id: 'photo_social',
        type: 'consent_checkbox',
        label: 'Photos may be posted on the club’s social media',
      },
      {
        id: 'photo_press',
        type: 'consent_checkbox',
        label: 'Photos may be used in press and promotion',
      },
      { id: 'photo_notes', type: 'short_text', label: 'Anything we should avoid?' },
    ],
  },
];
