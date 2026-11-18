import { describe, expect, it, vi } from 'vitest';

import {
  canSearch,
  createPlaceSearcher,
  createPlaceSession,
  directionsUrl,
  mapsUrl,
  placeSelectionSchema,
  placesRequestSchema,
} from './geo-places';

const uuid = '3f1c2b4e-9a7d-4c1e-8b2a-5d6e7f8a9b0c';

describe('schemas', () => {
  it('accepts a full selection and rejects bad coordinates', () => {
    const ok = {
      placeId: 'ChIJ1',
      name: 'Riverside Park',
      formattedAddress: '1 Park Rd, Austin, TX 78701, USA',
      lat: 30.2,
      lng: -97.7,
      components: {
        line1: '1 Park Rd',
        city: 'Austin',
        region: 'TX',
        postal_code: '78701',
        country: 'US',
      },
    };
    expect(placeSelectionSchema.safeParse(ok).success).toBe(true);
    expect(placeSelectionSchema.safeParse({ ...ok, lat: 91 }).success).toBe(false);
    expect(placeSelectionSchema.safeParse({ ...ok, formattedAddress: '' }).success).toBe(false);
  });
  it('enforces the minimum query and a uuid session token', () => {
    const base = { action: 'autocomplete', sessionToken: uuid };
    expect(placesRequestSchema.safeParse({ ...base, query: 'ab' }).success).toBe(false);
    expect(placesRequestSchema.safeParse({ ...base, query: ' abc ' }).success).toBe(true);
    expect(placesRequestSchema.safeParse({ ...base, query: 'x'.repeat(121) }).success).toBe(false);
    expect(
      placesRequestSchema.safeParse({ ...base, query: 'abc', sessionToken: 'nope' }).success,
    ).toBe(false);
    expect(
      placesRequestSchema.safeParse({ action: 'details', placeId: 'p', sessionToken: uuid })
        .success,
    ).toBe(true);
  });
});

describe('session', () => {
  it('keeps the token until reset', () => {
    let n = 0;
    const s = createPlaceSession(() => `t${++n}`);
    expect(s.token).toBe('t1');
    expect(s.token).toBe('t1');
    s.reset();
    expect(s.token).toBe('t2');
  });
});

describe('createPlaceSearcher', () => {
  it('debounces, and ignores stale responses', async () => {
    vi.useFakeTimers();
    const resolvers: Record<string, (v: string) => void> = {};
    const onResult = vi.fn();
    const s = createPlaceSearcher<string>({
      fetcher: (q) => new Promise((res) => (resolvers[q] = res)),
      onResult,
    });
    s.search('abc');
    s.search('abcd');
    await vi.advanceTimersByTimeAsync(249);
    expect(Object.keys(resolvers)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(Object.keys(resolvers)).toEqual(['abcd']);
    s.search('abcde');
    await vi.advanceTimersByTimeAsync(250);
    resolvers['abcde']?.('new');
    resolvers['abcd']?.('old');
    await Promise.resolve();
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith('new', 'abcde');
    vi.useRealTimers();
  });
  it('goes idle under the minimum and cancels', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue('x');
    const onIdle = vi.fn();
    const s = createPlaceSearcher({ fetcher, onResult: vi.fn(), onIdle });
    s.search('ab');
    expect(onIdle).toHaveBeenCalled();
    s.search('abc');
    s.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(fetcher).not.toHaveBeenCalled();
    expect(canSearch('  ab ')).toBe(false);
    vi.useRealTimers();
  });
});

describe('maps urls', () => {
  it('uses the place id when there is one', () => {
    expect(mapsUrl({ placeId: 'ChIJ1', address: '1 Park Rd, Austin' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=1%20Park%20Rd%2C%20Austin&query_place_id=ChIJ1',
    );
  });
  it('falls back to a text search, then coordinates, then nothing', () => {
    expect(mapsUrl({ name: 'Field 3' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=Field%203',
    );
    expect(mapsUrl({ lat: 1, lng: 2 })).toContain('query=1%2C2');
    expect(mapsUrl({})).toBeNull();
    expect(directionsUrl({ placeId: 'p', address: 'A' })).toContain('destination_place_id=p');
    expect(directionsUrl({})).toBeNull();
  });
});

import { locationInputSchema } from './schemas/scheduling';

describe('locationInputSchema', () => {
  const team_id = '11111111-1111-4111-8111-111111111111';
  it('carries address, coordinates and place id', () => {
    const r = locationInputSchema.safeParse({
      team_id,
      name: 'Field 3',
      address: '1 Park Rd',
      lat: 1,
      lng: 2,
      place_id: 'ChIJ1',
    });
    expect(r.success && r.data.place_id).toBe('ChIJ1');
  });
  it('still needs lat and lng together and a non-empty place id', () => {
    expect(locationInputSchema.safeParse({ team_id, name: 'x', lat: 1 }).success).toBe(false);
    expect(locationInputSchema.safeParse({ team_id, name: 'x', place_id: '' }).success).toBe(false);
  });
});
