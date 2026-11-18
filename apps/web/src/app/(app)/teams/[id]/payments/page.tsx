'use client';

import { Suspense } from 'react';

import { StaffPayments } from '@/components/payments/staff-payments';
import { useTeam } from '@/components/app/team-context';

export default function TeamPaymentsPage() {
  const { team, caps } = useTeam();
  return (
    <Suspense fallback={null}>
      <StaffPayments
        owner={{ teamId: team.id }}
        canSend={caps.has('payments.manage')}
        isAdmin={caps.has('payments.refund')}
      />
    </Suspense>
  );
}
