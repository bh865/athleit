import { describe, expect, it } from 'vitest';

import {
  NO_FILTERS,
  agendaWindow,
  applyFilters,
  countsBar,
  dayHeading,
  eventStateView,
  filterChips,
  filtersFromParams,
  filtersToParams,
  groupAgenda,
  layoutDayBlocks,
  mergeById,
  needsReply,
  nudgeResultText,
  nudgeState,
  previewRepeat,
  revisionNotice,
  rowState,
  rowTimeLabel,
  rowUpdated,
  rsvpChipLabel,
  shouldShowRevisionNotice,
  showTeamName,
  weekGridHours,
} from './schedule-view';
import type { LastChange, ScheduleItemLike } from './schedule-view';

const NY = 'America/New_York';
const item = (o: Partial<ScheduleItemLike> = {}): ScheduleItemLike => ({
  id: 'e1',
  team_id: 't1',
  type: 'practice',
  title: 'Practice',
  starts_at: '2026-11-21T15:00:00Z', // 10:00 AM EST
  ends_at: '2026-11-21T16:30:00Z',
  timezone: NY,
  status: 'scheduled',
  cancelled_reason: null,
  ...o,
});
const kid = (id: string, name: string, status: 'going' | 'not_going' | 'maybe' | null) => ({
  player_id: id,
  first_name: name,
  status,
});

describe('dayHeading and groupAgenda', () => {
  it('names today, tomorrow and yesterday, else the date', () => {
    expect(dayHeading('2026-11-20', '2026-11-20')).toBe('Today');
    expect(dayHeading('2026-11-21', '2026-11-20')).toBe('Tomorrow');
    expect(dayHeading('2026-11-19', '2026-11-20')).toBe('Yesterday');
    expect(dayHeading('2026-11-24', '2026-11-20')).toBe('Tue, Nov 24');
  });
  it('compares date keys, so the DST fall-back day is still "Tomorrow"', () => {
    // US clocks fall back on 2026-11-01.
    expect(dayHeading('2026-11-01', '2026-10-31')).toBe('Tomorrow');
    expect(dayHeading('2026-11-02', '2026-10-31')).toBe('Mon, Nov 2');
  });
  it('groups by the event-local day, ascending or descending', () => {
    const a = item({ id: 'a', starts_at: '2026-11-21T15:00:00Z' });
    // 11:30 PM EST on the 21st is already the 22nd in UTC: it must stay on the 21st.
    const b = item({ id: 'b', starts_at: '2026-11-22T04:30:00Z', ends_at: '2026-11-22T05:30:00Z' });
    const c = item({ id: 'c', starts_at: '2026-11-23T15:00:00Z', ends_at: '2026-11-23T16:00:00Z' });
    const asc = groupAgenda([c, b, a], '2026-11-21');
    expect(asc.map((d) => [d.dateKey, d.heading, d.items.map((i) => i.id)])).toEqual([
      ['2026-11-21', 'Today', ['a', 'b']],
      ['2026-11-23', 'Mon, Nov 23', ['c']],
    ]);
    expect(groupAgenda([a, b, c], '2026-11-21', 'desc').map((d) => d.dateKey)).toEqual([
      '2026-11-23',
      '2026-11-21',
    ]);
  });
  it('groups an event in another zone by its own day', () => {
    const la = item({ id: 'la', timezone: 'America/Los_Angeles', starts_at: '2026-11-22T03:00:00Z' });
    expect(groupAgenda([la], '2026-11-20')[0]!.dateKey).toBe('2026-11-21');
  });
});

describe('agendaWindow and mergeById', () => {
  it('stays within the 100 day limit for every page', () => {
    for (const dir of ['forward', 'backward'] as const) {
      const w = agendaWindow('2026-11-20', dir, 500);
      expect((Date.parse(w.to) - Date.parse(w.from)) / 86_400_000).toBeLessThanOrEqual(100);
    }
  });
  it('pages forward and backward without a gap', () => {
    expect(agendaWindow('2026-11-20', 'forward', 30).nextKey).toBe('2026-12-20');
    expect(agendaWindow('2026-11-19', 'backward', 30).nextKey).toBe('2026-10-20');
  });
  it('keeps the first copy of an event that spans two pages', () => {
    expect(mergeById([{ id: 'a', n: 1 }], [{ id: 'a', n: 2 }, { id: 'b', n: 3 }])).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 3 },
    ]);
  });
});

