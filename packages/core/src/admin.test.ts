import { describe, expect, it } from 'vitest';

import {
  ADMIN_MODULES, EDIT_WINDOW_MINUTES, canDo, canViewPath, canWriteSetting, editSecondsLeft, formatCountdown,
  isReasonValid, moduleForPath, modulesFor, navGroups, roleAtLeast, toCsv,
} from './admin';

describe('admin module registry', () => {
  it('has the fourteen modules with unique keys and routes', () => {
    expect(ADMIN_MODULES).toHaveLength(14);
    expect(new Set(ADMIN_MODULES.map((m) => m.key)).size).toBe(14);
    expect(new Set(ADMIN_MODULES.map((m) => m.route)).size).toBe(14);
    for (const m of ADMIN_MODULES) expect(m.route.startsWith('/admin')).toBe(true);
  });
  it('shows each role exactly what the "who sees what" matrix says', () => {
    const keys = (r: 'support' | 'admin' | 'owner') => modulesFor(r).map((m) => m.key);
    expect(keys('support')).toEqual(['overview', 'teams', 'clubs', 'people', 'subscriptions', 'reports', 'audit']);
    expect(keys('admin')).not.toContain('admins');
    expect(keys('admin')).toEqual(expect.arrayContaining(['payments', 'connect', 'disputes', 'notifications', 'jobs', 'settings']));
    expect(keys('owner')).toHaveLength(14);
    expect(modulesFor(null)).toEqual([]);
  });
  it('resolves the longest matching route and guards paths by role', () => {
    expect(moduleForPath('/admin')?.key).toBe('overview');
    expect(moduleForPath('/admin/teams/abc')?.key).toBe('teams');
    expect(moduleForPath('/admin/teamsx')).toBeNull();
    expect(canViewPath('support', '/admin/payments')).toBe(false);
    expect(canViewPath('admin', '/admin/payments')).toBe(true);
    expect(canViewPath('admin', '/admin/admins')).toBe(false);
    expect(canViewPath('owner', '/admin/admins/x')).toBe(true);
    expect(canViewPath('owner', '/admin/unknown')).toBe(false);
  });
  it('only lets Overview, search and the queues show on a phone', () => {
    expect(ADMIN_MODULES.filter((m) => m.phone).map((m) => m.key)).toEqual(['overview', 'people', 'subscriptions', 'disputes', 'reports']);
  });
  it('groups the navigation and drops empty groups', () => {
    expect(navGroups('support').map((g) => g.group)).toEqual(['Overview', 'Customers', 'Money', 'Trust and safety', 'Audit']);
    expect(navGroups('owner').map((g) => g.group)).toContain('Admins');
  });
});

describe('admin roles', () => {
  it('orders support < admin < owner', () => {
    expect(roleAtLeast('owner', 'admin')).toBe(true);
    expect(roleAtLeast('support', 'admin')).toBe(false);
    expect(roleAtLeast(null, 'support')).toBe(false);
  });
  it('matches the "who can do what" matrix', () => {
    expect(canDo('support', 'extend_trial')).toBe(false);
    expect(canDo('admin', 'extend_trial')).toBe(true);
    expect(canDo('admin', 'comp_team')).toBe(true);
    expect(canDo('admin', 'toggle_team_billing')).toBe(false);
    expect(canDo('owner', 'toggle_team_billing')).toBe(true);
    expect(canDo('admin', 'change_fee_config')).toBe(false);
    expect(canDo('owner', 'manage_admins')).toBe(true);
    expect(canDo('support', 'reveal_message')).toBe(false);
    expect(canDo('admin', 'reveal_message')).toBe(true);
    expect(canDo('support', 'review_report')).toBe(true);
  });
  it('respects a setting definition write role', () => {
    expect(canWriteSetting('admin', 'owner')).toBe(false);
    expect(canWriteSetting('admin', 'admin')).toBe(true);
    expect(canWriteSetting('owner', 'owner')).toBe(true);
  });
});

describe('reason and edit window', () => {
  it('needs 10 characters after trimming', () => {
    expect(isReasonValid('too short')).toBe(false);
    expect(isReasonValid('   ten chars!! ')).toBe(true);
    expect(isReasonValid('          ')).toBe(false);
  });
  it('counts down from the last TOTP verification', () => {
    const t0 = 1_700_000_000;
    expect(editSecondsLeft(t0, t0 * 1000)).toBe(EDIT_WINDOW_MINUTES * 60);
    expect(editSecondsLeft(t0, (t0 + 60) * 1000)).toBe(EDIT_WINDOW_MINUTES * 60 - 60);
    expect(editSecondsLeft(t0, (t0 + EDIT_WINDOW_MINUTES * 60 + 5) * 1000)).toBe(0);
    expect(editSecondsLeft(null)).toBe(0);
    expect(formatCountdown(125)).toBe('2:05');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});

describe('toCsv', () => {
  const rows = [{ name: 'Riverside, 14U', cents: 1050, note: '=SUM(A1)' }, { name: 'He said "hi"', cents: 0, note: null }];
  const csv = toCsv(rows, [
    { header: 'Team', value: (r) => r.name },
    { header: 'Fees', value: (r) => r.cents, cents: true },
    { header: 'Note', value: (r) => r.note },
  ], '2026-11-20 14:32 UTC');
  it('writes a header row, quotes commas and quotes, and the as-of line', () => {
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('Team,Fees,Note');
    expect(lines[1]).toBe('"Riverside, 14U",$10.50,\'=SUM(A1)');
    expect(lines[2]).toBe('"He said ""hi""",$0.00,');
    expect(lines[3]).toBe('As of 2026-11-20 14:32 UTC');
  });
});
