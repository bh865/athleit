import { describe, expect, it } from 'vitest';

import {
  buildCalendar,
  escapeText,
  foldLine,
  type FeedEvent,
} from '../../../supabase/functions/_shared/ics';

// A small RFC 5545 reader: unfold, split into components and properties, unescape TEXT.
interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}
interface Comp {
  type: string;
  props: Prop[];
  children: Comp[];
}
function parse(ics: string): Comp {
  expect(ics.endsWith('\r\n')).toBe(true);
  expect(ics.includes('\n') && !ics.replace(/\r\n/g, '').includes('\n')).toBe(true); // CRLF only
  const unfolded = ics.replace(/\r\n[ \t]/g, '');
  const stack: Comp[] = [{ type: 'ROOT', props: [], children: [] }];
  for (const line of unfolded.split('\r\n').filter(Boolean)) {
    const colon = line.indexOf(':');
    const [name, ...ps] = line.slice(0, colon).split(';');
    const value = line.slice(colon + 1);
    if (name === 'BEGIN') {
      const c: Comp = { type: value, props: [], children: [] };
      stack.at(-1)!.children.push(c);
      stack.push(c);
    } else if (name === 'END') {
      expect(stack.at(-1)!.type).toBe(value);
      stack.pop();
    } else {
      const params: Record<string, string> = {};
      for (const p of ps) {
        const [k, v] = p.split('=');
        params[k!] = v!;
      }
      stack.at(-1)!.props.push({ name: name!, params, value });
    }
  }
  expect(stack).toHaveLength(1);
  return stack[0]!.children[0]!;
}
const unescape = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const prop = (c: Comp, n: string) => c.props.find((p) => p.name === n);
const events = (cal: Comp) => cal.children.filter((c) => c.type === 'VEVENT');

const ev = (
  over: Partial<FeedEvent> & { id: string; starts_at: string; ends_at: string },
): FeedEvent => ({
  team_name: 'Falcons U12',
  type: 'practice',
  title: 'Practice',
  timezone: 'America/New_York',
  location_name: null,
  location_address: null,
  location_text: null,
  opponent_name: null,
  home_away: null,
  notes: null,
  arrive_early_minutes: null,
  status: 'scheduled',
  cancelled_reason: null,
  revision: 1,
  updated_at: '2027-01-05T12:00:00Z',
  ...over,
});

describe('text escaping and folding', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeText(String.raw`a,b;c\d`+'\n'+'e')).toBe(String.raw`a\,b\;c\\d`+'\\n'+'e');
  });
  it('folds at 75 octets without splitting a multi-byte character, and unfolds to the original', () => {
    const long = 'SUMMARY:' + 'Équipe ⚽ '.repeat(30);
    const lines = foldLine(long);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(lines.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(long);
  });
});

