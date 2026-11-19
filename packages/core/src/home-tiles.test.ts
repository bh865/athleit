import { describe, expect, it } from 'vitest';

import { deriveAttention, withinRsvpWindow, type AttentionItem } from './home-attention';
import { homeTileIds, type HomeTileId } from './home-tiles';

const ctx = (kind: 'family' | 'team' | 'club', id: string, role: string, roles?: string[]) =>
  ({ kind, id, role, roles: roles ?? [role], title: `${kind} ${id}` }) as never;

const family = ctx('family', 'h1', 'guardian');
const parent1 = ctx('team', 't1', 'parent');
const parent2 = ctx('team', 't2', 'parent');
const player = ctx('team', 't1', 'player');
const coach = ctx('team', 't1', 'coach');
const manager = ctx('team', 't1', 'manager');
const admin = ctx('team', 't1', 'admin');
const adminParent = ctx('team', 't1', 'admin', ['admin', 'parent']);
const clubAdmin = ctx('club', 'c1', 'admin');

const ids = (contexts: never[], active: never | null) =>
  new Set<HomeTileId>(homeTileIds(contexts, active));

const SCHEDULE: HomeTileId[] = ['nextUp', 'scheduleChanges', 'teamRecord'];
const REMOVED = ['thisWeek', 'messages', 'announcement', 'payouts', 'places', 'calendar', 'notificationHealth'];
const STAFF_ONLY: HomeTileId[] = ['collection', 'members'];

describe('homeTileIds per persona', () => {
  it('parent: schedule, own money, waivers, family; no staff tiles', () => {
    const t = ids([family, parent1], parent1);
    for (const id of [
      ...SCHEDULE,
      'attention',
      'amountDue',
      'waivers',
      'family',
      'roster',
      'documents',
    ] as HomeTileId[])
      expect(t.has(id), id).toBe(true);
    for (const id of [...STAFF_ONLY, 'setup', 'club'] as HomeTileId[])
      expect(t.has(id), id).toBe(false);
  });

  it('two-team parent: tiles load once, places tile shows', () => {
    const list = homeTileIds([family, parent1, parent2], parent1);
    expect(new Set(list).size).toBe(list.length);
  });

  it('parent not yet placed (household only): no schedule or team tiles', () => {
    const t = ids([family], family);
    for (const id of [...SCHEDULE, 'roster'] as HomeTileId[])
      expect(t.has(id), id).toBe(false);
    for (const id of ['amountDue', 'family', 'waivers', 'attention'] as HomeTileId[])
      expect(t.has(id), id).toBe(true);
  });

  it('player 13+: schedule and messages, amount due read-only, no staff tiles', () => {
    const list = homeTileIds([player], player);
    const t = new Set(list);
    for (const id of [...SCHEDULE, 'roster'] as HomeTileId[])
      expect(t.has(id), id).toBe(true);
    expect(t.has('amountDue')).toBe(true);
    for (const id of [
      ...STAFF_ONLY,
      'approvals',
      'family',
      'setup',
      'waivers',
      'registrations',
    ] as HomeTileId[])
      expect(t.has(id), id).toBe(false);
  });

  it('coach: staff tiles, payouts limited, no setup, no family, no members.manage', () => {
    const t = ids([coach], coach);
    for (const id of [
      ...SCHEDULE,
      'collection',
      'approvals',
      'roster',
      'waivers',
      'registrations',
      'members',
    ] as HomeTileId[])
      expect(t.has(id), id).toBe(true);
    for (const id of ['amountDue', 'family', 'setup'] as HomeTileId[])
      expect(t.has(id), id).toBe(false);
  });

  it('manager: registration manage gives the setup checklist', () => {
    const t = ids([manager], manager);
    expect(t.has('setup')).toBe(true);
  });

  it('admin + parent in one place: every admin tile plus every parent tile', () => {
    const t = ids([family, adminParent], adminParent);
    for (const id of [
      'collection',
      'approvals',
      'setup',
      'members',
      'amountDue',
      'family',
      'waivers',
      ...SCHEDULE,
    ] as HomeTileId[])
      expect(t.has(id), id).toBe(true);
    const adminOnly = ids([admin], admin);
    for (const id of adminOnly) expect(t.has(id), id).toBe(true);
  });

  it('club admin: club overview and approvals, no schedule or family tiles', () => {
    const t = ids([clubAdmin], clubAdmin);
    for (const id of ['club', 'approvals', 'collection', 'attention'] as HomeTileId[])
      expect(t.has(id), id).toBe(true);
    for (const id of [...SCHEDULE, 'amountDue', 'family'] as HomeTileId[])
      expect(t.has(id), id).toBe(false);
  });

  it('no place: nothing, so Home shows onboarding', () => {
    expect(homeTileIds([], null)).toEqual([]);
  });

  it('is ordered by the matrix and has no duplicates', () => {
    const list = homeTileIds([family, adminParent], adminParent);
    expect(list[0]).toBe('attention');
    expect(new Set(list).size).toBe(list.length);
  });
});

