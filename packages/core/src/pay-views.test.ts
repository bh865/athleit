import { describe, expect, it } from 'vitest';

import { payViewsFor } from './pay-views';

const ctx = (kind: 'family' | 'team' | 'club', id: string, role: string) =>
  ({ kind, id, role, title: `${kind} ${id}` }) as never;

const family = ctx('family', 'h1', 'guardian');
const parent = ctx('team', 't1', 'parent');
const admin = ctx('team', 't1', 'admin');
const coach = ctx('team', 't1', 'coach');

describe('payViewsFor', () => {
  it('parent-only: payer view, even when the last-used context is the team', () => {
    for (const active of [family, parent]) {
      const v = payViewsFor([family, parent], active);
      expect(v.payer).toBe(true);
      expect(v.staff).toBeNull();
      expect(v.initial).toBe('payer');
    }
  });

  it('staff-only (no household): collection view only', () => {
    const v = payViewsFor([admin], admin);
    expect(v.payer).toBe(false);
    expect(v.staff).toMatchObject({ kind: 'team', id: 't1', canSend: true, isAdmin: true });
    expect(v.initial).toBe('staff');
  });

  it('coach can send but is not an admin', () => {
    const v = payViewsFor([coach], coach);
    expect(v.staff).toMatchObject({ canSend: true, isAdmin: false });
  });

  it('staff plus parent: both views; starts on the one matching the active place', () => {
    const all = [family, admin, parent];
    const inTeam = payViewsFor(all, admin);
    expect(inTeam.payer).toBe(true);
    expect(inTeam.staff?.id).toBe('t1');
    expect(inTeam.initial).toBe('staff');
    expect(payViewsFor(all, family).initial).toBe('payer');
  });

  it('active family place still finds the team the user is staff of', () => {
    expect(payViewsFor([family, coach], family).staff?.id).toBe('t1');
  });

  it('club-only admin sees collection; club manager sees none', () => {
    expect(payViewsFor([ctx('club', 'c1', 'admin')], null).staff?.kind).toBe('club');
    expect(payViewsFor([ctx('club', 'c1', 'manager')], null).staff).toBeNull();
  });

  it('no contexts: nothing', () => {
    expect(payViewsFor([], null)).toEqual({ payer: false, staff: null, initial: 'payer' });
  });
});

import { isTeamStaff, teamForScreen } from './places';

describe('places', () => {
  it('staff is the union of roles in the team, not the first row found', () => {
    expect(isTeamStaff([parent, admin], 't1')).toBe(true);
    expect(isTeamStaff([admin, parent], 't1')).toBe(true);
    expect(isTeamStaff([parent], 't1')).toBe(false);
  });
  it('a parent with the family active still gets their team for Messages', () => {
    expect(teamForScreen([family, parent], family)).toMatchObject({ id: 't1', isStaff: false });
    expect(teamForScreen([family], family)).toBeNull();
  });
});
