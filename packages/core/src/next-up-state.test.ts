import { describe, expect, it } from 'vitest';

import {
  buildNextUpViews,
  hasUpdate,
  nextUpHeadline,
  nextUpPhase,
  pickNextUp,
  relativeStart,
  type NextUpEvent,
  type NextUpRowLike,
  type ScheduleRowLike,
} from './next-up-state';

const NY = 'America/New_York';
const game = (o: Partial<NextUpEvent> = {}): NextUpEvent => ({
  eventId: 'g1',
  type: 'game',
  title: 'Game vs. Hawks',
  startsAt: '2026-11-21T15:00:00Z', // Sat 10:00 AM EST
  endsAt: '2026-11-21T17:00:00Z',
  timezone: NY,
  status: 'scheduled',
  ...o,
});

describe('nextUpPhase', () => {
  const g = game();
  it('before, live, final', () => {
    expect(nextUpPhase(g, new Date('2026-11-21T14:59:59Z'))).toBe('before');
    expect(nextUpPhase(g, new Date('2026-11-21T15:00:00Z'))).toBe('live');
    expect(nextUpPhase(g, new Date('2026-11-21T17:00:00Z'))).toBe('live');
    expect(nextUpPhase(g, new Date('2026-11-21T17:00:01Z'))).toBe('final');
  });
  it('cancelled wins at any time', () => {
    const c = game({ status: 'cancelled', cancelledReason: 'Field closed' });
    expect(nextUpPhase(c, new Date('2026-11-01T00:00:00Z'))).toBe('cancelled');
    expect(nextUpPhase(c, new Date('2026-11-21T16:00:00Z'))).toBe('cancelled');
  });
});

describe('relativeStart', () => {
  it('minutes, hours, tomorrow, days', () => {
    const start = '2026-11-21T15:00:00Z';
    expect(relativeStart(start, new Date('2026-11-21T14:22:00Z'), NY)).toBe('in 38 min');
    expect(relativeStart(start, new Date('2026-11-21T11:00:00Z'), NY)).toBe('in 4 hr');
    expect(relativeStart(start, new Date('2026-11-20T15:00:00Z'), NY)).toBe('tomorrow');
    expect(relativeStart(start, new Date('2026-11-19T15:00:00Z'), NY)).toBe('in 2 days');
  });
  it('counts calendar days across the spring-forward change', () => {
    // 24 clock hours apart, but Sunday after Saturday: tomorrow.
    expect(relativeStart('2026-03-08T14:00:00Z', new Date('2026-03-07T14:00:00Z'), NY)).toBe(
      'tomorrow',
    );
  });
  it('counts calendar days across the fall-back change', () => {
    // Sat 31 Oct 10 am EDT to Sun 1 Nov 10 am EST is 25 hours: still tomorrow.
    expect(relativeStart('2026-11-01T15:00:00Z', new Date('2026-10-31T14:00:00Z'), NY)).toBe(
      'tomorrow',
    );
  });
});

describe('nextUpHeadline', () => {
  it('before: spoken label has the day and the time in the viewer zone', () => {
    const h = nextUpHeadline(game(), new Date('2026-11-19T15:00:00Z'), NY);
    expect(h).toMatchObject({ phase: 'before', time: '10:00 AM', relative: 'in 2 days' });
    expect(h.spoken).toBe('Game in 2 days, Saturday 10:00 AM');
  });
  it('shows the viewer’s time, not the event zone', () => {
    const h = nextUpHeadline(game(), new Date('2026-11-19T15:00:00Z'), 'America/Los_Angeles');
    expect(h.time).toBe('7:00 AM');
  });
  it('live: Live now', () => {
    const h = nextUpHeadline(game(), new Date('2026-11-21T16:00:00Z'), NY);
    expect(h).toMatchObject({ phase: 'live', relative: 'Live now', spoken: 'Game live now' });
  });
  it('final: score when entered, otherwise needs a result', () => {
    const after = new Date('2026-11-21T18:00:00Z');
    expect(nextUpHeadline(game({ ourScore: 3, theirScore: 2 }), after, NY)).toMatchObject({
      phase: 'final',
      relative: 'Final',
      score: '3–2',
      needsResult: false,
    });
    expect(nextUpHeadline(game(), after, NY)).toMatchObject({ score: null, needsResult: true });
  });
  it('a practice never needs a result', () => {
    expect(
      nextUpHeadline(game({ type: 'practice' }), new Date('2026-11-21T18:00:00Z'), NY).needsResult,
    ).toBe(false);
  });
  it('cancelled has no relative line', () => {
    const h = nextUpHeadline(game({ status: 'cancelled' }), new Date('2026-11-19T15:00:00Z'), NY);
    expect(h).toMatchObject({ phase: 'cancelled', relative: null });
  });
});

