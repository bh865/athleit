// places: authenticated proxy to Google Places API (New) for address autocomplete and place details.
// Secret: GOOGLE_PLACES_API_KEY (Supabase Edge Function secret; never sent to a client). See docs/scheduling.md.
// Signed-in users only (the platform checks the JWT; userFunction re-checks it and rate limits per user).
import { json } from '../_shared/payments/http.ts';
import { env, userFunction } from '../_shared/payments/runtime.ts';
import { handlePlaces, PlacesError, placesInput } from '../_shared/places/google.ts';

userFunction(
  'places',
  (b) => placesInput.safeParse(b),
  { perMinute: 60 },
  async ({ input, log }) => {
    try {
      return json(await handlePlaces(input, { apiKey: env('GOOGLE_PLACES_API_KEY') }));
    } catch (e) {
      if (e instanceof PlacesError) {
        log('warn', 'places_failed', { code: e.code });
        return json({ error: e.code }, e.status);
      }
      throw e;
    }
  },
);
