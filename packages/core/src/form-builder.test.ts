import { describe, expect, it } from 'vitest';

import {
  FORM_STARTERS,
  PALETTE,
  adaptFormSchema,
  canRedo,
  canUndo,
  changeType,
  commit,
  conditionAnswers,
  conditionCandidates,
  duplicateField,
  insertField,
  issueCount,
  moveField,
  optionsFromLabels,
  parseBulkOptions,
  patchField,
  redo,
  removeField,
  startHistory,
  undo,
  uniqueId,
  validateFields,
} from './form-builder';
import { validateAnswers } from './registration';
import { formSchemaSchema, type FormField } from './schemas/registration';

const f = (id: string, extra: Partial<FormField> = {}): FormField => ({
  id,
  type: 'short_text',
  label: id,
  ...extra,
});

describe('palette and starters', () => {
  it('only offers types the backend stores', () => {
    expect(PALETTE.map((p) => p.type)).not.toContain('file_upload');
    expect(new Set(PALETTE.map((p) => p.type)).size).toBe(PALETTE.length);
  });
  it('ships starters that pass the real schema and have the advertised sizes', () => {
    expect(FORM_STARTERS.map((s) => s.fields.length)).toEqual([9, 7, 4]);
    for (const s of FORM_STARTERS)
      expect(formSchemaSchema.safeParse({ fields: s.fields }).success, s.name).toBe(true);
  });
  it('keeps medical answers sensitive in the Medical starter', () => {
    const med = FORM_STARTERS.find((s) => s.id === 'medical_emergency')!;
    expect(med.fields.filter((x) => x.sensitive).length).toBeGreaterThan(0);
    expect(validateFields(med.fields)).toEqual({});
  });
});

describe('ids and options', () => {
  it('makes unique valid ids', () => {
    expect(uniqueId('T-shirt size!', new Set())).toBe('t_shirt_size');
    expect(uniqueId('Name', new Set(['name']))).toBe('name_2');
    expect(uniqueId('123', new Set(), 'q')).toMatch(/^[a-z]/);
  });
  it('keeps the value of an option whose label did not change', () => {
    const out = optionsFromLabels(['Small', 'Large', 'Large'], [{ value: 's', label: 'Small' }]);
    expect(out.map((o) => o.value)).toEqual(['s', 'large', 'large_2']);
  });
  it('parses bulk paste', () => {
    expect(parseBulkOptions('1. Small\n- Medium\n• Large, XL\tXXL')).toEqual([
      'Small',
      'Medium',
      'Large',
      'XL',
      'XXL',
    ]);
  });
});

