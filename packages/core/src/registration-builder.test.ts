import { describe, expect, it } from 'vitest';

import {
  REG_STEPS,
  centsToDollars,
  dollarsToCents,
  draftToEventData,
  emptyDraft,
  eventDataValid,
  eventToDraft,
  fromLocalInput,
  issuesFor,
  previewFacts,
  publishBlockers,
  regIssues,
  stepState,
  toLocalInput,
} from './registration-builder';

const good = () => ({
  ...emptyDraft(),
  title: 'Fall 2026 Soccer, U8 Boys',
  price: '120',
  paymentTiming: 'at_submission' as const,
  capacity: '16',
  opensAt: '2026-08-01T09:00',
  closesAt: '2026-08-28T17:00',
  formId: 'form-1',
});

describe('money', () => {
  it('parses dollars to cents', () => {
    expect(dollarsToCents('120')).toBe(12000);
    expect(dollarsToCents('$12.5')).toBe(1250);
    expect(dollarsToCents('')).toBeNull();
    expect(dollarsToCents('12.345')).toBeNaN();
    expect(centsToDollars(12000)).toBe('120.00');
  });
});

describe('dates', () => {
  it('round-trips a local input through an ISO instant', () => {
    expect(toLocalInput(fromLocalInput('2026-08-01T09:30'))).toBe('2026-08-01T09:30');
    expect(fromLocalInput('')).toBeNull();
    expect(toLocalInput(null)).toBe('');
  });
});

describe('step validation', () => {
  it('passes a complete draft with no issues and no blockers', () => {
    expect(regIssues(good())).toEqual([]);
    expect(publishBlockers(good())).toEqual([]);
  });
  it('needs a name on Basics', () => {
    const i = issuesFor(regIssues({ ...good(), title: ' ' }), 'basics');
    expect(i[0]).toMatchObject({
      field: 'title',
      message: 'Add a name so parents can recognize it.',
    });
  });
  it('checks the age range and email', () => {
    const r = regIssues({ ...good(), ageMin: '12', ageMax: '8', contactEmail: 'nope' });
    expect(r.map((x) => x.field)).toEqual(['ageMax', 'contactEmail']);
  });
  it('checks price, payment timing and capacity on Pricing', () => {
    expect(regIssues({ ...good(), price: 'abc' })[0]?.field).toBe('price');
    expect(regIssues({ ...good(), price: '0.10' })[0]?.message).toMatch(/\$0\.50/);
    expect(regIssues({ ...good(), paymentTiming: 'none' })[0]?.field).toBe('paymentTiming');
    expect(regIssues({ ...good(), capacity: '0' })[0]?.field).toBe('capacity');
    expect(regIssues({ ...good(), price: '', paymentTiming: 'none' })).toEqual([]);
  });
  it('catches a close date before the open date', () => {
    const r = regIssues({ ...good(), closesAt: '2026-07-01T09:00' });
    expect(r).toEqual([
      { step: 'dates', field: 'closesAt', message: 'The close date is before the open date.' },
    ]);
  });
  it('requires a form to publish', () => {
    expect(regIssues({ ...good(), formId: '' })).toEqual([
      { step: 'form', field: 'formId', message: 'Add at least one form.' },
    ]);
  });
});

describe('publish gating', () => {
  it('lists every blocker with its step name', () => {
    const b = publishBlockers({ ...good(), closesAt: '2026-07-01T09:00', formId: '' });
    expect(b).toEqual([
      'Dates: the close date is before the open date',
      'Form & waivers: add at least one form',
    ]);
  });
});

describe('step rail state', () => {
  it('stays neutral until a step is visited, then marks done or error', () => {
    const issues = regIssues({ ...good(), title: '' });
    expect(stepState('basics', issues, new Set())).toBe('todo');
    expect(stepState('basics', issues, new Set(['basics']))).toBe('error');
    expect(stepState('pricing', issues, new Set(['pricing']))).toBe('done');
    expect(stepState('basics', issues, new Set(), true)).toBe('error');
    expect(stepState('review', issues, new Set(['review']))).toBe('todo');
    expect(REG_STEPS).toHaveLength(5);
  });
});

describe('event data', () => {
  const extra = {
    slug: 'fall-2026-soccer',
    formVersionId: null,
    waiverVersionIds: [],
    infoBlocks: [],
  };
  it('produces a payload the server schema accepts', () => {
    const data = draftToEventData({ ...good(), ageMin: '6', ageMax: '8' }, extra);
    expect(data.price_cents).toBe(12000);
    expect(data.eligibility).toEqual({ type: 'age', min: 6, max: 8 });
    expect(eventDataValid(data)).toEqual({ ok: true });
  });
  it('drops payment timing when the registration is free', () => {
    expect(draftToEventData({ ...good(), price: '' }, extra).payment_timing).toBe('none');
  });
  it('keeps existing info blocks', () => {
    const blocks = [{ type: 'description', body: 'x' }];
    expect(draftToEventData(good(), { ...extra, infoBlocks: blocks }).info_blocks).toBe(blocks);
  });
  it('round-trips a stored event', () => {
    const data = draftToEventData({ ...good(), ageMin: '6' }, extra);
    const back = eventToDraft(data as never, 'form-1', ['w1']);
    expect(back).toMatchObject({
      title: good().title,
      price: '120.00',
      capacity: '16',
      ageMin: '6',
      formId: 'form-1',
      waiverIds: ['w1'],
    });
  });
});

describe('preview', () => {
  it('describes what a parent sees', () => {
    const p = previewFacts({ ...good(), waiverIds: ['w'] }, 16, 'Player Info');
    expect(p).toMatchObject({
      title: 'Fall 2026 Soccer, U8 Boys',
      fee: '$120',
      spots: '16 spots',
      waivers: '1 waiver required',
    });
    expect(p.forms).toBe('Player Info · 16 questions');
    expect(previewFacts(emptyDraft(), 0).title).toBe('Untitled registration');
  });
});
