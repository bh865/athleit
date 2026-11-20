import { createServerSupabase } from '@athleit/db/web';
import { NextResponse, type NextRequest } from 'next/server';

import { env } from '@/env';

/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_PATHS = [
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/check-email',
  '/auth',
  '/dev',
  '/.well-known',
  '/r',
  '/register/verify',
  '/captcha',
];
const AUTH_ONLY_GUEST_PATHS = ['/sign-in', '/sign-up'];

const matches = (pathname: string, bases: string[]) =>
  bases.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Refreshes the Supabase session cookie on every request and gates routes.
 * Follows the @supabase/ssr Next.js pattern: do not put logic between creating the
 * client and calling getClaims(), and always return the response that carries the cookies.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerSupabase(env, {
    getAll: () => request.cookies.getAll(),
    setAll: (list, headers) => {
      for (const { name, value } of list) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of list) response.cookies.set(name, value, options);
      for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    },
  });

  // getClaims() validates the JWT and refreshes it when needed.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string, next?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = next ? `?next=${encodeURIComponent(next)}` : '';
    const redirect = NextResponse.redirect(url);
    // Keep any refreshed session cookies on the redirect response.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const [key, value] of response.headers) {
      if (key.toLowerCase() === 'cache-control' || key === 'expires' || key === 'pragma') {
        redirect.headers.set(key, value);
      }
    }
    return redirect;
  };

  if (!signedIn && !matches(pathname, PUBLIC_PATHS)) {
    // Remember where they were going (e.g. an invite link) so sign-in can return them there.
    return redirectTo('/sign-in', pathname === '/' ? undefined : pathname + request.nextUrl.search);
  }
  if (signedIn && matches(pathname, AUTH_ONLY_GUEST_PATHS)) {
    return redirectTo('/', undefined);
  }
  return response;
}
