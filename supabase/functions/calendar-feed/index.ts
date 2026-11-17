// Per-user ICS calendar feed at a secret-token URL:
//   https://<project>.supabase.co/functions/v1/calendar-feed/<64-hex token>.ics
// Auth is the token alone (verify_jwt = false in supabase/config.toml, because Apple and Google
// Calendar cannot send an Authorization header). Only the SHA-256 of the token is stored; it can be
// revoked or rotated from the app, after which this returns 404. The token is never logged.
//
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform. Optional APP_URL
// (the web app's origin) adds a link back to each event.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

import { createRateLimiter, handleFeed } from '../_shared/feed.ts';
import type { FeedEvent } from '../_shared/ics.ts';

const env = (k: string) => Deno.env.get(k) || undefined;
const db = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ipLimiter = createRateLimiter(60, 60_000);
const tokenLimiter = createRateLimiter(20, 60_000);

Deno.serve((req) =>
  handleFeed(req, {
    ipLimiter,
    tokenLimiter,
    appUrl: env('APP_URL'),
    async resolveToken(token) {
      const { data, error } = await db.rpc('resolve_calendar_feed_token', { p_token: token });
      if (error) throw new Error('resolve_failed');
      return (data as string | null) ?? null;
    },
    async loadEvents(profileId) {
      const { data, error } = await db.rpc('calendar_feed_events', { p_profile_id: profileId });
      if (error) throw new Error('load_failed');
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        ...r,
        status: r.status === 'cancelled' ? 'cancelled' : 'scheduled',
      })) as FeedEvent[];
    },
  }),
);
