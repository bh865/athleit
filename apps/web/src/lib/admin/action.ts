import 'server-only';

import { roleAtLeast, type PlatformRole } from '@athleit/core';
import { adminErrorCode, getPlatformRole, type AdminErrorCode } from '@athleit/db/admin';
import type { Client, Result } from '@athleit/db/api';

import { createClient } from '@/lib/supabase/server';

/** What every admin server action returns. Errors are typed so the UI maps them to the design's states; none is swallowed. */
export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; code: AdminErrorCode; message: string };

/**
 * Run an admin action with the CALLER'S session (never a service role). The role is re-checked here for a clean
 * `not_authorized`, but the database (platform role plus aal2) is the authority: this check is convenience only.
 */
export async function runAdminAction<T>(
  minRole: PlatformRole,
  fn: (c: Client) => Promise<Result<T>>,
): Promise<ActionResult<T>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: 'not_authenticated', message: 'Your session expired. Sign in again to keep going.' };
  const role = await getPlatformRole(supabase);
  if (role.error || !roleAtLeast(role.data, minRole)) {
    return { ok: false, code: 'not_authorized', message: 'Page not found.' };
  }
  const res = await fn(supabase);
  if (res.error) return { ok: false, code: adminErrorCode(res.error), message: res.error.message };
  return { ok: true, data: res.data };
}
