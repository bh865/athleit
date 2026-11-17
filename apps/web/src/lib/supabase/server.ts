import { createServerSupabase } from '@athleit/db/web';
import { cookies } from 'next/headers';

import { env } from '@/env';

/** For Server Components, Server Actions and Route Handlers. Create one per request. */
export async function createClient() {
  const store = await cookies();
  return createServerSupabase(env, {
    getAll: () => store.getAll(),
    setAll: (list) => {
      try {
        for (const { name, value, options } of list) store.set(name, value, options);
      } catch {
        // Called from a Server Component, which can't write cookies. Safe to ignore:
        // proxy.ts refreshes the session and writes the cookies on every request.
      }
    },
  });
}
