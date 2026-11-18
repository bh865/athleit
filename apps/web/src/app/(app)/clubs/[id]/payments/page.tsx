'use client';

import { Suspense } from 'react';

import { capabilitiesForPlace } from '@athleit/core';
import { useParams } from 'next/navigation';

import { useApp } from '@/components/app/app-provider';
import { PageHeader } from '@/components/ui';
import { StaffPayments } from '@/components/payments/staff-payments';

export default function ClubPaymentsPage() {
  const { id } = useParams<{ id: string }>();
  const { contexts } = useApp();
  const caps = capabilitiesForPlace(contexts, 'club', id);
  return (
    <Suspense fallback={null}>
      <PageHeader title="Payments" back={{ href: `/clubs/${id}`, label: 'Club' }} />
      <StaffPayments
        owner={{ clubId: id }}
        canSend={caps.has('payments.manage')}
        isAdmin={caps.has('payments.refund')}
      />
    </Suspense>
  );
}
