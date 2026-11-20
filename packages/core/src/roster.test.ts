import { describe, expect, it } from 'vitest';

import {
  ageLabel,
  ageSummary,
  birthDateLabel,
  filterRoster,
  jerseyConflict,
  jerseyConflictMessage,
  jerseyLabel,
  jerseySpoken,
  parseJersey,
  playerCountLabel,
  positionOptions,
  rosterCounts,
  sortRoster,
  squadRows,
  type RosterRowLike,
} from './roster';

let n = 0;
const row = (o: Partial<RosterRowLike> & { first_name: string }): RosterRowLike => ({
  team_player_id: `tp${(n += 1)}`,
  player_id: `p${n}`,
  last_name: null,
  jersey_number: null,
  position: null,
  status: 'active',
  ...o,
});

const ava = row({ first_name: 'Ava', last_name: 'Chen', jersey_number: 1, position: 'GK' });
const zara = row({ first_name: 'Zara', last_name: 'Khan', jersey_number: 2, position: 'DEF' });
const noah = row({ first_name: 'Noah', last_name: 'Brooks', jersey_number: 10, position: 'MID' });
const owen = row({ first_name: 'Owen', last_name: 'Patel', jersey_number: null });
const maya = row({
  first_name: 'Maya',
  last_name: 'Hayes',
  jersey_number: 7,
  position: 'FWD',
  status: 'inactive',
});
const all = [owen, noah, maya, zara, ava];

describe('filterRoster', () => {
  it('filters by status', () => {
    expect(filterRoster(all, { status: 'active' })).toHaveLength(4);
    expect(filterRoster(all, { status: 'inactive' })).toEqual([maya]);
    expect(filterRoster(all, { status: 'all' })).toHaveLength(5);
  });
  it('matches names, positions and jersey numbers, case-insensitively', () => {
    expect(filterRoster(all, { query: 'CHEN' })).toEqual([ava]);
    expect(filterRoster(all, { query: 'ava chen' })).toEqual([ava]);
    expect(filterRoster(all, { query: 'mid' })).toEqual([noah]);
    expect(filterRoster(all, { query: '#10' })).toEqual([noah]);
    expect(filterRoster(all, { query: '1' })).toEqual([ava]); // exact number, not "10"
    expect(filterRoster(all, { query: 'quinn' })).toEqual([]);
  });
  it('combines search with the status filter', () => {
    expect(filterRoster(all, { query: 'maya', status: 'active' })).toEqual([]);
  });
  it('searches first names when last names are hidden', () => {
    const limited = row({ first_name: 'Liam', last_name: null });
    expect(filterRoster([limited], { query: 'lia' })).toEqual([limited]);
  });
});

describe('sortRoster', () => {
  it('sorts by jersey with no-number last', () => {
    expect(sortRoster(all, 'jersey').map((r) => r.first_name)).toEqual([
      'Ava',
      'Zara',
      'Maya',
      'Noah',
      'Owen',
    ]);
  });
  it('sorts by name (last, then first)', () => {
    expect(sortRoster(all, 'name').map((r) => r.first_name)).toEqual([
      'Noah',
      'Ava',
      'Maya',
      'Zara',
      'Owen',
    ]);
  });
  it('sorts by position with blanks last, then jersey', () => {
    expect(sortRoster(all, 'position').map((r) => r.position)).toEqual([
      'DEF',
      'FWD',
      'GK',
      'MID',
      null,
    ]);
  });
  it('does not mutate its input', () => {
    const copy = [...all];
    sortRoster(all, 'jersey');
    expect(all).toEqual(copy);
  });
});

describe('rosterCounts', () => {
  it('counts active, inactive and ready to add', () => {
    expect(rosterCounts(all, 3)).toEqual({ active: 4, inactive: 1, ready: 3 });
    expect(rosterCounts([])).toEqual({ active: 0, inactive: 0, ready: 0 });
  });
});

describe('jerseyConflict', () => {
  it('names the active player who has the number', () => {
    const c = jerseyConflict(all, 10);
    expect(c?.name).toBe('Noah');
    expect(jerseyConflictMessage(10, c!)).toBe('#10 is taken by Noah.');
  });
  it('ignores the player being edited', () => {
    expect(jerseyConflict(all, 10, { ignoreTeamPlayerId: noah.team_player_id })).toBeNull();
  });
  it('ignores inactive players', () => {
    expect(jerseyConflict(all, 7)).toBeNull();
  });
  it('does not conflict when the edited player is going inactive', () => {
    expect(jerseyConflict(all, 10, { status: 'inactive' })).toBeNull();
  });
  it('accepts the bounds 0 and 99 and rejects numbers outside them', () => {
    const zero = row({ first_name: 'Zed', jersey_number: 0 });
    const ninetyNine = row({ first_name: 'Max', jersey_number: 99 });
    expect(jerseyConflict([zero, ninetyNine], 0)?.name).toBe('Zed');
    expect(jerseyConflict([zero, ninetyNine], 99)?.name).toBe('Max');
    expect(jerseyConflict([zero, ninetyNine], 100)).toBeNull();
    expect(jerseyConflict([zero, ninetyNine], -1)).toBeNull();
    expect(jerseyConflict([zero, ninetyNine], 1.5)).toBeNull();
  });
  it('has no conflict for no number', () => {
    expect(jerseyConflict(all, null)).toBeNull();
    expect(jerseyConflict(all, undefined)).toBeNull();
  });
});

describe('display strings', () => {
  it('formats jerseys for sight and for screen readers', () => {
    expect(jerseyLabel(7)).toBe('#7');
    expect(jerseyLabel(0)).toBe('#0');
    expect(jerseyLabel(null)).toBe('–');
    expect(jerseySpoken(7)).toBe('number 7');
    expect(jerseySpoken(0)).toBe('number 0');
    expect(jerseySpoken(null)).toBe('no number');
  });
  it('formats ages and birth dates', () => {
    expect(ageLabel(9)).toBe('9 yrs');
    expect(ageLabel(1)).toBe('1 yr');
    expect(ageLabel(null)).toBe('');
    expect(birthDateLabel('2016-03-04')).toBe('Mar 4, 2016');
    expect(ageSummary(9, '2016-03-04')).toBe('9 years old · born Mar 4, 2016');
  });
  it('parses the jersey field', () => {
    expect(parseJersey('')).toBeNull();
    expect(parseJersey(' 12 ')).toBe(12);
  });
  it('words the one-line count', () => {
    expect(playerCountLabel(1)).toBe('1 player');
    expect(playerCountLabel(14)).toBe('14 players');
  });
});

describe('squadRows', () => {
  it('keeps active players in jersey order', () => {
    expect(squadRows(all).map((r) => r.first_name)).toEqual(['Ava', 'Zara', 'Noah', 'Owen']);
  });
});

describe('positionOptions', () => {
  it('returns the sport config positions', () => {
    expect(positionOptions('soccer')).toEqual(['GK', 'DEF', 'MID', 'FWD']);
    expect(positionOptions('basketball')).toEqual(['PG', 'SG', 'SF', 'PF', 'C']);
    expect(positionOptions('hockey')).toEqual(['G', 'D', 'C', 'LW', 'RW']);
  });
  it('is empty without a sport and returns a copy', () => {
    expect(positionOptions(null)).toEqual([]);
    positionOptions('soccer').push('X');
    expect(positionOptions('soccer')).toHaveLength(4);
  });
});
