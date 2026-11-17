import { describe, expect, it } from 'vitest';

import {
  calendarFeedUrl,
  describeEventTime,
  groupByLocalDay,
  localDateKey,
  localTimeKey,
  monthGrid,
  shiftMonth,
  weekDays,
  zonedTimeToInstant,
} from './schedule-time';

describe('describeEventTime', () => {
  it('shows the event zone, and the viewer zone only when it differs', () => {
    const l = describeEventTime(
      '2026-11-21T15:00:00Z',
      '2026-11-21T16:30:00Z',
      'America/New_York',
      'America/Los_Angeles',
    );
    expect(l.weekdayShort).toBe('SAT');
    expect(l.dayNumber).toBe('21');
    expect(l.dateLabel).toBe('Sat, Nov 21');
    expect(l.startLabel).toBe('10:00 AM');
    expect(l.rangeLabel).toBe('10:00 AM – 11:30 AM');
    expect(l.zoneLabel).toBe('EST');
    expect(l.viewerLocalLabel).toBe('7:00 AM PST');
  });
  it('omits the viewer time when the viewer is in the same zone', () => {
    const l = describeEventTime(
      '2026-11-21T15:00:00Z',
      '2026-11-21T16:00:00Z',
      'America/New_York',
      'America/New_York',
    );
    expect(l.viewerLocalLabel).toBeNull();
  });
  it('names the day when the viewer is on a different calendar day', () => {
    const l = describeEventTime(
      '2026-11-21T03:30:00Z',
      '2026-11-21T05:00:00Z',
      'Asia/Tokyo',
      'America/New_York',
    );
    expect(l.startLabel).toBe('12:30 PM');
    expect(l.viewerLocalLabel).toBe('Fri 10:30 PM EST');
  });
});

describe('DST', () => {
  it('keeps 5:30 PM local across the spring-forward change', () => {
    const before = zonedTimeToInstant('2027-03-09', '17:30', 'America/New_York');
    const after = zonedTimeToInstant('2027-03-16', '17:30', 'America/New_York');
    expect(before.toISOString()).toBe('2027-03-09T22:30:00.000Z');
    expect(after.toISOString()).toBe('2027-03-16T21:30:00.000Z');
    expect(localTimeKey(before, 'America/New_York')).toBe('17:30');
    expect(localTimeKey(after, 'America/New_York')).toBe('17:30');
  });
  it('keeps 5:30 PM local across the fall-back change', () => {
    expect(zonedTimeToInstant('2027-11-02', '17:30', 'America/New_York').toISOString()).toBe(
      '2027-11-02T21:30:00.000Z',
    );
    expect(zonedTimeToInstant('2027-11-09', '17:30', 'America/New_York').toISOString()).toBe(
      '2027-11-09T22:30:00.000Z',
    );
  });
  it('resolves a time in the spring-forward gap to just after it, and a repeated hour to its first occurrence', () => {
    expect(zonedTimeToInstant('2027-03-14', '02:30', 'America/New_York').toISOString()).toBe(
      '2027-03-14T07:30:00.000Z',
    );
    expect(zonedTimeToInstant('2027-11-07', '01:30', 'America/New_York').toISOString()).toBe(
      '2027-11-07T05:30:00.000Z',
    );
  });
  it('handles half-hour zones and the southern hemisphere', () => {
    expect(zonedTimeToInstant('2027-06-01', '09:00', 'Asia/Kolkata').toISOString()).toBe(
      '2027-06-01T03:30:00.000Z',
    );
    expect(zonedTimeToInstant('2027-01-15', '18:00', 'Australia/Sydney').toISOString()).toBe(
      '2027-01-15T07:00:00.000Z',
    );
  });
  it('local date keys follow the event zone, not UTC', () => {
    expect(localDateKey('2027-03-14T03:30:00Z', 'America/New_York')).toBe('2027-03-13');
  });
});

describe('calendar grids', () => {
  it('builds month grids starting on Sunday', () => {
    const g = monthGrid(2026, 11);
    expect(g[0]![0]).toBe('2026-11-01');
    expect(g).toHaveLength(5);
    expect(g.every((r) => r.length === 7)).toBe(true);
    expect(monthGrid(2027, 2)[0]![0]).toBe('2027-01-31');
  });
  it('shifts months across a year boundary and builds weeks', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(weekDays('2026-11-21')[0]).toBe('2026-11-15');
  });
  it('groups events by their own local day', () => {
    const m = groupByLocalDay([
      { starts_at: '2027-03-14T03:30:00Z', timezone: 'America/New_York' },
      { starts_at: '2027-03-14T15:00:00Z', timezone: 'America/New_York' },
    ]);
    expect([...m.keys()]).toEqual(['2027-03-13', '2027-03-14']);
  });
});

describe('calendarFeedUrl', () => {
  it('builds the subscribe URL', () => {
    expect(calendarFeedUrl('https://x.supabase.co/', 'abc')).toBe(
      'https://x.supabase.co/functions/v1/calendar-feed/abc.ics',
    );
  });
});
