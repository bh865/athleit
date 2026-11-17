import { describe, expect, it } from 'vitest';

import {
  addRoleActions,
  buildContexts,
  can,
  capabilitiesFor,
  friendlyError,
  pickContext,
  type ContextSource,
} from './index';

const src: ContextSource = {
  households: [{ id: 'h1', name: 'Pat family' }],
  teams: [
    { team_id: 't1', role: 'coach', name: 'U10 Hawks', sport: 'soccer', season_label: 'Fall 2026' },
    { team_id: 't2', role: 'parent', name: 'U12 Owls', sport: 'hockey', season_label: 'Winter' },
  ],
  clubs: [{ club_id: 'c1', role: 'admin', name: 'Riverside' }],
};

describe('contexts', () => {
  it('builds one context per role and place, family first', () => {
    const ctx = buildContexts(src);
    expect(ctx.map((c) => c.key)).toEqual([
      'family:h1',
      'team:t1:coach',
      'team:t2:parent',
      'club:c1:admin',
    ]);
    expect(ctx[1]?.subtitle).toBe('Coach, Fall 2026');
    expect(ctx[3]?.subtitle).toBe('Admin, club');
  });

  it('restores the last-used context or falls back', () => {
    const ctx = buildContexts(src);
    expect(pickContext(ctx, 'club:c1:admin')?.id).toBe('c1');
    expect(pickContext(ctx, 'gone')?.key).toBe('family:h1');
    expect(pickContext([], 'x')).toBeNull();
  });

  it('offers "Add a family" only to users without one', () => {
    expect(addRoleActions(buildContexts({ ...src, households: [] }))).toContain('add-family');
    expect(addRoleActions(buildContexts(src))).not.toContain('add-family');
    expect(addRoleActions([])).toEqual(['add-family', 'create-team', 'create-club', 'join-team']);
  });
});

describe('capabilities (docs/permissions.md)', () => {
  const team = (role: string) => ({ kind: 'team' as const, role: role as never });
  it('staff read the full roster and contacts; parents and players do not', () => {
    for (const r of ['admin', 'coach', 'manager']) {
      expect(can(team(r), 'roster.viewFull')).toBe(true);
      expect(can(team(r), 'contacts.view')).toBe(true);
    }
    for (const r of ['parent', 'player']) {
      expect(can(team(r), 'roster.viewFull')).toBe(false);
      expect(can(team(r), 'contacts.view')).toBe(false);
      expect(can(team(r), 'roster.viewLimited')).toBe(true);
    }
  });
  it('only team admins manage members, staff invites and club affiliation', () => {
    expect(can(team('admin'), 'members.manage')).toBe(true);
    expect(can(team('admin'), 'invites.createStaff')).toBe(true);
    expect(can(team('coach'), 'members.manage')).toBe(false);
    expect(can(team('coach'), 'invites.createStaff')).toBe(false);
    expect(can(team('coach'), 'invites.createFamily')).toBe(true);
    expect(can(team('coach'), 'team.requestClubLink')).toBe(false);
  });
  it('club admins read and approve but cannot edit teams or rosters', () => {
    const club = { kind: 'club' as const, role: 'admin' as const };
    expect(can(club, 'club.decideLink')).toBe(true);
    expect(can(club, 'roster.edit')).toBe(false);
    expect(can(club, 'team.edit')).toBe(false);
    expect(capabilitiesFor({ kind: 'club', role: 'manager' }).has('club.decideLink')).toBe(false);
  });
  it('guardians manage the family; nobody else does', () => {
    expect(can({ kind: 'family', role: 'guardian' }, 'family.manage')).toBe(true);
    expect(can(team('admin'), 'family.manage')).toBe(false);
    expect(can(null, 'team.view')).toBe(false);
  });
});

describe('friendlyError', () => {
  it('maps database errors to plain sentences', () => {
    expect(friendlyError({ message: 'last_admin' })).toMatch(/at least one admin/);
    expect(friendlyError({ message: 'invite_expired' })).toMatch(/expired/);
    expect(
      friendlyError({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "team_players_active_jersey_unique"',
      }),
    ).toMatch(/jersey/);
    expect(friendlyError({ code: '42501', message: 'permission denied' })).toMatch(/permission/);
    expect(friendlyError(null)).toMatch(/Something went wrong/);
  });
});