describe('filters', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  const maya = kid('p1', 'Maya', null);
  const eli = kid('p2', 'Eli', 'going');
  const rows = [
    item({ id: 'g', type: 'game', team_id: 't1', children: [maya] }),
    item({ id: 'p', type: 'practice', team_id: 't2', children: [eli] }),
    item({ id: 'c', type: 'practice', team_id: 't1', status: 'cancelled', children: [maya] }),
    item({
      id: 'old',
      type: 'practice',
      team_id: 't1',
      starts_at: '2026-11-01T15:00:00Z',
      ends_at: '2026-11-01T16:00:00Z',
      children: [maya],
    }),
  ];
  it('filters by type, team and child, and narrows the child chips', () => {
    expect(applyFilters(rows, { ...NO_FILTERS, types: ['game'] }, now).map((r) => r.id)).toEqual(['g']);
    expect(applyFilters(rows, { ...NO_FILTERS, teamId: 't2' }, now).map((r) => r.id)).toEqual(['p']);
    const kids = applyFilters(
      [item({ id: 'x', children: [maya, eli] })],
      { ...NO_FILTERS, childId: 'p2' },
      now,
    );
    expect(kids[0]!.children).toEqual([eli]);
  });
  it('needs reply means open, scheduled and a child with no answer', () => {
    expect(needsReply(rows[0]!, now)).toBe(true);
    expect(needsReply(rows[1]!, now)).toBe(false); // everyone answered
    expect(needsReply(rows[2]!, now)).toBe(false); // cancelled
    expect(needsReply(rows[3]!, now)).toBe(false); // over
    expect(applyFilters(rows, { ...NO_FILTERS, needsReply: true }, now).map((r) => r.id)).toEqual(['g']);
  });
  it('makes removable chips and round-trips the URL', () => {
    const f = { types: ['game' as const, 'practice' as const], childId: 'p1', teamId: null, needsReply: true };
    const chips = filterChips(f, { child: () => 'Maya' });
    expect(chips.map((c) => c.label)).toEqual(['Needs reply', 'Games', 'Practices', 'Maya']);
    expect(chips[1]!.remove.types).toEqual(['practice']);
    const params = filtersToParams(f);
    expect(filtersFromParams((k) => params[k] ?? null)).toEqual(f);
    expect(filtersFromParams((k) => (k === 'type' ? 'game,bogus,game' : null)).types).toEqual(['game']);
  });
});

describe('rowState priority', () => {
  const now = new Date('2026-11-21T15:30:00Z'); // 10:30 AM EST, inside the practice
  it('live beats needs reply and updated', () => {
    const s = rowState(item({ children: [kid('p', 'Maya', null)], revision: 3, seen_revision: 1 }), now);
    expect(s.emphasis).toBe('live');
    expect(s.needsReply).toBe(true);
    expect(s.updated).toBe(true);
    expect(s.quickActions).toBe(true);
  });
  it('cancelled leads and closes replies', () => {
    const s = rowState(item({ status: 'cancelled', children: [kid('p', 'Maya', null)], revision: 3 }), now);
    expect(s.emphasis).toBe('cancelled');
    expect(s.quickActions).toBe(false);
    expect(s.updated).toBe(false);
  });
  it('needs reply beats updated, and updated leads when answered', () => {
    const before = new Date('2026-11-20T12:00:00Z');
    expect(rowState(item({ children: [kid('p', 'Maya', null)], revision: 2 }), before).emphasis).toBe('needs_reply');
    expect(rowState(item({ children: [kid('p', 'Maya', 'going')], revision: 2 }), before).emphasis).toBe('updated');
    expect(
      rowState(item({ children: [kid('p', 'Maya', 'going')], revision: 2, seen_revision: 2 }), before).emphasis,
    ).toBeNull();
  });
  it('series and final are flags, never the emphasis', () => {
    const after = new Date('2026-11-21T20:00:00Z');
    const s = rowState(item({ type: 'game', series_id: 's1', result: { our: 3, their: 2, outcome: 'win' } }), after);
    expect(s.series).toBe(true);
    expect(s.final).toBe(true);
    expect(s.emphasis).toBeNull();
    expect(s.quickActions).toBe(false);
  });
  it('rowUpdated needs a second revision the viewer has not seen', () => {
    expect(rowUpdated(1, null)).toBe(false);
    expect(rowUpdated(2, null)).toBe(true);
    expect(rowUpdated(2, 2)).toBe(false);
    expect(rowUpdated(null, null)).toBe(false);
  });
  it('labels chips the way they are announced', () => {
    expect(rsvpChipLabel('Maya', 'going')).toBe('Maya: Going');
    expect(rsvpChipLabel('Eli', null)).toBe('Eli: No reply');
    expect(rsvpChipLabel('Eli', 'not_going')).toBe('Eli: Can’t go');
  });
  it('shows team names only for more than one team', () => {
    expect(showTeamName([{ team_id: 'a' }, { team_id: 'a' }])).toBe(false);
    expect(showTeamName([{ team_id: 'a' }, { team_id: 'b' }])).toBe(true);
  });
});