describe('buildCalendar', () => {
  const series = [
    ev({ id: 'e1', starts_at: '2027-03-09T22:30:00Z', ends_at: '2027-03-10T00:00:00Z' }),
    ev({
      id: 'e2',
      starts_at: '2027-03-16T21:30:00Z',
      ends_at: '2027-03-16T23:00:00Z',
      revision: 3,
    }),
    ev({ id: 'e3', starts_at: '2027-11-02T21:30:00Z', ends_at: '2027-11-02T23:00:00Z' }),
    ev({ id: 'e4', starts_at: '2027-11-09T22:30:00Z', ends_at: '2027-11-10T00:00:00Z' }),
  ];
  const cal = parse(buildCalendar(series, { appUrl: 'https://app.example.test/' }));

  it('is a well-formed VCALENDAR 2.0 with the headers clients need', () => {
    expect(cal.type).toBe('VCALENDAR');
    expect(prop(cal, 'VERSION')?.value).toBe('2.0');
    expect(prop(cal, 'PRODID')?.value).toMatch(/^-\/\/Athleit/);
    expect(prop(cal, 'REFRESH-INTERVAL')?.value).toBe('PT1H');
    expect(events(cal)).toHaveLength(4);
  });

  it('every VEVENT has the required properties, a stable unique UID and a link back', () => {
    const uids = events(cal).map((e) => prop(e, 'UID')!.value);
    expect(new Set(uids).size).toBe(4);
    expect(uids[0]).toBe('event-e1@athleit');
    for (const e of events(cal)) {
      for (const n of ['UID', 'DTSTAMP', 'DTSTART', 'DTEND', 'SUMMARY', 'SEQUENCE', 'STATUS'])
        expect(prop(e, n)).toBeDefined();
      expect(prop(e, 'DTSTAMP')!.value).toBe('20270105T120000Z');
    }
    expect(prop(events(cal)[0]!, 'URL')?.value).toBe('https://app.example.test/events/e1');
  });

  it('is deterministic: the same input gives byte-identical output (stable UID and DTSTAMP)', () => {
    expect(buildCalendar(series)).toBe(buildCalendar(series));
  });

  it('keeps 5:30 PM local across both DST changes via TZID', () => {
    const starts = events(cal).map((e) => prop(e, 'DTSTART')!);
    expect(starts.map((s) => s.params.TZID)).toEqual(Array(4).fill('America/New_York'));
    expect(starts.map((s) => s.value)).toEqual([
      '20270309T173000',
      '20270316T173000',
      '20271102T173000',
      '20271109T173000',
    ]);
  });

  it('includes a VTIMEZONE with the real transitions', () => {
    const tz = cal.children.find((c) => c.type === 'VTIMEZONE')!;
    expect(prop(tz, 'TZID')?.value).toBe('America/New_York');
    const obs = tz.children.map((o) => ({
      kind: o.type,
      start: prop(o, 'DTSTART')!.value,
      from: prop(o, 'TZOFFSETFROM')!.value,
      to: prop(o, 'TZOFFSETTO')!.value,
    }));
    expect(obs).toContainEqual({
      kind: 'DAYLIGHT',
      start: '20270314T020000',
      from: '-0500',
      to: '-0400',
    });
    expect(obs).toContainEqual({
      kind: 'STANDARD',
      start: '20271107T020000',
      from: '-0400',
      to: '-0500',
    });
  });

  it('SEQUENCE follows the revision (revision 1 is sequence 0)', () => {
    expect(events(cal).map((e) => prop(e, 'SEQUENCE')!.value)).toEqual(['0', '2', '0', '0']);
  });

  it('marks cancelled events STATUS:CANCELLED and keeps them in the feed with the reason', () => {
    const c = parse(
      buildCalendar([
        ev({
          id: 'x',
          status: 'cancelled',
          cancelled_reason: 'Rain, field closed',
          starts_at: '2027-06-01T21:30:00Z',
          ends_at: '2027-06-01T23:00:00Z',
          revision: 2,
        }),
      ]),
    );
    const e = events(c)[0]!;
    expect(prop(e, 'STATUS')!.value).toBe('CANCELLED');
    expect(prop(e, 'SEQUENCE')!.value).toBe('1');
    expect(unescape(prop(e, 'DESCRIPTION')!.value)).toContain('CANCELLED: Rain, field closed');
  });

  it('round-trips awkward text (commas, semicolons, backslashes, newlines, unicode)', () => {
    const title = 'Game vs. Hawks; "Cup", round 2 \\ Équipe ⚽';
    const notes = 'Bring: water,\nboth jerseys; and a ball';
    const c = parse(
      buildCalendar([
        ev({
          id: 'g',
          type: 'game',
          title,
          notes,
          opponent_name: 'Hawks',
          home_away: 'home',
          location_name: 'Field 3',
          location_address: '1 Park Rd, Springfield',
          arrive_early_minutes: 30,
          starts_at: '2027-06-01T14:00:00Z',
          ends_at: '2027-06-01T16:00:00Z',
        }),
      ]),
    );
    const e = events(c)[0]!;
    expect(unescape(prop(e, 'SUMMARY')!.value)).toBe(title);
    expect(unescape(prop(e, 'LOCATION')!.value)).toBe('Field 3, 1 Park Rd, Springfield');
    const d = unescape(prop(e, 'DESCRIPTION')!.value);
    expect(d).toContain('vs. Hawks (home)');
    expect(d).toContain('Arrive 30 minutes early.');
    expect(d).toContain(notes);
    expect(prop(e, 'CATEGORIES')!.value).toBe('GAME');
  });

  it('never includes RSVP data, and every line is at most 75 octets', () => {
    const text = buildCalendar(series);
    expect(text).not.toMatch(/rsvp|going/i);
    for (const l of text.split('\r\n'))
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });

  it('emits UTC times for a zone the runtime does not know, and handles half-hour and southern zones', () => {
    const c = parse(
      buildCalendar([
        ev({
          id: 'u',
          timezone: 'Mars/Olympus',
          starts_at: '2027-06-01T14:00:00Z',
          ends_at: '2027-06-01T15:00:00Z',
        }),
        ev({
          id: 'k',
          timezone: 'Asia/Kolkata',
          starts_at: '2027-06-01T03:30:00Z',
          ends_at: '2027-06-01T04:30:00Z',
        }),
        ev({
          id: 's',
          timezone: 'Australia/Sydney',
          starts_at: '2027-01-15T07:00:00Z',
          ends_at: '2027-01-15T08:00:00Z',
        }),
      ]),
    );
    const [u, k, s] = events(c);
    expect(prop(u!, 'DTSTART')).toMatchObject({ params: {}, value: '20270601T140000Z' });
    expect(prop(k!, 'DTSTART')).toMatchObject({
      params: { TZID: 'Asia/Kolkata' },
      value: '20270601T090000',
    });
    expect(prop(s!, 'DTSTART')).toMatchObject({
      params: { TZID: 'Australia/Sydney' },
      value: '20270115T180000',
    });
    const kolkata = c.children.find(
      (x) => x.type === 'VTIMEZONE' && prop(x, 'TZID')?.value === 'Asia/Kolkata',
    )!;
    expect(prop(kolkata.children[0]!, 'TZOFFSETTO')!.value).toBe('+0530');
  });

  it('an empty feed is still a valid calendar', () => {
    expect(events(parse(buildCalendar([])))).toHaveLength(0);
  });
});
