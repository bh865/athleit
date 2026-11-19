import { describe, expect, it } from 'vitest';

import {
  addRoleActions,
  buildContexts,
  can,
  CLUB_ADMIN_TEAM_VIEW,
  capabilitiesFor,
  friendlyError,
  pickContext,
  switcherPlaces,
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

describe('contexts (places)', () => {
  it('builds one context per place; roles in one team merge', () => {
    const ctx = buildContexts({
      ...src,
      teams: [
        ...src.teams,
        {
          team_id: 't1',
          role: 'parent',
          name: 'U10 Hawks',
          sport: 'soccer',
          season_label: 'Fall 2026',
        },
      ],
    });
    expect(ctx.map((c) => c.key)).toEqual(['family:h1', 'team:t1', 'team:t2', 'club:c1']);
    const t1 = ctx.find((c) => c.key === 'team:t1')!;
    expect(t1.roles).toEqual(['coach', 'parent']);
    expect(t1.subtitle).toBe('Coach · Parent');
    expect(ctx.find((c) => c.key === 'club:c1')?.subtitle).toBe('Admin');
  });

  it('admin + parent of one team is one place with the union of capabilities', () => {
    const [, team] = buildContexts({
      households: [{ id: 'h1', name: 'Blake family' }],
      teams: [
        {
          team_id: 't1',
          role: 'parent',
          name: 'Athleit FC',
          sport: 'soccer',
          season_label: 'Fall 2026',
        },
        {
          team_id: 't1',
          role: 'admin',
          name: 'Athleit FC',
          sport: 'soccer',
          season_label: 'Fall 2026',
        },
      ],
      clubs: [],
    });
    expect(team!.subtitle).toBe('Admin · Parent');
    expect(can(team!, 'members.manage')).toBe(true);
    expect(can(team!, 'schedule.rsvpOwn')).toBe(true);
  });

  it('switcher lists teams and clubs; the household only when it is the only place', () => {
    expect(switcherPlaces(buildContexts(src)).map((c) => c.key)).toEqual([
      'team:t1',
      'team:t2',
      'club:c1',
    ]);
    expect(
      switcherPlaces(buildContexts({ ...src, teams: [], clubs: [] })).map((c) => c.key),
    ).toEqual(['family:h1']);
    expect(switcherPlaces([])).toEqual([]);
  });

  it('restores the last-used place, maps legacy per-role keys, or falls back to a team', () => {
    const ctx = buildContexts(src);
    expect(pickContext(ctx, 'club:c1')?.id).toBe('c1');
    expect(pickContext(ctx, 'club:c1:admin')?.id).toBe('c1'); // legacy key
    expect(pickContext(ctx, 'team:t2:parent')?.id).toBe('t2');
    expect(pickContext(ctx, 'gone')?.key).toBe('team:t1');
    expect(pickContext(buildContexts({ ...src, teams: [], clubs: [] }), null)?.key).toBe(
      'family:h1',
    );
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
  it('only staff (and the linked club admin, read-only) open the team details area', () => {
    for (const r of ['admin', 'coach', 'manager']) expect(can(team(r), 'team.details')).toBe(true);
    for (const r of ['parent', 'player']) {
      expect(can(team(r), 'team.details')).toBe(false);
      expect(can(team(r), 'documents.view')).toBe(true);
    }
    expect(CLUB_ADMIN_TEAM_VIEW.has('team.details')).toBe(true);
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
