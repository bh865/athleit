import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppProvider } from '@/components/app/app-provider';
import { Shell } from '@/components/app/shell';
import { createClient } from '@/lib/supabase/server';

/** Signed-in app. proxy.ts already redirects guests; this re-checks on the server. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return (
    <AppProvider>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
