import { createBrowserClient, createServerClient, type SetAllCookies } from '@supabase/ssr';

import type { Database } from './database.types';

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

/** Cookie access supplied by the framework (Next.js `cookies()` or middleware request/response). */
export interface ServerCookies {
  getAll: () => { name: string; value: string }[];
  setAll: SetAllCookies;
}

/** Client Components. Reads/writes the session via `document.cookie`. */
export function createBrowserSupabase({ url, anonKey }: SupabasePublicConfig) {
  return createBrowserClient<Database>(url, anonKey);
}

/**
 * Server Components, Server Actions, Route Handlers and middleware/proxy.
 * Create a new client per request; never share one across requests.
 */
export function createServerSupabase(
  { url, anonKey }: SupabasePublicConfig,
  cookies: ServerCookies,
) {
  return createServerClient<Database>(url, anonKey, { cookies });
}
