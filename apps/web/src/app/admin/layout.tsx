import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AdminProvider } from '@/components/admin/admin-provider';
import { AdminShell } from '@/components/admin/admin-shell';
import { MfaSetup } from '@/components/admin/mfa';
import { getAdminContext } from '@/lib/admin/context';

export const metadata: Metadata = {
  title: 'Athleit Admin',
  robots: { index: false, follow: false, nocache: true },
};
// Per-request: the session decides everything here.
export const dynamic = 'force-dynamic';

/**
 * Gate for every /admin page, in order: not signed in -> sign in; not a platform admin -> the app's ordinary
 * not-found (getAdminContext); no verified authenticator -> setup and nothing else. Reads work at aal1 (read-only
 * mode); the database requires aal2 for every write. Server actions re-check; this layout is not the only guard.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await getAdminContext();
  if (!ctx.factorId) return <MfaSetup role={ctx.role} stripeMode={ctx.stripeMode} />;
  return (
    <AdminProvider
      role={ctx.role}
      displayName={ctx.displayName}
      stripeMode={ctx.stripeMode}
      asOf={ctx.asOf}
      factorId={ctx.factorId}
      verifiedAt={ctx.verifiedAt}
    >
      <AdminShell>{children}</AdminShell>
    </AdminProvider>
  );
}
