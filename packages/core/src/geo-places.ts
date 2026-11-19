import { z } from 'zod';

/**
 * Address search ("Places") shared by web and mobile. Named geo-places to stay apart from `places.ts`,
 * which is about teams and clubs. We keep only what the user picks: address, lat, lng and place id.
 */

export const PLACE_QUERY_MIN = 3;
export const PLACE_QUERY_MAX = 120;
export const PLACE_DEBOUNCE_MS = 250;
export const DEFAULT_PLACE_COUNTRIES = ['us'] as const;

export const placeSuggestionSchema = z.object({
  placeId: z.string().min(1).max(300),
  /** The prediction's main text, e.g. "Riverside Park". Used as the suggested place name. */
  name: z.string().max(200),
  /** The rest of the line, e.g. "Austin, TX, USA". */
  secondary: z.string().max(300),
  text: z.string().max(500),
});
export type PlaceSuggestion = z.infer<typeof placeSuggestionSchema>;

export const placeComponentsSchema = z.object({
  line1: z.string().max(200),
  city: z.string().max(100),
  region: z.string().max(100),
  postal_code: z.string().max(20),
  country: z.string().max(100),
});
export type PlaceComponents = z.infer<typeof placeComponentsSchema>;

export const placeSelectionSchema = z.object({
  placeId: z.string().min(1).max(300),
  name: z.string().max(200),
  formattedAddress: z.string().min(1).max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  components: placeComponentsSchema,
});
export type PlaceSelection = z.infer<typeof placeSelectionSchema>;

export const placesRequestSchema = z.discriminatedUnion('action', [
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
export type PlacesRequest = z.infer<typeof placesRequestSchema>;

/** A UUID v4. Uses crypto.randomUUID when the runtime has it (React Native's Hermes may not). */
function uuidV4(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** A UUID v4 for a Google session; use one per typing session and a new one after each pick. */
export function newSessionToken(random: () => string = uuidV4): string {
  return random();
}

/** Keep the token across keystrokes, rotate it only after a selection. */
export function createPlaceSession(random?: () => string) {
  let token = newSessionToken(random);
  return {
    get token() {
      return token;
    },
    /** Call after the details call so the next search bills as a new session. */
    reset() {
      token = newSessionToken(random);
    },
  };
}

export function canSearch(query: string): boolean {
  return query.trim().length >= PLACE_QUERY_MIN;
}

/**
 * Debounce plus a stale-response guard. `search(q)` waits `delay` ms, runs `fetcher`, and calls
 * `onResult` only if no newer search (or `cancel()`) happened since. Pure: timers are injectable.
 */
export function createPlaceSearcher<T>(opts: {
  fetcher: (query: string) => Promise<T>;
  onResult: (result: T, query: string) => void;
  onError?: (error: unknown, query: string) => void;
  onIdle?: () => void;
  delay?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}) {
  const delay = opts.delay ?? PLACE_DEBOUNCE_MS;
  const setT = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = opts.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let timer: unknown = null;
  let seq = 0;
  return {
    search(query: string) {
      seq += 1;
      const mine = seq;
      if (timer != null) clearT(timer);
      timer = null;
      if (!canSearch(query)) {
        opts.onIdle?.();
        return;
      }
      timer = setT(() => {
        timer = null;
        opts.fetcher(query.trim()).then(
          (r) => {
            if (mine === seq) opts.onResult(r, query.trim());
          },
          (e) => {
            if (mine === seq) opts.onError?.(e, query.trim());
          },
        );
      }, delay);
    },
    cancel() {
      seq += 1;
      if (timer != null) clearT(timer);
      timer = null;
    },
  };
}

export type MapsTarget = {
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  name?: string | null;
};

function queryFor(t: MapsTarget): string | null {
  const text = [t.name, t.address].filter(Boolean).join(', ').trim();
  if (t.address?.trim()) return t.address.trim();
  if (text) return text;
  if (t.lat != null && t.lng != null) return `${t.lat},${t.lng}`;
  return null;
}

/**
 * Google Maps link for a place. With a place id it opens the exact place; without one it falls back
 * to a text search (address, else name, else coordinates). Null when there is nothing to search for.
 */
export function mapsUrl(t: MapsTarget): string | null {
  const q = queryFor(t);
  if (!q) return null;
  const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  return t.placeId ? `${base}&query_place_id=${encodeURIComponent(t.placeId)}` : base;
}

/**
 * URL for an embeddable map with a pin (iframe on web, WebView on mobile). Uses exact coordinates when
 * known, else the address, name or typed text. Null when there is nothing to show.
 */
export function mapEmbedUrl(t: MapsTarget): string | null {
  const q =
    t.lat != null && t.lng != null
      ? `${t.lat},${t.lng}`
      : t.address?.trim() || t.name?.trim() || null;
  return q ? `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed` : null;
}

/** Turn-by-turn directions to the place. */
export function directionsUrl(t: MapsTarget): string | null {
  const q = queryFor(t);
  if (!q) return null;
  const base = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
  return t.placeId ? `${base}&destination_place_id=${encodeURIComponent(t.placeId)}` : base;
}

/** The fields of a saved `locations` row for a picked place. */
export function locationFromSelection(p: PlaceSelection, name?: string) {
  return {
    name: (name?.trim() || p.name || p.components.line1 || p.formattedAddress).slice(0, 100),
    address: p.formattedAddress.slice(0, 300),
    lat: p.lat,
    lng: p.lng,
    place_id: p.placeId,
  };
}

/** One-off place text for an event (events.location_text, 200 max): "Name, address", or just the address. */
export function placeText(p: PlaceSelection): string {
  const text =
    p.name && !p.formattedAddress.toLowerCase().startsWith(p.name.toLowerCase())
      ? `${p.name}, ${p.formattedAddress}`
      : p.formattedAddress;
  return text.slice(0, 200);
}
