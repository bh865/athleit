import type { Client, Result } from './api';

/**
 * Address search through the `places` Edge Function (it holds the Google key; no key exists in any client).
 * The shapes match PlaceSuggestion / PlaceSelection in @athleit/core.
 */
export interface PlaceSuggestionDto {
  placeId: string;
  name: string;
  secondary: string;
  text: string;
}
export interface PlaceSelectionDto {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  components: { line1: string; city: string; region: string; postal_code: string; country: string };
}

async function invoke<T>(c: Client, body: Record<string, unknown>): Promise<Result<T>> {
  const { data, error } = await c.functions.invoke('places', { body });
  if (!error) return { data: data as T, error: null };
  // Non-2xx: the function answers {"error":"<code>"}; surface the code.
  const ctx = (error as { context?: Response }).context;
  let code = error.message;
  try {
    const j = (await ctx?.json()) as { error?: string };
    if (j?.error) code = j.error;
  } catch {
    /* keep the generic message */
  }
  return { data: null, error: { message: code } };
}

export const searchPlaces = (
  c: Client,
  a: { query: string; sessionToken: string; countryCodes?: string[] | undefined },
) =>
  invoke<{ suggestions: PlaceSuggestionDto[] }>(c, {
    action: 'autocomplete',
    query: a.query,
    sessionToken: a.sessionToken,
    ...(a.countryCodes?.length ? { countryCodes: a.countryCodes } : {}),
  });

export const getPlaceDetails = (
  c: Client,
  a: { placeId: string; sessionToken: string; name?: string | undefined },
) =>
  invoke<{ selection: PlaceSelectionDto }>(c, {
    action: 'details',
    placeId: a.placeId,
    sessionToken: a.sessionToken,
    ...(a.name ? { name: a.name } : {}),
  });
