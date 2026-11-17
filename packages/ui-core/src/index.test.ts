import { describe, expect, it } from 'vitest';

import { avatarSlot, initialsOf } from './index';

describe('ui-core', () => {
  it('builds initials', () => {
    expect(initialsOf('Maya Reyes')).toBe('MR');
    expect(initialsOf('  cher ')).toBe('CH');
    expect(initialsOf('')).toBe('?');
  });
  it('picks a stable avatar slot', () => {
    expect(avatarSlot('abc')).toBe(avatarSlot('abc'));
    expect([1, 2, 3]).toContain(avatarSlot('x'));
  });
});
