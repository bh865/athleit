import { describe, expect, it } from 'vitest';

import {
  approveQuestion,
  childCard,
  formatFamilyCode,
  joinFamilyProblem,
  loginBadge,
  orderGuardians,
  spellCode,
} from './family';
import { householdJoinCodeSchema, requestToJoinHouseholdSchema } from './schemas/teams';

const today = new Date('2026-06-15T12:00:00Z');

describe('householdJoinCodeSchema', () => {
  it('trims and upper-cases', () => {
    expect(householdJoinCodeSchema.parse('  k7m2qx9rta ')).toBe('K7M2QX9RTA');
  });
  it('rejects the wrong shape with the family message', () => {
    const r = householdJoinCodeSchema.safeParse('short');
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Family codes are 10 letters and numbers');
    expect(householdJoinCodeSchema.safeParse('K7M2-X9RTA').success).toBe(false);
  });
  it('limits the message to 500 characters', () => {
    expect(
      requestToJoinHouseholdSchema.safeParse({ code: 'K7M2QX9RTA', message: 'x'.repeat(501) })
        .success,
    ).toBe(false);
    expect(requestToJoinHouseholdSchema.safeParse({ code: 'K7M2QX9RTA' }).success).toBe(true);
  });
});

describe('orderGuardians', () => {
  it('puts you first, then oldest first', () => {
    const rows = [
      { display_name: 'B', created_at: '2026-02-01', is_you: false },
      { display_name: 'A', created_at: '2026-03-01', is_you: true },
      { display_name: 'C', created_at: '2026-01-01', is_you: false },
    ];
    expect(orderGuardians(rows).map((r) => r.display_name)).toEqual(['A', 'C', 'B']);
  });
});

describe('child cards', () => {
  const base = {
    id: '1',
    first_name: 'Ava',
    last_name: 'Adams',
    profile_id: null,
    team_players: [],
  };
  it('badges by login and age', () => {
    expect(loginBadge({ profile_id: 'p', date_of_birth: '2015-01-01' }, today)).toBe('has-login');
    expect(loginBadge({ profile_id: null, date_of_birth: '2016-01-01' }, today)).toBe(
      'no-login-under-13',
    );
    expect(loginBadge({ profile_id: null, date_of_birth: '2010-01-01' }, today)).toBeNull();
  });
  it('lists distinct team names and flags no team', () => {
    const c = childCard(
      {
        ...base,
        date_of_birth: '2016-01-01',
        team_players: [{ teams: { name: 'U10' } }, { teams: { name: 'U10' } }, { teams: null }],
      },
      today,
    );
    expect(c).toMatchObject({ name: 'Ava Adams', age: 10, teams: ['U10'], notOnTeam: false });
    expect(childCard({ ...base, date_of_birth: '2016-01-01' }, today).notOnTeam).toBe(true);
  });
});

describe('code formatting', () => {
  it('groups for display and spells for screen readers', () => {
    expect(formatFamilyCode('k7m2qx9rta')).toBe('K7M2Q X9RTA');
    expect(spellCode('K7M2Q X9RTA')).toBe('K 7 M 2 Q X 9 R T A');
  });
});

describe('copy helpers', () => {
  it('names the children in the approve question', () => {
    expect(approveQuestion('Sam', ['Ava'])).toBe('Give Sam access to Ava?');
    expect(approveQuestion('Sam', ['Ava', 'Ben', 'Cy'])).toBe(
      'Give Sam access to Ava, Ben and Cy?',
    );
    expect(approveQuestion('Sam', [])).toBe('Give Sam access to your children?');
  });
  it('classifies join failures', () => {
    expect(joinFamilyProblem('invalid_code')).toBe('invalid_code');
    expect(joinFamilyProblem('boom')).toBe('error');
  });
});
