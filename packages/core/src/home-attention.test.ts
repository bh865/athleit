import { describe, expect, it } from 'vitest';

import {
  attentionChip,
  attentionRank,
  deriveAttention,
  type AttentionItem,
} from './home-attention';

const item = (o: Partial<AttentionItem> & Pick<AttentionItem, 'kind' | 'key'>): AttentionItem => ({
  label: o.key,
  href: '/',
  ...o,
});
const NY = 'America/New_York';
// Thu 19 Nov 2026, 12:00 in New York (EST).
const NOW = new Date('2026-11-19T17:00:00Z');

describe('attentionRank (priority tiers)', () => {
  it('1: blocks participation or overdue', () => {
    expect(attentionRank(item({ kind: 'waiver', key: 'w' }), NOW)).toBe(1);
    expect(attentionRank(item({ kind: 'payouts', key: 'p' }), NOW)).toBe(1);
    expect(
      attentionRank(item({ kind: 'payment', key: 'a', dueAt: '2026-11-10T00:00:00Z' }), NOW),
    ).toBe(1);
    expect(attentionRank(item({ kind: 'payment', key: 'a', overdue: true }), NOW)).toBe(1);
  });
  it('2: time-boxed and close', () => {
    expect(attentionRank(item({ kind: 'result', key: 'r' }), NOW)).toBe(2);
    expect(
      attentionRank(item({ kind: 'rsvp', key: 'r', dueAt: '2026-11-21T00:00:00Z' }), NOW),
    ).toBe(2);
    expect(
      attentionRank(item({ kind: 'payment', key: 'a', dueAt: '2026-11-25T00:00:00Z' }), NOW),
    ).toBe(2);
  });
  it('3: decisions others wait on', () => {
    for (const kind of [
      'joinRequests',
      'loginClaims',
      'linkRequests',
      'registrationsToDecide',
    ] as const)
      expect(attentionRank(item({ kind, key: kind }), NOW)).toBe(3);
  });
  it('4: everything else', () => {
    expect(
      attentionRank(item({ kind: 'rsvp', key: 'r', dueAt: '2026-11-24T00:00:00Z' }), NOW),
    ).toBe(4);
    expect(
      attentionRank(item({ kind: 'payment', key: 'a', dueAt: '2026-12-30T00:00:00Z' }), NOW),
    ).toBe(4);
    expect(attentionRank(item({ kind: 'registrationStep', key: 'x' }), NOW)).toBe(4);
    expect(attentionRank(item({ kind: 'setup', key: 'x' }), NOW)).toBe(4);
  });
});

describe('deriveAttention ordering', () => {
  it('walks the tiers in order and the first item is the lead', () => {
    const r = deriveAttention(
      [
        item({ kind: 'setup', key: 'setup' }),
        item({ kind: 'joinRequests', key: 'join', count: 1 }),
        item({ kind: 'rsvp', key: 'rsvp', dueAt: '2026-11-20T15:00:00Z' }),
        item({ kind: 'waiver', key: 'waiver' }),
      ],
      NOW,
    );
    expect(r.all.map((i) => i.key)).toEqual(['waiver', 'rsvp', 'join', 'setup']);
    expect(r.lead?.key).toBe('waiver');
  });
  it('ties inside a tier go to the oldest due date', () => {
    const r = deriveAttention(
      [
        item({ kind: 'payment', key: 'b', dueAt: '2026-11-12T00:00:00Z' }),
        item({ kind: 'payment', key: 'a', dueAt: '2026-11-05T00:00:00Z' }),
        item({ kind: 'waiver', key: 'nodate' }),
      ],
      NOW,
    );
    expect(r.all.map((i) => i.key)).toEqual(['a', 'b', 'nodate']);
  });
  it('merges household and team items into one list with place tags kept', () => {
    const r = deriveAttention(
      [
        item({ kind: 'joinRequests', key: 'j', placeTag: 'U12 Falcons' }),
        item({ kind: 'waiver', key: 'w', placeTag: 'Household' }),
      ],
      NOW,
    );
    expect(r.all.map((i) => [i.key, i.placeTag])).toEqual([
      ['w', 'Household'],
      ['j', 'U12 Falcons'],
    ]);
  });
  it('shows 4 and puts the rest behind "+N more"', () => {
    const many = Array.from({ length: 6 }, (_, i) => item({ kind: 'waiver', key: `w${i}` }));
    const r = deriveAttention(many, NOW);
    expect(r.shown).toHaveLength(4);
    expect(r.more.map((i) => i.key)).toEqual(['w4', 'w5']);
    expect(r.all).toHaveLength(6);
  });
  it('is empty with no lead when nothing is open', () => {
    const r = deriveAttention([], NOW);
    expect(r.lead).toBeNull();
    expect(r.shown).toEqual([]);
  });
});