describe('countsBar', () => {
  it('includes Maybe and proportions of the whole roster', () => {
    const bar = countsBar({ going: 5, not_going: 1, maybe: 2, no_reply: 2 });
    expect(bar.total).toBe(10);
    expect(bar.segments.map((s) => [s.key, s.percent])).toEqual([
      ['going', 50],
      ['not_going', 10],
      ['maybe', 20],
      ['no_reply', 20],
    ]);
    expect(bar.spoken).toBe('5 going, 1 can’t go, 2 maybe, 2 no reply');
  });
  it('drops empty segments and survives an empty roster', () => {
    expect(countsBar({ going: 3, not_going: 0, maybe: 0, no_reply: 0 }).segments).toHaveLength(1);
    expect(countsBar({ going: 0, not_going: 0, maybe: 0, no_reply: 0 })).toMatchObject({ total: 0, segments: [] });
  });
});

describe('eventStateView (Home state machine reused)', () => {
  const g = {
    id: 'g',
    type: 'game',
    title: 'Falcons vs. Hawks',
    starts_at: '2026-11-21T15:00:00Z',
    ends_at: '2026-11-21T17:00:00Z',
    timezone: NY,
    status: 'scheduled',
  };
  it('counts down, goes live, then ends', () => {
    expect(eventStateView(g, new Date('2026-11-19T15:00:00Z'), NY)).toMatchObject({
      label: 'in 2 days',
      tone: 'neutral',
    });
    expect(eventStateView(g, new Date('2026-11-21T14:22:00Z'), NY).label).toBe('in 38 min');
    expect(eventStateView(g, new Date('2026-11-21T16:00:00Z'), NY)).toMatchObject({ label: 'Live now', tone: 'now' });
    const after = new Date('2026-11-21T18:00:00Z');
    expect(eventStateView(g, after, NY)).toMatchObject({ label: 'Ended', needsResult: true });
    expect(eventStateView({ ...g, our_score: 3, their_score: 2, outcome: 'win' }, after, NY).label).toBe(
      'Final W 3–2',
    );
    expect(eventStateView({ ...g, status: 'cancelled' }, after, NY).label).toBe('Cancelled');
  });
  it('ends a practice without asking for a result', () => {
    const p = { ...g, type: 'practice' };
    expect(eventStateView(p, new Date('2026-11-21T18:00:00Z'), NY)).toMatchObject({
      label: 'Ended',
      needsResult: false,
    });
  });
});

