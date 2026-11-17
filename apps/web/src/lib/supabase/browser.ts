'use client';

import type { Client } from '@athleit/db/api';
import { createBrowserSupabase } from '@athleit/db/web';

import { env } from '@/env';

let client: Client | undefined;

/** One browser client per tab (shares the auth session across components). */
export function getClient(): Client {
  client ??= createBrowserSupabase(env);
  return client;
}
