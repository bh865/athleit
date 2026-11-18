import { describe, expect, it } from 'vitest';

import { csvSafeCell, validateAnswers, visibleFields } from './registration';
import {
  formFieldSchema,
  formSchemaSchema,
  infoBlocksSchema,
  isForbiddenFieldText,
  registrationEventDataSchema,
  submitRegistrationSchema,
  waiverAcceptanceSchema,
} from './schemas/registration';
import { can } from './capabilities';

const form = formSchemaSchema.parse({
  fields: [
    {
      id: 'shirt',
      type: 'dropdown',
      label: 'Shirt',
      required: true,
      options: [
        { value: 's', label: 'S' },
        { value: 'm', label: 'M' },
      ],
    },
    { id: 'has_allergy', type: 'checkbox', label: 'Any allergies?' },
    {
      id: 'allergy',
      type: 'long_text',
      label: 'Allergies',
      sensitive: true,
      show_if: { field: 'has_allergy', equals: true },
    },
    { id: 'age', type: 'number', label: 'Age', validation: { min: 4, max: 18 } },
    { id: 'terms', type: 'consent_checkbox', label: 'I agree', required: true },
  ],
});

describe('form schema', () => {
  it.each([
    'SSN',
    'Social Security number',
    "Driver's license #",
    'Passport no.',
    'Credit card number',
    'CVV code',
    'Bank account',
  ])('refuses a field asking for %s', (label) => {
    expect(isForbiddenFieldText(label)).toBe(true);
    expect(formFieldSchema.safeParse({ id: 'x', type: 'short_text', label }).success).toBe(false);
  });
  it('allows ordinary labels', () => {
    expect(isForbiddenFieldText('Shirt size')).toBe(false);
    expect(isForbiddenFieldText('Classroom')).toBe(false);
  });
  it('has no file-upload type and rejects unknown keys', () => {
    expect(formFieldSchema.safeParse({ id: 'x', type: 'file', label: 'Doc' }).success).toBe(false);
    expect(
      formFieldSchema.safeParse({ id: 'x', type: 'short_text', label: 'a', onclick: 'x' }).success,
    ).toBe(false);
  });
  it('requires options only for choice fields and unique ids', () => {
    expect(formFieldSchema.safeParse({ id: 'x', type: 'dropdown', label: 'a' }).success).toBe(
      false,
    );
    expect(
      formFieldSchema.safeParse({
        id: 'x',
        type: 'short_text',
        label: 'a',
        options: [{ value: 'a', label: 'a' }],
      }).success,
    ).toBe(false);
    const dup = {
      fields: [
        { id: 'a', type: 'short_text', label: 'a' },
        { id: 'a', type: 'short_text', label: 'b' },
      ],
    };
    expect(formSchemaSchema.safeParse(dup).success).toBe(false);
  });
  it('allows show-if only on an earlier field', () => {
    const fwd = {
      fields: [
        { id: 'a', type: 'short_text', label: 'a', show_if: { field: 'b', equals: 'x' } },
        { id: 'b', type: 'short_text', label: 'b' },
      ],
    };
    expect(formSchemaSchema.safeParse(fwd).success).toBe(false);
  });
});

describe('form rules from the security review', () => {
  it.each(['S.S.N.', 'soc sec #', 'Social Insurance Number', 'SIN number'])(
    'refuses %s',
    (label) => {
      expect(isForbiddenFieldText(label)).toBe(true);
    },
  );
  it('checks option labels too', () => {
    const f = {
      id: 'x',
      type: 'dropdown',
      label: 'ID type',
      options: [{ value: 'a', label: 'Passport' }],
    };
    expect(formFieldSchema.safeParse(f).success).toBe(false);
  });
  it('an ordinary field cannot depend on a sensitive answer', () => {
    const leaky = {
      fields: [
        { id: 'cond', type: 'checkbox', label: 'Any conditions?', sensitive: true },
        {
          id: 'detail',
          type: 'short_text',
          label: 'Tell us more',
          show_if: { field: 'cond', equals: true },
        },
      ],
    };
    expect(formSchemaSchema.safeParse(leaky).success).toBe(false);
    const ok = { fields: [leaky.fields[0], { ...leaky.fields[1], sensitive: true }] };
    expect(formSchemaSchema.safeParse(ok).success).toBe(true);
  });
});

