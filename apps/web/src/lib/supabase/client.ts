import { createBrowserSupabase } from '@athleit/db/web';

import { env } from '@/env';

/** For Client Components. */
export function createClient() {
  return createBrowserSupabase(env);
}
