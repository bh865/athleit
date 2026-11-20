import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { createClient } from '@/lib/supabase/server';

// /help is public (proxy PUBLIC_PATHS is prefix matched), so everything under /help/requests enforces sign-in here.
export const metadata = { robots: { index: false, follow: false } };

export default async function RequestsLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect('/sign-in?next=/help/requests');
  return children;
}
