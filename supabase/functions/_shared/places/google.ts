// Google Places API (New) proxy logic for the `places` Edge Function. Pure: the key and fetch are injected so it
// is unit-tested with a mocked fetch. The key never leaves the server and is never logged or echoed.
//
// Cost control: Autocomplete requests share a session token with the final Place Details call, and Details asks
// for ONE field mask (id, formattedAddress, location, addressComponents), the cheapest Details SKU: no
// displayName, photos, reviews or hours. We keep only what the user picks (address, lat, lng, place id).
import { z } from 'npm:zod@4.6.7';

export const PLACE_QUERY_MIN = 3;
export const PLACE_QUERY_MAX = 120;
export const DETAILS_FIELD_MASK = 'id,formattedAddress,location,addressComponents';
const BASE = 'https://places.googleapis.com/v1';

// Keep in step with placesRequestSchema in packages/core/src/geo-places.ts.
export const placesInput = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('autocomplete'),
    query: z.string().trim().min(PLACE_QUERY_MIN).max(PLACE_QUERY_MAX),
    sessionToken: z.uuid(),
    countryCodes: z
      .array(z.string().regex(/^[a-z]{2}$/i))
      .max(5)
      .optional(),
  }),
  z.object({
    action: z.literal('details'),
    placeId: z.string().min(1).max(300),
    sessionToken: z.uuid(),
    name: z.string().max(200).optional(),
  }),
]);
export type PlacesInput = z.infer<typeof placesInput>;

export class PlacesError extends Error {
  constructor(
    public code: 'not_configured' | 'places_unavailable' | 'place_not_found',
    public status: number,
  ) {
    super(code);
  }
}

type Deps = { apiKey: string | undefined; fetch?: typeof fetch };

async function google(deps: Deps, url: string, init: RequestInit): Promise<unknown> {
  if (!deps.apiKey) throw new PlacesError('not_configured', 503);
  const f = deps.fetch ?? fetch;
  let res: Response;
  try {
    res = await f(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), 'x-goog-api-key': deps.apiKey },
    });
  } catch {
    throw new PlacesError('places_unavailable', 502);
  }
  if (res.status === 404 || res.status === 400) throw new PlacesError('place_not_found', 404);
  if (!res.ok) throw new PlacesError('places_unavailable', 502);
  return res.json();
}

type Prediction = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
  };
};

export async function autocomplete(
  input: Extract<PlacesInput, { action: 'autocomplete' }>,
  deps: Deps,
) {
  const regions = (input.countryCodes?.length ? input.countryCodes : ['us']).map((c) =>
    c.toLowerCase(),
  );
  const body = (await google(deps, `${BASE}/places:autocomplete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      input: input.query,
      sessionToken: input.sessionToken,
      includedRegionCodes: regions,
    }),
  })) as { suggestions?: Prediction[] };
  const suggestions = (body.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<Prediction['placePrediction']> => !!p?.placeId)
    .slice(0, 5)
    .map((p) => ({
      placeId: p.placeId!,
      name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      secondary: p.structuredFormat?.secondaryText?.text ?? '',
      text: p.text?.text ?? '',
    }));
  return { suggestions };
}

type Component = { longText?: string; shortText?: string; types?: string[] };

export function toComponents(list: Component[]) {
  const get = (type: string, short = false) => {
    const c = list.find((x) => x.types?.includes(type));
    return (short ? c?.shortText : c?.longText) ?? '';
  };
  const line1 = [get('street_number'), get('route')].filter(Boolean).join(' ') || get('premise');
  return {
    line1,
    city:
      get('locality') ||
      get('postal_town') ||
      get('sublocality') ||
      get('administrative_area_level_3'),
    region: get('administrative_area_level_1', true),
    postal_code: get('postal_code'),
    country: get('country', true),
  };
}

export async function details(input: Extract<PlacesInput, { action: 'details' }>, deps: Deps) {
  const url = `${BASE}/places/${encodeURIComponent(input.placeId)}?sessionToken=${encodeURIComponent(input.sessionToken)}`;
  const p = (await google(deps, url, {
    method: 'GET',
    headers: { 'x-goog-fieldmask': DETAILS_FIELD_MASK },
  })) as {
    id?: string;
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    addressComponents?: Component[];
  };
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  if (!p.id || !p.formattedAddress || typeof lat !== 'number' || typeof lng !== 'number')
    throw new PlacesError('place_not_found', 404);
  return {
    selection: {
      placeId: p.id,
      name: (input.name ?? '').slice(0, 200),
      formattedAddress: p.formattedAddress.slice(0, 300),
      lat,
      lng,
      components: toComponents(p.addressComponents ?? []),
    },
  };
}

export async function handlePlaces(input: PlacesInput, deps: Deps) {
  return input.action === 'autocomplete' ? autocomplete(input, deps) : details(input, deps);
}