describe('editing', () => {
  const base = [f('a'), f('b'), f('c', { show_if: { field: 'a', equals: 'x' } })];
  it('inserts after a question, or at the end', () => {
    const r = insertField(base, 'email', 'a');
    expect(r.fields.map((x) => x.id)[1]).toBe(r.id);
    expect(insertField(base, 'phone').fields.at(-1)!.type).toBe('phone');
  });
  it('gives choice questions starter options', () => {
    expect(insertField([], 'dropdown').fields[0]!.options).toHaveLength(2);
  });
  it('duplicates below with a fresh id and keeps the condition', () => {
    const r = duplicateField(base, 'c');
    expect(r.fields).toHaveLength(4);
    expect(r.fields[3]!.id).not.toBe('c');
    expect(r.fields[3]!.show_if).toEqual({ field: 'a', equals: 'x' });
    expect(r.fields[3]).not.toBe(base[2]);
  });
  it('reorders', () => {
    expect(moveField(base, 0, 2).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(moveField(base, 1, 1)).toEqual(base);
    expect(moveField(base, 0, 9)).toEqual(base);
  });
  it('removes a question and drops conditions that depended on it', () => {
    const out = removeField(base, 'a');
    expect(out.map((x) => x.id)).toEqual(['b', 'c']);
    expect(out[1]!.show_if).toBeUndefined();
  });
  it('removes a setting when patched to undefined', () => {
    expect(patchField([f('a', { help: 'x' })], 'a', { help: undefined })[0]).not.toHaveProperty(
      'help',
    );
  });
  it('changes type, adding or removing options', () => {
    const toChoice = changeType([f('a')], 'a', 'dropdown')[0]!;
    expect(toChoice.options).toHaveLength(1);
    const back = changeType([toChoice], 'a', 'email')[0]!;
    expect(back.options).toBeUndefined();
  });
  it('limits conditions to earlier questions', () => {
    expect(conditionCandidates(base, 'c').map((x) => x.id)).toEqual(['a', 'b']);
    expect(conditionCandidates(base, 'a')).toEqual([]);
  });
  it('offers answers for choices and checkboxes, free text otherwise', () => {
    expect(conditionAnswers(f('x', { type: 'checkbox' }))!.map((o) => o.value)).toEqual([
      'true',
      'false',
    ]);
    expect(conditionAnswers(f('x'))).toBeNull();
    expect(
      conditionAnswers(f('x', { type: 'dropdown', options: [{ value: 'y', label: 'Y' }] })),
    ).toHaveLength(1);
  });
});

describe('conditional logic end to end', () => {
  it('shows a follow-up only for the matching answer', () => {
    const med = FORM_STARTERS.find((s) => s.id === 'medical_emergency')!;
    const schema = formSchemaSchema.parse({ fields: med.fields });
    const base = { emergency_name: 'A', emergency_phone: '555-123-4567' };
    expect(validateAnswers(schema, { ...base, has_allergies: 'no', allergies: 'peanuts' }).ok).toBe(
      false,
    );
    expect(
      validateAnswers(schema, { ...base, has_allergies: 'yes', allergies: 'peanuts' }).ok,
    ).toBe(true);
  });
});

describe('validateFields', () => {
  it('flags a missing label and too few options', () => {
    const r = validateFields([
      f('a', { label: '' }),
      f('b', { type: 'dropdown', options: [{ value: 'x', label: 'X' }] }),
    ]);
    expect(r.a?.label).toBe('Add a question label.');
    expect(r.b?.options).toBe('Add at least 2 options.');
    expect(issueCount(r)).toBe(2);
  });
  it('refuses forbidden questions', () => {
    expect(validateFields([f('a', { label: 'Social security number' })]).a?.label).toMatch(
      /Social Security/,
    );
  });
  it('flags a condition on a later question or an unanswered condition', () => {
    const r = validateFields([
      f('a', { show_if: { field: 'b', equals: 'x' } }),
      f('b'),
      f('c', { show_if: { field: 'b', equals: '' } }),
    ]);
    expect(r.a?.logic).toMatch(/earlier/);
    expect(r.c?.logic).toMatch(/answer/);
  });
  it('requires a sensitive follow-up to be sensitive too', () => {
    const r = validateFields([
      f('a', { sensitive: true }),
      f('b', { show_if: { field: 'a', equals: 'x' } }),
    ]);
    expect(r.b?.logic).toMatch(/medical/);
  });
  it('accepts a clean form', () => {
    expect(validateFields([f('a'), f('b', { width: 'half', placeholder: 'x' })])).toEqual({});
  });
});

describe('legacy adapter', () => {
  it('opens an existing form without losing any question', () => {
    const stored = {
      fields: [
        {
          id: 'shirt',
          type: 'dropdown',
          label: 'Shirt',
          required: true,
          options: [{ value: 's', label: 'S' }],
        },
        { id: 'shirt', type: 'short_text', label: 'Dupe id' },
        { type: 'phone', label: 'No id' },
      ],
    };
    const { fields, repaired } = adaptFormSchema(stored);
    expect(fields).toHaveLength(3);
    expect(new Set(fields.map((x) => x.id)).size).toBe(3);
    expect(fields[0]).toMatchObject({ required: true, options: [{ value: 's', label: 'S' }] });
    expect(repaired).toBe(2);
  });
  it('tolerates empty and malformed input', () => {
    expect(adaptFormSchema(null).fields).toEqual([]);
    expect(adaptFormSchema({ fields: 'nope' }).fields).toEqual([]);
  });
  it('keeps old forms valid: the new settings are optional', () => {
    const old = FORM_STARTERS[0]!.fields.map(({ width: _w, placeholder: _p, ...rest }) => rest);
    expect(formSchemaSchema.safeParse({ fields: old }).success).toBe(true);
  });
});

describe('undo and redo', () => {
  it('walks back and forward, and a new edit clears redo', () => {
    let h = startHistory({ name: 'x', fields: [] });
    h = commit(h, { name: 'x', fields: [f('a')] });
    h = commit(h, { name: 'x', fields: [f('a'), f('b')] });
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(h.present.fields).toHaveLength(1);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present.fields).toHaveLength(2);
    h = undo(undo(h));
    h = commit(h, { name: 'y', fields: [] });
    expect(canRedo(h)).toBe(false);
  });
  it('collapses typing into one step', () => {
    let h = startHistory({ name: 'x', fields: [f('a')] });
    h = commit(h, { name: 'x', fields: [f('a', { label: 'N' })] }, { key: 'a:label' });
    h = commit(
      h,
      { name: 'x', fields: [f('a', { label: 'Na' })] },
      { key: 'a:label', last: 'a:label' },
    );
    expect(h.past).toHaveLength(1);
  });
});
