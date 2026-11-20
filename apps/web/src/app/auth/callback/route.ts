import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

import { safeNext } from '@/lib/safe-next';

/** OAuth and email-confirmation links land here with a PKCE `code`. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));
  // A failed reset link goes back to the reset page, which says it has expired.
  const failure = next.startsWith('/auth/reset')
    ? '/auth/reset?error=expired'
    : '/sign-in?error=expired';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL(failure, origin));
}