describe('pickNextUp', () => {
  const later = game({
    eventId: 'later',
    startsAt: '2026-11-28T15:00:00Z',
    endsAt: '2026-11-28T17:00:00Z',
  });
  it('the soonest upcoming event', () => {
    expect(pickNextUp([later, game()], new Date('2026-11-19T15:00:00Z'))?.eventId).toBe('g1');
  });
  it('a live event beats a later one', () => {
    expect(pickNextUp([later, game()], new Date('2026-11-21T16:00:00Z'))?.eventId).toBe('g1');
  });
  it('a game that just ended holds the card for 6 hours, then the next event takes over', () => {
    expect(pickNextUp([later, game()], new Date('2026-11-21T19:00:00Z'))?.eventId).toBe('g1');
    expect(pickNextUp([later, game()], new Date('2026-11-21T23:30:00Z'))?.eventId).toBe('later');
  });
  it('an ended practice never holds the card', () => {
    expect(
      pickNextUp([game({ type: 'practice' }), later], new Date('2026-11-21T18:00:00Z'))?.eventId,
    ).toBe('later');
  });
  it('a cancelled upcoming event still shows', () => {
    expect(
      pickNextUp([game({ status: 'cancelled' })], new Date('2026-11-19T15:00:00Z'))?.eventId,
    ).toBe('g1');
  });
  it('is null when nothing is scheduled', () => {
    expect(pickNextUp([], new Date())).toBeNull();
  });
});

describe('hasUpdate', () => {
  it('only when the revision moved past the one last seen', () => {
    expect(hasUpdate(3, 2)).toBe(true);
    expect(hasUpdate(2, 2)).toBe(false);
    expect(hasUpdate(3, null)).toBe(false);
  });
});

describe('buildNextUpViews', () => {
  const common = {
    type: 'game',
    title: 'Game',
    timezone: 'America/New_York',
    going: 1,
    not_going: 2,
    maybe: 3,
    no_reply: 4,
    revision: 2,
  };
  const row = (o: Partial<NextUpRowLike> = {}): NextUpRowLike => ({
    ...common,
    event_id: 'n1',
    starts_at: '2026-11-21T15:00:00Z',
    ends_at: '2026-11-21T17:00:00Z',
    children: [{ player_id: 'p1', first_name: 'Maya', status: null }],
    is_staff: false,
    ...o,
  });
  const sched = (o: Partial<ScheduleRowLike> = {}): ScheduleRowLike => ({
    ...common,
    id: 's1',
    status: 'cancelled',
    cancelled_reason: 'Field closed',
    starts_at: '2026-11-20T15:00:00Z',
    ends_at: '2026-11-20T17:00:00Z',
    ...o,
  });

  it('keeps next_up children and adds cancelled events from the schedule', () => {
    const v = buildNextUpViews([row()], [sched()], true);
    expect(v).toHaveLength(2);
    expect(v[0]!.children).toHaveLength(1);
    const c = v.find((x) => x.event.eventId === 's1')!;
    expect(c.event).toMatchObject({ status: 'cancelled', cancelledReason: 'Field closed' });
    expect(c.staff).toBe(true);
  });
  it('lets next_up win for an event both know and adds only the score', () => {
    const v = buildNextUpViews(
      [row()],
      [sched({ id: 'n1', status: 'scheduled', our_score: 3, their_score: 2 })],
      false,
    );
    expect(v).toHaveLength(1);
    expect(v[0]!.event).toMatchObject({ status: 'scheduled', ourScore: 3, theirScore: 2 });
    expect(v[0]!.staff).toBe(false);
  });
  it('picks the cancelled event when it is the soonest', () => {
    const v = buildNextUpViews([row()], [sched()], false);
    const pick = pickNextUp(
      v.map((x) => x.event),
      new Date('2026-11-19T15:00:00Z'),
    );
    expect(pick?.eventId).toBe('s1');
  });
});
