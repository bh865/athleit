'use client';

import Link from 'next/link';

import { useTeam } from '@/components/app/team-context';
import { BillingPanel } from '@/components/billing/billing-panel';
import { Text } from '@/components/ui';

export default function TeamBillingPage() {
  const { team, caps } = useTeam();
  if (!caps.has('billing.view')) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Text variant="caption" muted>
        <Link href={`/teams/${team.id}/settings`}>Settings</Link> / Billing
      </Text>
      <BillingPanel teamId={team.id} />
    </div>
  );
}
