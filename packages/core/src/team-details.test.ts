import { describe, expect, it } from 'vitest';

import { capabilitiesFor } from './capabilities';
import {
  agoLabel,
  buildTeamAttention,
  defaultPeopleView,
  firstNamesLine,
  legacyTeamTarget,
  matchesQuery,
  pageOf,
  teamTabCounts,
  teamTabHref,
  visiblePeopleViews,
  visibleTeamTabs,
  waiverPlayers,
} from './team-details';

const caps = (role: 'admin' | 'manager' | 'coach' | 'parent' | 'player') =>
  capabilitiesFor({ kind: 'team', role });

describe('visibleTeamTabs', () => {
  it('gives admins and managers all eight tabs, in order', () => {
    const all = [
      'overview',
      'people',
      'payments',
      'registrations',
      'forms',
      'waivers',
      'documents',
      'settings',
    ];
    expect(visibleTeamTabs(caps('admin'))).toEqual(all);
    expect(visibleTeamTabs(caps('manager'))).toEqual(all);
  });
  it('gives coaches the same tabs; write controls are gated by capability inside them', () => {
    expect(visibleTeamTabs(caps('coach'))).toContain('people');
    expect(caps('coach').has('registration.manage')).toBe(false);
    expect(caps('coach').has('team.edit')).toBe(false);
  });
  it('shows nothing to parents and players (they keep only the Documents shelf)', () => {
    expect(visibleTeamTabs(caps('parent'))).toEqual([]);
    expect(visibleTeamTabs(caps('player'))).toEqual([]);
  });
  it('hides tabs whose capability is missing', () => {
    const c = new Set(caps('coach'));
    c.delete('payments.view');
    c.delete('documents.view');
    expect(visibleTeamTabs(c)).toEqual([
      'overview',
      'people',
      'registrations',
      'forms',
      'waivers',
      'settings',
    ]);
  });
});

describe('people views', () => {
  it('lets coaches see all three segments, admins too', () => {
    expect(visiblePeopleViews(caps('coach'))).toEqual(['members', 'requests', 'invites']);
    expect(visiblePeopleViews(caps('admin'))).toEqual(['members', 'requests', 'invites']);
  });
  it('opens on Requests only when some are pending', () => {
    const v = visiblePeopleViews(caps('admin'));
    expect(defaultPeopleView(3, v)).toBe('requests');
    expect(defaultPeopleView(0, v)).toBe('members');
    expect(defaultPeopleView(3, ['members'])).toBe('members');
  });
});

describe('routes', () => {
  it('builds tab links', () => {
    expect(teamTabHref('t1', 'overview')).toBe('/teams/t1');
    expect(teamTabHref('t1', 'people', 'requests')).toBe('/teams/t1/people?view=requests');
    expect(teamTabHref('t1', 'waivers')).toBe('/teams/t1/waivers');
  });
  it('maps old URLs to their new home', () => {
    expect(legacyTeamTarget(['requests'])).toEqual({
      kind: 'tab',
      tab: 'people',
      view: 'requests',
    });
    expect(legacyTeamTarget(['invites'])).toEqual({ kind: 'tab', tab: 'people', view: 'invites' });
    expect(legacyTeamTarget(['members'])).toEqual({ kind: 'tab', tab: 'people', view: 'members' });
    expect(legacyTeamTarget(['compliance'])).toEqual({ kind: 'tab', tab: 'waivers' });
    expect(legacyTeamTarget(['schedule'])).toEqual({ kind: 'schedule' });
    expect(legacyTeamTarget(['nope'])).toBeNull();
  });
});

describe('pageOf', () => {
  const items = Array.from({ length: 60 }, (_, i) => i);
  it('shows 25 at a time', () => {
    expect(pageOf(items).items).toHaveLength(25);
    expect(pageOf(items).remaining).toBe(35);
    expect(pageOf(items, 50).items).toHaveLength(50);
    expect(pageOf(items, 75).remaining).toBe(0);
  });
});

describe('attention', () => {
  const waivers = [
    { player_id: 'a', first_name: 'Eli', status: 'missing' },
    { player_id: 'a', first_name: 'Eli', status: 'signed' },
    { player_id: 'b', first_name: 'Sofia', status: 'expired' },
    { player_id: 'c', first_name: 'Max', status: 'signed' },
  ];
  it('counts people once, worst status wins', () => {
    const w = waiverPlayers(waivers);
    expect(w).toMatchObject({ signed: 1, missing: 1, expired: 1 });
    expect(w.needing.map((p) => p.first_name)).toEqual(['Eli', 'Sofia']);
  });
  it('formats first names only', () => {
    expect(firstNamesLine(['Priya Shah', 'Tom Alvarez', 'Jordan Lee'])).toBe(
      'Priya, Tom and Jordan',
    );
    expect(firstNamesLine(['A B', 'C D', 'E F', 'G H'])).toBe('A, C, E +1 more');
    expect(firstNamesLine(['Priya Shah'])).toBe('Priya');
    expect(firstNamesLine([])).toBe('');
  });
  it('builds rows in tab order, never with last names, and skips empty sources', () => {
    const rows = buildTeamAttention({
      joinRequests: [
        { requester_name: 'Priya Shah', status: 'pending' },
        { requester_name: 'Old Request', status: 'approved' },
      ],
      waivers,
      registrations: [{ title: 'Spring 2027', toReview: 3 }],
      overduePayments: [{ title: 'Fall dues', unpaid: 1 }],
    });
    expect(rows.map((r) => r.kind)).toEqual([
      'joinRequests',
      'waivers',
      'registrations',
      'payments',
    ]);
    expect(rows[0]).toMatchObject({ tab: 'people', view: 'requests', count: 1, detail: 'Priya' });
    expect(rows.map((r) => r.detail).join(' ')).not.toMatch(/Shah|Okafor/);
    expect(teamTabCounts(rows)).toEqual({ people: 1, waivers: 2, registrations: 3, payments: 1 });
  });
  it('is empty when nothing is pending (the "All caught up" state)', () => {
    expect(
      buildTeamAttention({
        joinRequests: [],
        waivers: [{ player_id: 'a', first_name: 'Eli', status: 'signed' }],
        registrations: [{ title: 'x', toReview: 0 }],
        overduePayments: [{ title: 'y', unpaid: 0 }],
      }),
    ).toEqual([]);
  });
});

describe('formatters', () => {
  it('words relative days', () => {
    const now = Date.parse('2026-11-18T12:00:00Z');
    expect(agoLabel('2026-11-18T01:00:00Z', now)).toBe('today');
    expect(agoLabel('2026-11-17T01:00:00Z', now)).toBe('yesterday');
    expect(agoLabel('2026-11-15T01:00:00Z', now)).toBe('3 days ago');
  });
  it('matches search text across fields, case-insensitively', () => {
    expect(matchesQuery('', 'x')).toBe(true);
    expect(matchesQuery('PRIYA', 'Priya Shah')).toBe(true);
    expect(matchesQuery('zed', 'Priya', null)).toBe(false);
  });
});