describe('attentionChip wording', () => {
  const chip = (o: Partial<AttentionItem>, now = NOW, zone = NY) =>
    attentionChip(item({ kind: 'payment', key: 'k', ...o }), now, zone);
  const at = (iso: string) => ({ dueAt: iso });

  it('under an hour: Closes in N min', () => {
    expect(chip(at('2026-11-19T17:40:00Z'))).toMatchObject({
      text: 'Closes in 40 min',
      tone: 'soon',
      icon: 'clock',
    });
  });
  it('same day: tonight in the evening, today otherwise', () => {
    expect(chip(at('2026-11-20T02:00:00Z'))?.text).toBe('Closes tonight'); // 9 pm EST
    expect(chip(at('2026-11-19T20:00:00Z'))?.text).toBe('Closes today'); // 3 pm EST
  });
  it('within a week: Due tomorrow / Due in N days', () => {
    expect(chip(at('2026-11-20T17:00:00Z'))?.text).toBe('Due tomorrow');
    expect(chip(at('2026-11-22T17:00:00Z'))?.text).toBe('Due in 3 days');
  });
  it('events use their noun: Game in 2 days', () => {
    expect(
      chip({ kind: 'rsvp', dueAt: '2026-11-21T15:00:00Z', dueMode: 'event', eventNoun: 'Game' }),
    ).toMatchObject({ text: 'Game in 2 days', tone: 'soon' });
    expect(
      chip({ kind: 'rsvp', dueAt: '2026-11-19T17:30:00Z', dueMode: 'event', eventNoun: 'Practice' })
        ?.text,
    ).toBe('Practice in 30 min');
  });
  it('further out: Due Dec 1, calm', () => {
    expect(chip(at('2026-12-01T17:00:00Z'))).toMatchObject({ text: 'Due Dec 1', tone: 'calm' });
  });
  it('overdue: Overdue N days, urgent with a warning icon', () => {
    expect(chip(at('2026-11-14T17:00:00Z'))).toMatchObject({
      text: 'Overdue 5 days',
      tone: 'urgent',
      icon: 'warning',
    });
    expect(chip(at('2026-11-18T17:00:00Z'))?.text).toBe('Overdue 1 day');
    expect(chip(at('2026-11-19T15:00:00Z'))?.text).toBe('Overdue today');
  });
  it('expired: Expired Nov 15', () => {
    expect(
      chip({ kind: 'waiver', dueAt: '2026-11-15T17:00:00Z', dueMode: 'expired' }),
    ).toMatchObject({
      text: 'Expired Nov 15',
      tone: 'urgent',
    });
  });
  it('has no chip without a date', () => {
    expect(chip({})).toBeNull();
  });
  it('counts days in the viewer’s zone, not UTC', () => {
    // 20 Nov 16:00 in Auckland (NZDT) is still the same local day as "now" (20 Nov 06:00 there).
    const tz = 'Pacific/Auckland';
    expect(chip(at('2026-11-20T03:00:00Z'), NOW, tz)?.text).toBe('Closes today');
    expect(chip(at('2026-11-20T03:00:00Z'), NOW, NY)?.text).toBe('Closes tonight'); // 10 pm EST
  });
  it('is right across the spring-forward change', () => {
    // Sat 7 Mar 3 pm EST -> Sun 8 Mar 9 am EDT is 17 hours away but tomorrow on the calendar.
    const now = new Date('2026-03-07T20:00:00Z');
    expect(chip(at('2026-03-08T13:00:00Z'), now)?.text).toBe('Due tomorrow');
    // 23-hour day: 8 Mar 9 am EDT is 3 days (not 2) before 11 Mar 9 am EDT only by calendar.
    expect(chip(at('2026-03-11T13:00:00Z'), now)?.text).toBe('Due in 4 days');
  });
});