describe('week grid layout', () => {
  const opts = { zone: NY, startHour: 8, endHour: 20 };
  const ev = (id: string, s: string, e: string) => ({ id, starts_at: s, ends_at: e });
  it('positions by start and end in the zone', () => {
    const [b] = layoutDayBlocks([ev('a', '2026-11-21T15:00:00Z', '2026-11-21T16:30:00Z')], '2026-11-21', opts);
    expect(b).toMatchObject({ top: 120, height: 90, column: 0, columns: 1 });
  });
  it('splits overlapping events into columns and lets later ones reuse a free column', () => {
    const a = ev('a', '2026-11-21T15:00:00Z', '2026-11-21T17:00:00Z'); // 10-12
    const b = ev('b', '2026-11-21T16:00:00Z', '2026-11-21T17:30:00Z'); // 11-12:30
    const c = ev('c', '2026-11-21T17:00:00Z', '2026-11-21T18:00:00Z'); // 12-13: overlaps b, not a
    const d = ev('d', '2026-11-21T20:00:00Z', '2026-11-21T21:00:00Z'); // 3pm alone
    const out = layoutDayBlocks([d, c, b, a], '2026-11-21', opts);
    const by = Object.fromEntries(out.map((x) => [x.item.id, [x.column, x.columns]]));
    expect(by).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
    expect(out.map((x) => x.item.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('gives short events a readable height and clips to the visible hours', () => {
    const [short] = layoutDayBlocks([ev('s', '2026-11-21T15:00:00Z', '2026-11-21T15:05:00Z')], '2026-11-21', opts);
    expect(short!.height).toBe(30);
    const [late] = layoutDayBlocks([ev('l', '2026-11-22T00:30:00Z', '2026-11-22T02:00:00Z')], '2026-11-21', opts); // 7:30-9pm
    expect(late).toMatchObject({ top: 690, height: 30 }); // clipped at 8pm
  });
  it('places events on the right local day on the DST fall-back date', () => {
    const d = ev('d', '2026-11-01T14:00:00Z', '2026-11-01T15:00:00Z'); // 9:00 AM EST
    expect(layoutDayBlocks([d], '2026-11-01', opts)[0]).toMatchObject({ top: 60, height: 60 });
    expect(layoutDayBlocks([d], '2026-11-02', opts)).toEqual([]);
  });
  it('widens the hour range to fit', () => {
    expect(weekGridHours([ev('a', '2026-11-21T15:00:00Z', '2026-11-21T16:00:00Z')], NY)).toEqual([7, 21]);
    expect(weekGridHours([ev('a', '2026-11-21T11:00:00Z', '2026-11-22T03:30:00Z')], NY)).toEqual([6, 23]);
  });
});

describe('revision notice', () => {
  const change: LastChange = {
    kind: 'time',
    prev_starts_at: '2026-11-21T14:00:00Z', // 9:00 AM EST
    prev_ends_at: '2026-11-21T15:30:00Z',
    prev_place: 'Field 3',
    revision: 2,
  };
  const cur = { revision: 2, starts_at: '2026-11-21T15:00:00Z', timezone: NY, place: 'Field 3' };
  it('says what moved', () => {
    expect(revisionNotice(change, cur)).toBe('Time moved from 9:00 AM to 10:00 AM');
    expect(revisionNotice({ ...change, kind: 'place' }, { ...cur, place: 'Field 5' })).toBe(
      'Place changed from Field 3 to Field 5',
    );
    expect(revisionNotice({ ...change, kind: 'both' }, { ...cur, place: 'Field 5' })).toBe(
      'Time moved from 9:00 AM to 10:00 AM. Place changed from Field 3 to Field 5',
    );
  });
  it('adds the date when the day changed', () => {
    expect(revisionNotice(change, { ...cur, starts_at: '2026-11-22T15:00:00Z' })).toBe(
      'Time moved from Sat, Nov 21 at 9:00 AM to Sun, Nov 22 at 10:00 AM',
    );
  });
  it('falls back when nothing is recorded or it is from an earlier revision', () => {
    expect(revisionNotice(null, cur)).toBe('The time or place changed');
    expect(revisionNotice(change, { ...cur, revision: 3 })).toBe('The time or place changed');
  });
  it('shows only while news: changed, unseen, and not started', () => {
    const base = { revision: 2, seen_revision: null, starts_at: '2026-11-21T15:00:00Z' };
    const before = new Date('2026-11-20T12:00:00Z');
    expect(shouldShowRevisionNotice(base, before)).toBe(true);
    expect(shouldShowRevisionNotice({ ...base, seen_revision: 2 }, before)).toBe(false);
    expect(shouldShowRevisionNotice({ ...base, revision: 1 }, before)).toBe(false);
    expect(shouldShowRevisionNotice(base, new Date('2026-11-21T15:00:01Z'))).toBe(false);
  });
});

describe('previewRepeat', () => {
  it('matches the create_event expansion and writes the sentence', () => {
    const p = previewRepeat({ startDate: '2026-11-17', weekdays: [2, 4], count: 4, type: 'practice' });
    expect(p.dates).toEqual(['2026-11-17', '2026-11-19', '2026-11-24', '2026-11-26']);
    expect(p.line).toBe('Creates 4 practices, Nov 17 to Nov 26');
    expect(p.error).toBeNull();
  });
  it('skips days before the start and honours the interval', () => {
    const p = previewRepeat({ startDate: '2026-11-19', weekdays: [2, 4], intervalWeeks: 2, count: 3, type: 'game' });
    expect(p.dates).toEqual(['2026-11-19', '2026-12-01', '2026-12-03']);
    expect(p.line).toBe('Creates 3 games, Nov 19 to Dec 3');
  });
  it('stops at the until date, inclusive', () => {
    const p = previewRepeat({ startDate: '2026-11-17', weekdays: [2], until: '2026-12-01', type: 'practice' });
    expect(p.dates).toEqual(['2026-11-17', '2026-11-24', '2026-12-01']);
  });
  it('is calendar based, so a DST change never moves a date', () => {
    const p = previewRepeat({ startDate: '2026-10-27', weekdays: [2], count: 4, type: 'practice' });
    expect(p.dates).toEqual(['2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17']);
  });
  it('uses the singular noun for one', () => {
    expect(previewRepeat({ startDate: '2026-11-17', weekdays: [2], count: 1, type: 'event' }).line).toBe(
      'Creates 1 event, Nov 17 to Nov 17',
    );
  });
  it('enforces the caps before saving', () => {
    const count = previewRepeat({ startDate: '2026-11-17', weekdays: [2], count: 53, type: 'practice' });
    expect(count).toMatchObject({ cap: 'occurrences', line: null });
    expect(count.error).toMatch(/at most 52/);
    const days = previewRepeat({ startDate: '2026-01-01', weekdays: [2], until: '2027-01-03', type: 'practice' });
    expect(days).toMatchObject({ cap: 'days' });
    const ok = previewRepeat({ startDate: '2026-01-05', weekdays: [1], until: '2026-12-28', type: 'practice' });
    expect(ok).toMatchObject({ cap: null, count: 52 });
    const many = previewRepeat({
      startDate: '2026-01-05',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      until: '2026-12-31',
      type: 'practice',
    });
    expect(many).toMatchObject({ cap: 'occurrences' });
    expect(many.error).toMatch(/more than 52/);
  });
  it('explains incomplete rules', () => {
    const base = { startDate: '2026-11-17', type: 'practice' as const };
    expect(previewRepeat({ ...base, weekdays: [], count: 3 }).error).toMatch(/weekday/);
    expect(previewRepeat({ ...base, weekdays: [2] }).error).toMatch(/how the series ends/);
    expect(previewRepeat({ ...base, weekdays: [2], count: 2, until: '2026-12-01' }).error).toMatch(/how the series ends/);
    expect(previewRepeat({ ...base, weekdays: [2], until: '2026-11-01' }).error).toMatch(/before/);
    expect(previewRepeat({ ...base, weekdays: [2], intervalWeeks: 5, count: 2 }).error).toMatch(/1 to 4/);
  });
});

describe('nudge', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  const open = { status: 'scheduled' as const, ends_at: '2026-11-21T16:00:00Z', no_reply: 5 };
  it('confirms with the number of families', () => {
    expect(nudgeState(open, now)).toEqual({ canNudge: true, confirm: 'Remind 5 families who haven’t replied?' });
    expect(nudgeState({ ...open, no_reply: 1 }, now)).toMatchObject({
      confirm: 'Remind 1 family who haven’t replied?',
    });
  });
  it('explains why it is disabled', () => {
    expect(nudgeState({ ...open, status: 'cancelled' }, now)).toEqual({
      canNudge: false,
      reason: 'This event was cancelled.',
    });
    expect(nudgeState({ ...open, ends_at: '2026-11-19T00:00:00Z' }, now)).toEqual({
      canNudge: false,
      reason: 'This event is over.',
    });
    expect(nudgeState({ ...open, no_reply: 0 }, now)).toEqual({ canNudge: false, reason: 'Everyone has replied.' });
  });
  it('words the toast', () => {
    expect(nudgeResultText(5)).toBe('Reminded 5 families');
    expect(nudgeResultText(1)).toBe('Reminded 1 family');
    expect(nudgeResultText(0)).toBe('Nobody to remind');
  });
});

describe('rowTimeLabel', () => {
  it('shows the viewer line only when the clock differs', () => {
    const e = item();
    expect(rowTimeLabel(e, NY)).toMatchObject({ range: '10:00 AM – 11:30 AM', yourTime: null, zone: 'EST' });
    expect(rowTimeLabel(e, 'America/Los_Angeles').yourTime).toBe('7:00 AM PST');
  });
});