describe('answer validation', () => {
  it('accepts valid answers and splits sensitive ones', () => {
    const r = validateAnswers(form, {
      shirt: 's',
      has_allergy: true,
      allergy: 'peanuts',
      terms: true,
    });
    expect(r).toEqual({
      ok: true,
      answers: { shirt: 's', has_allergy: true, terms: true },
      sensitive: { allergy: 'peanuts' },
    });
  });
  it('requires visible required fields, including consent', () => {
    const r = validateAnswers(form, { has_allergy: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['shirt', 'terms']);
  });
  it('rejects unknown options, wrong types and out-of-range numbers', () => {
    const r = validateAnswers(form, { shirt: 'xl', age: 3, terms: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['age', 'shirt']);
    expect(
      validateAnswers(form, { shirt: 's', terms: true, age: '9' as unknown as number }).ok,
    ).toBe(false);
  });
  it('rejects hidden-field smuggling and unknown keys', () => {
    const hidden = validateAnswers(form, { shirt: 's', terms: true, allergy: 'peanuts' });
    expect(hidden.ok).toBe(false);
    const unknown = validateAnswers(form, { shirt: 's', terms: true, evil: 'x' });
    expect(unknown.ok).toBe(false);
  });
  it('rejects oversized payloads', () => {
    expect(validateAnswers(form, { shirt: 's', terms: true, junk: 'x'.repeat(60_000) }).ok).toBe(
      false,
    );
  });
  it('evaluates show-if chains', () => {
    expect(visibleFields(form, { has_allergy: true }).map((f) => f.id)).toContain('allergy');
    expect(visibleFields(form, { has_allergy: false }).map((f) => f.id)).not.toContain('allergy');
  });
});

describe('csvSafeCell', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx'])('neutralizes %j', (v) => {
    expect(csvSafeCell(v).startsWith("'")).toBe(true);
  });
  it('quotes commas and quotes', () => {
    expect(csvSafeCell('a,"b"')).toBe('"a,""b"""');
  });
});

describe('info blocks and inputs', () => {
  it('accepts typed blocks and rejects raw html blocks', () => {
    expect(infoBlocksSchema.safeParse([{ type: 'description', body: 'Hello' }]).success).toBe(true);
    expect(infoBlocksSchema.safeParse([{ type: 'html', html: '<script>' }]).success).toBe(false);
  });
  it('event data refuses unknown keys such as status, and a price without a timing', () => {
    expect(registrationEventDataSchema.safeParse({ status: 'open' }).success).toBe(false);
    expect(
      registrationEventDataSchema.safeParse({ price_cents: 2500, payment_timing: 'none' }).success,
    ).toBe(false);
    expect(
      registrationEventDataSchema.safeParse({
        price_cents: 2500,
        payment_timing: 'after_acceptance',
      }).success,
    ).toBe(true);
  });
  it('submission needs the guardian attestation and an empty honeypot, and normalizes email', () => {
    const base = {
      slug: 'fall-2026',
      formVersionId: crypto.randomUUID(),
      guardianName: 'Pat',
      guardianEmail: ' PAT@Example.TEST ',
      guardianRelationship: 'Mother',
      playerFirstName: 'Ava',
      playerLastName: 'Adams',
      playerDateOfBirth: '2016-05-05',
      guardianAttestation: true as const,
      answers: {},
    };
    const ok = submitRegistrationSchema.parse(base);
    expect(ok.guardianEmail).toBe('pat@example.test');
    expect(
      submitRegistrationSchema.safeParse({ ...base, guardianAttestation: false }).success,
    ).toBe(false);
    expect(submitRegistrationSchema.safeParse({ ...base, website: 'spam' }).success).toBe(false);
    expect(submitRegistrationSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
  it('a waiver acceptance requires electronic consent', () => {
    const base = {
      waiverVersionId: crypto.randomUUID(),
      signerName: 'Pat',
      signerRelationship: 'Mother',
      signerEmail: 'p@e.co',
    };
    expect(waiverAcceptanceSchema.safeParse({ ...base, electronicConsent: false }).success).toBe(
      false,
    );
    expect(waiverAcceptanceSchema.safeParse({ ...base, electronicConsent: true }).success).toBe(
      true,
    );
  });
});

describe('registration capabilities', () => {
  it('maps roles like docs/permissions.md', () => {
    expect(can({ kind: 'team', role: 'admin' }, 'registration.sensitive')).toBe(true);
    expect(can({ kind: 'team', role: 'manager' }, 'registration.sensitive')).toBe(false);
    expect(can({ kind: 'team', role: 'manager' }, 'registration.manage')).toBe(true);
    expect(can({ kind: 'team', role: 'coach' }, 'registration.manage')).toBe(false);
    expect(can({ kind: 'team', role: 'coach' }, 'registration.place')).toBe(true);
    expect(can({ kind: 'team', role: 'parent' }, 'registration.view')).toBe(false);
    expect(can({ kind: 'team', role: 'parent' }, 'registration.register')).toBe(true);
    expect(can({ kind: 'family', role: 'guardian' }, 'registration.register')).toBe(true);
    expect(can({ kind: 'club', role: 'admin' }, 'documents.manage')).toBe(true);
    expect(can({ kind: 'club', role: 'manager' }, 'registration.view')).toBe(false);
  });
});
