import 'server-only';

import { isPlatformRole, type PlatformRole } from '@athleit/core';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

export type StripeMode = 'test' | 'live';

/** The Stripe mode comes from server config only (ADMIN_STRIPE_MODE), never from the client. Test unless set to "live". */
export const getStripeMode = (): StripeMode => (process.env.ADMIN_STRIPE_MODE === 'live' ? 'live' : 'test');

export interface AdminContext {
  userId: string;
  email: string;
  displayName: string;
  role: PlatformRole;
  /** A verified TOTP factor exists. Without one the portal shows setup and nothing else. */
  factorId: string | null;
  aal: 'aal1' | 'aal2';
  /** Unix seconds of the last TOTP verification in this session (drives the 15 minute edit window). */
  verifiedAt: number | null;
  stripeMode: StripeMode;
  asOf: string;
}

/**
 * Once per request: who is this, and are they a platform admin?
 * Not signed in: sign in (proxy.ts already redirects, this re-checks). Signed in but not an admin: the app's
 * ordinary not-found, never "access denied", so the route's existence is not revealed.
 */
export const getAdminContext = cache(async (): Promise<AdminContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: role } = await supabase.rpc('platform_admin_role');
  if (!isPlatformRole(role)) notFound();

  const [{ data: factors }, { data: aal }, { data: profile }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ]);
  const factorId = factors?.totp.find((f) => f.status === 'verified')?.id ?? null;
  const totp = aal?.currentAuthenticationMethods.find((m) => typeof m !== 'string' && m.method === 'totp');
  const totpAt = totp && typeof totp !== 'string' ? totp.timestamp : null;

  return {
    userId: user.id,
    email: user.email ?? '',
    displayName: profile?.display_name ?? user.email ?? 'Admin',
    role,
    factorId,
    aal: aal?.currentLevel === 'aal2' ? 'aal2' : 'aal1',
    verifiedAt: aal?.currentLevel === 'aal2' ? totpAt : null,
    stripeMode: getStripeMode(),
    asOf: new Date().toISOString(),
  };
});
