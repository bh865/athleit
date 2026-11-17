import { describe, expect, it } from 'vitest';

import { friendlyError } from './errors';
import { SPORT_CONFIG_DEFAULTS, effectivePeriodCount, validateGameResult } from './scheduling';
import {
  cancelEventSchema,
  createEventSchema,
  isValidTimeZone,
  recordGameResultSchema,
  recurrenceSchema,
  setRsvpSchema,
  updateEventPatchSchema,
} from './schemas/scheduling';

const id = '11111111-1111-4111-8111-111111111111';
const base = {
  team_id: id,
  type: 'practice' as const,
  title: ' Practice ',
  starts_at: '2027-03-02T17:30:00-05:00',
  ends_at: '2027-03-02T19:00:00-05:00',
  timezone: 'America/New_York',
};

describe('createEventSchema', () => {
  it('accepts a practice and trims the title', () => {
    expect(createEventSchema.parse(base).title).toBe('Practice');
  });
  it('rejects an end before the start, a bad timezone, and opponent on a practice', () => {
    expect(createEventSchema.safeParse({ ...base, ends_at: base.starts_at }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, opponent_id: id }).success).toBe(false);
  });
  it('accepts an opponent on a game and rejects both a saved and a typed location', () => {
    expect(
      createEventSchema.safeParse({ ...base, type: 'game', opponent_id: id, home_away: 'home' })
        .success,
    ).toBe(true);
    expect(
      createEventSchema.safeParse({ ...base, location_id: id, location_text: 'x' }).success,
    ).toBe(false);
  });
});

describe('recurrenceSchema', () => {
  it('needs exactly one end rule and valid ISO weekdays', () => {
    expect(recurrenceSchema.safeParse({ weekdays: [2, 4], count: 10 }).success).toBe(true);
    expect(recurrenceSchema.safeParse({ weekdays: [2], until: '2027-06-01' }).success).toBe(true);
    expect(recurrenceSchema.safeParse({ weekdays: [2] }).success).toBe(false);
    expect(
      recurrenceSchema.safeParse({ weekdays: [2], count: 3, until: '2027-06-01' }).success,
    ).toBe(false);
    expect(recurrenceSchema.safeParse({ weekdays: [0], count: 3 }).success).toBe(false);
    expect(recurrenceSchema.safeParse({ weekdays: [2, 2], count: 3 }).success).toBe(false);
  });
  it('enforces the 52-occurrence cap and the interval limit', () => {
    expect(recurrenceSchema.safeParse({ weekdays: [1], count: 52 }).success).toBe(true);
    expect(recurrenceSchema.safeParse({ weekdays: [1], count: 53 }).success).toBe(false);
    expect(recurrenceSchema.safeParse({ weekdays: [1], count: 3, interval: 5 }).success).toBe(
      false,
    );
  });
});

describe('other schemas', () => {
  it('patches must be non-empty and use known keys', () => {
    expect(updateEventPatchSchema.safeParse({}).success).toBe(false);
    expect(updateEventPatchSchema.safeParse({ team_id: id }).success).toBe(false);
    expect(
      updateEventPatchSchema.safeParse({ local_start_time: '18:00', notes: null }).success,
    ).toBe(true);
    expect(updateEventPatchSchema.safeParse({ local_start_time: '25:00' }).success).toBe(false);
  });
  it('cancellation needs a reason; RSVPs need a known status', () => {
    expect(cancelEventSchema.safeParse({ event_id: id, reason: '  ' }).success).toBe(false);
    expect(cancelEventSchema.parse({ event_id: id, reason: 'Rain' }).scope).toBe('this');
    expect(
      setRsvpSchema.safeParse({ event_id: id, player_id: id, status: 'attending' }).success,
    ).toBe(false);
    expect(
      setRsvpSchema.safeParse({ event_id: id, player_id: id, status: 'not_going' }).success,
    ).toBe(true);
  });
  it('results reject negative scores', () => {
    expect(
      recordGameResultSchema.safeParse({ event_id: id, our_score: -1, their_score: 0 }).success,
    ).toBe(false);
  });
  it('knows valid IANA zones', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Nope/Zone')).toBe(false);
  });
});

describe('validateGameResult (mirrors the database)', () => {
  const soccer = SPORT_CONFIG_DEFAULTS.soccer;
  const basketball = SPORT_CONFIG_DEFAULTS.basketball;
  const volleyball = SPORT_CONFIG_DEFAULTS.volleyball;
  it('rejects ties only where the sport disallows them', () => {
    expect(validateGameResult(soccer, { our_score: 1, their_score: 1 })).toBeNull();
    expect(validateGameResult(basketball, { our_score: 50, their_score: 50 })).toMatch(/tie/);
  });
  it('checks period totals', () => {
    expect(
      validateGameResult(soccer, {
        our_score: 3,
        their_score: 2,
        period_scores: [
          { us: 1, them: 0 },
          { us: 2, them: 2 },
        ],
      }),
    ).toBeNull();
    expect(
      validateGameResult(soccer, {
        our_score: 3,
        their_score: 2,
        period_scores: [{ us: 1, them: 0 }],
      }),
    ).toMatch(/add up/);
  });
  it('treats volleyball scores as sets won and needs a winner per set', () => {
    expect(
      validateGameResult(volleyball, {
        our_score: 2,
        their_score: 1,
        period_scores: [
          { us: 25, them: 20 },
          { us: 20, them: 25 },
          { us: 15, them: 12 },
        ],
      }),
    ).toBeNull();
    expect(
      validateGameResult(volleyball, {
        our_score: 1,
        their_score: 0,
        period_scores: [{ us: 25, them: 25 }],
      }),
    ).toMatch(/winner/);
    expect(
      validateGameResult(volleyball, {
        our_score: 3,
        their_score: 1,
        period_scores: [
          { us: 25, them: 20 },
          { us: 20, them: 25 },
          { us: 25, them: 20 },
          { us: 20, them: 25 },
        ],
      }),
    ).toMatch(/1 and 3/);
  });
  it('honours a per-game period override', () => {
    expect(effectivePeriodCount(soccer, { period_count: 4 })).toBe(4);
    expect(effectivePeriodCount(soccer, null)).toBe(2);
  });
});

describe('friendlyError for scheduling', () => {
  it('translates scheduling errors', () => {
    expect(friendlyError({ message: 'event_has_rsvps' })).toMatch(/Cancel it/);
    expect(friendlyError({ message: 'ties_not_allowed' })).toMatch(/ties/);
    expect(friendlyError({ message: 'series_cap_exceeded' })).toMatch(/52/);
  });
});
