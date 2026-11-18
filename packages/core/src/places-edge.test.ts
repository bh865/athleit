import { describe, expect, it, vi } from 'vitest';

import {
  DETAILS_FIELD_MASK,
  PlacesError,
  handlePlaces,
  placesInput,
  toComponents,
} from '../../../supabase/functions/_shared/places/google';
import { placesRequestSchema } from './geo-places';

const token = '3f1c2b4e-9a7d-4c1e-8b2a-5d6e7f8a9b0c';
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('places edge', () => {
  it('has the same input rules as the client schema', () => {
    for (const body of [
      { action: 'autocomplete', query: 'ab', sessionToken: token },
      { action: 'autocomplete', query: 'abc', sessionToken: token },
      { action: 'autocomplete', query: 'abc', sessionToken: 'x' },
      { action: 'details', placeId: 'p', sessionToken: token },
      { action: 'details', placeId: '', sessionToken: token },
    ])
      expect(placesInput.safeParse(body).success).toBe(placesRequestSchema.safeParse(body).success);
  });

  it('autocomplete sends the key, token and us default, and returns main text', async () => {
    const f = vi.fn().mockResolvedValue(
      ok({
        suggestions: [
          {
            placePrediction: {
              placeId: 'ChIJ1',
              text: { text: 'Riverside Park, Austin, TX, USA' },
              structuredFormat: {
                mainText: { text: 'Riverside Park' },
                secondaryText: { text: 'Austin, TX, USA' },
              },
            },
          },
          { queryPrediction: { text: { text: 'ignored' } } },
        ],
      }),
    );
    const r = await handlePlaces(
      { action: 'autocomplete', query: 'river', sessionToken: token },
      { apiKey: 'KEY', fetch: f as never },
    );
    expect(r).toEqual({
      suggestions: [
        {
          placeId: 'ChIJ1',
          name: 'Riverside Park',
          secondary: 'Austin, TX, USA',
          text: 'Riverside Park, Austin, TX, USA',
        },
      ],
    });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(init.headers['x-goog-api-key']).toBe('KEY');
    expect(JSON.parse(init.body)).toEqual({
      input: 'river',
      sessionToken: token,
      includedRegionCodes: ['us'],
    });
  });

  it('autocomplete honors a country override', async () => {
    const f = vi.fn().mockResolvedValue(ok({}));
    await handlePlaces(
      { action: 'autocomplete', query: 'abc', sessionToken: token, countryCodes: ['CA'] },
      { apiKey: 'K', fetch: f as never },
    );
    expect(JSON.parse(f.mock.calls[0]![1].body).includedRegionCodes).toEqual(['ca']);
  });

  it('details uses the cheap field mask and the same session token', async () => {
    const f = vi.fn().mockResolvedValue(
      ok({
        id: 'ChIJ1',
        formattedAddress: '1 Park Rd, Austin, TX 78701, USA',
        location: { latitude: 30.2, longitude: -97.7 },
        addressComponents: [
          { longText: '1', types: ['street_number'] },
          { longText: 'Park Rd', types: ['route'] },
          { longText: 'Austin', types: ['locality'] },
          { longText: 'Texas', shortText: 'TX', types: ['administrative_area_level_1'] },
          { longText: '78701', types: ['postal_code'] },
          { longText: 'United States', shortText: 'US', types: ['country'] },
        ],
      }),
    );
    const r = await handlePlaces(
      { action: 'details', placeId: 'ChIJ1', sessionToken: token, name: 'Riverside Park' },
      { apiKey: 'K', fetch: f as never },
    );
    expect(r).toEqual({
      selection: {
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
      },
    });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toContain(`sessionToken=${token}`);
    expect(init.headers['x-goog-fieldmask']).toBe(DETAILS_FIELD_MASK);
    expect(DETAILS_FIELD_MASK).toBe('id,formattedAddress,location,addressComponents');
  });

  it('fails closed: no key, upstream error, thrown fetch, incomplete place', async () => {
    const q = { action: 'autocomplete', query: 'abc', sessionToken: token } as const;
    await expect(handlePlaces(q, { apiKey: undefined })).rejects.toMatchObject({
      code: 'not_configured',
      status: 503,
    });
    const bad = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }));
    await expect(handlePlaces(q, { apiKey: 'K', fetch: bad as never })).rejects.toMatchObject({
      code: 'places_unavailable',
    });
    const boom = vi.fn().mockRejectedValue(new Error('network KEY'));
    const e = await handlePlaces(q, { apiKey: 'K', fetch: boom as never }).catch((x) => x);
    expect(e).toBeInstanceOf(PlacesError);
    expect(String(e.message)).not.toContain('KEY');
    const noLoc = vi.fn().mockResolvedValue(ok({ id: 'p', formattedAddress: 'x' }));
    await expect(
      handlePlaces(
        { action: 'details', placeId: 'p', sessionToken: token },
        { apiKey: 'K', fetch: noLoc as never },
      ),
    ).rejects.toMatchObject({ code: 'place_not_found' });
  });

  it('maps components with fallbacks', () => {
    expect(toComponents([{ longText: 'Boston', types: ['postal_town'] }]).city).toBe('Boston');
    expect(toComponents([]).line1).toBe('');
  });
});