describe('removed tiles', () => {
  it('no persona is ever given a removed tile id', () => {
    const personas: [never[], never][] = [
      [[family, parent1] as never[], parent1 as never],
      [[player] as never[], player as never],
      [[coach] as never[], coach as never],
      [[family, adminParent] as never[], adminParent as never],
      [[clubAdmin] as never[], clubAdmin as never],
    ];
    for (const [c, a] of personas)
      for (const id of REMOVED) expect(homeTileIds(c, a) as string[]).not.toContain(id);
  });
});

describe('deriveAttention', () => {
  const item = (
    o: Partial<AttentionItem> & Pick<AttentionItem, 'kind' | 'key'>,
  ): AttentionItem => ({
    label: o.key,
    href: '/',
    ...o,
  });

  it('orders by tier, then oldest due date, then larger count', () => {
    const r = deriveAttention(
      [
        item({ kind: 'setup', key: 's' }),
        item({ kind: 'payment', key: 'p-late', dueAt: '2026-11-10T00:00:00Z', overdue: true }),
        item({ kind: 'payment', key: 'p-soon', dueAt: '2026-11-21T00:00:00Z' }),
        item({ kind: 'rsvp', key: 'r', dueAt: '2026-11-20T00:00:00Z' }),
        item({ kind: 'joinRequests', key: 'j2', count: 2 }),
        item({ kind: 'joinRequests', key: 'j5', count: 5 }),
      ],
      new Date('2026-11-19T12:00:00Z'),
    );
    expect(r.all.map((i) => i.key)).toEqual(['p-late', 'r', 'p-soon', 'j5', 'j2', 's']);
  });

  it('dedupes one chip per action per child', () => {
    const r = deriveAttention([
      item({ kind: 'rsvp', key: 'rsvp:e1:maya' }),
      item({ kind: 'rsvp', key: 'rsvp:e1:maya' }),
      item({ kind: 'rsvp', key: 'rsvp:e1:leo' }),
    ]);
    expect(r.all).toHaveLength(2);
  });

  it('shows 4 rows, the rest go to "+N more"', () => {
    const many = Array.from({ length: 7 }, (_, i) => item({ kind: 'waiver', key: `w${i}` }));
    const r = deriveAttention(many);
    expect(r.shown).toHaveLength(4);
    expect(r.more).toHaveLength(3);
    expect(deriveAttention(many.slice(0, 4)).more).toHaveLength(0);
  });

  it('is empty when nothing is open', () => {
    expect(deriveAttention([]).shown).toEqual([]);
  });

  it('rsvp window is 48 hours', () => {
    const now = new Date('2026-11-18T12:00:00Z');
    expect(withinRsvpWindow('2026-11-20T11:00:00Z', now)).toBe(true);
    expect(withinRsvpWindow('2026-11-21T12:00:00Z', now)).toBe(false);
  });
});

import { buildAttentionItems } from './home-data';

describe('buildAttentionItems', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  it('one RSVP chip per unanswered child within 48h; none for answered or far events', () => {
    const items = buildAttentionItems({
      now,
      nextUp: [
        {
          event_id: 'e1',
          title: 'Game',
          starts_at: '2026-11-19T15:00:00Z',
          children: [
            { player_id: 'p1', first_name: 'Maya', status: null },
            { player_id: 'p2', first_name: 'Leo', status: 'going' },
          ],
        },
        {
          event_id: 'e2',
          title: 'Later',
          starts_at: '2026-12-30T15:00:00Z',
          children: [{ player_id: 'p1', first_name: 'Maya', status: null }],
        },
      ],
    });
    expect(items.map((i) => i.label)).toEqual(['RSVP for Maya']);
    expect(items[0]!.action).toMatchObject({ type: 'rsvp', eventId: 'e1', playerId: 'p1' });
  });

  it('flags overdue payments and ignores ones the person cannot pay', () => {
    const items = buildAttentionItems({
      now,
      payments: [
        {
          request_id: 'a',
          title: 'Jersey',
          amount_cents: 4500,
          due_at: '2026-11-10T00:00:00Z',
          can_pay: true,
        },
        {
          request_id: 'b',
          title: 'Read-only',
          amount_cents: 100,
          due_at: '2026-11-30T00:00:00Z',
          can_pay: false,
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.overdue).toBe(true);
  });

  it('staff counts become single chips with no names', () => {
    const items = buildAttentionItems({ now, pendingJoinRequests: 2, waiversNeedingAction: 3 });
    expect(items.map((i) => i.label).sort()).toEqual(['2 join requests', '3 waivers missing']);
    expect(JSON.stringify(items)).not.toMatch(/@/);
  });
});
