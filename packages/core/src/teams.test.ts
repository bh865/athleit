import { describe, expect, it } from 'vitest';

import {
  addChildSchema,
  ageOn,
  canHaveOwnLogin,
  createInviteSchema,
  createTeamSchema,
  requestToJoinSchema,
  SPORTS,
} from './index';

const id = '123e4567-e89b-42d3-a456-426614174000';

describe('phase 1 schemas', () => {
  it('exposes the seven launch sports', () => {
    expect(SPORTS).toHaveLength(7);
    expect(
      createTeamSchema.safeParse({ name: 'Hawks', sport: 'cricket', seasonLabel: 'x' }).success,
    ).toBe(false);
    expect(
      createTeamSchema.safeParse({ name: ' Hawks ', sport: 'soccer', seasonLabel: 'Fall' }).success,
    ).toBe(true);
  });

  it('computes age and the 13+ login rule', () => {
    const today = new Date('2026-06-15T12:00:00Z');
    expect(ageOn('2013-06-15', today)).toBe(13);
    expect(ageOn('2013-06-16', today)).toBe(12);
    expect(canHaveOwnLogin('2013-06-15', today)).toBe(true);
    expect(canHaveOwnLogin('2013-06-16', today)).toBe(false);
  });

  it('rejects future and malformed birth dates', () => {
    const base = { firstName: 'A', lastName: 'B' };
    expect(addChildSchema.safeParse({ ...base, dateOfBirth: '2999-01-01' }).success).toBe(false);
    expect(addChildSchema.safeParse({ ...base, dateOfBirth: '01/02/2015' }).success).toBe(false);
    expect(addChildSchema.safeParse({ ...base, dateOfBirth: '2015-01-02' }).success).toBe(true);
  });

  it('requires exactly one invite target and a role valid for it', () => {
    expect(createInviteSchema.safeParse({ teamId: id, role: 'coach' }).success).toBe(true);
    expect(createInviteSchema.safeParse({ clubId: id, role: 'coach' }).success).toBe(false);
    expect(createInviteSchema.safeParse({ clubId: id, role: 'manager' }).success).toBe(true);
    expect(createInviteSchema.safeParse({ teamId: id, clubId: id, role: 'coach' }).success).toBe(
      false,
    );
    expect(
      createInviteSchema.safeParse({ teamId: id, role: 'coach', expiresInDays: 200 }).success,
    ).toBe(false);
  });

  it('requires exactly one of team code or id to join', () => {
    expect(requestToJoinSchema.safeParse({ teamCode: 'abcde12345' }).success).toBe(true);
    expect(requestToJoinSchema.safeParse({ teamCode: 'abcde12345', teamId: id }).success).toBe(
      false,
    );
    expect(requestToJoinSchema.safeParse({}).success).toBe(false);
  });
});
