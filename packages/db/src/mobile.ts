import { createClient, type SupportedStorage } from '@supabase/supabase-js';

import type { Database } from './database.types';
import type { SupabasePublicConfig } from './web';

export type { SupabasePublicConfig };

/**
 * React Native client. Pass a storage adapter backed by expo-secure-store so the
 * session lives in the keychain/keystore. PKCE is used for OAuth redirects; URL-based
 * session detection is a browser concept, so it's off.
 */
export function createMobileSupabase(
  { url, anonKey }: SupabasePublicConfig,
  storage: SupportedStorage,
) {
  return createClient<Database>(url, anonKey, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}
