'use client';

import { payViewsFor } from '@athleit/core';
import { Suspense, useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import { PayView } from '@/components/payments/pay-view';
import { StaffPayments } from '@/components/payments/staff-payments';
import { LoadingSkeleton, PageHeader, SegmentedControl } from '@/components/ui';

/**
 * Pay. What you see follows what you can do, not which place is active: guardians get "My payments",
 * people with payments rights get "Team collection", and someone who is both gets both as segments.
 */
function PayPage() {
  const { active, contexts } = useApp();
  const views = payViewsFor(contexts, active);
  const [picked, setPicked] = useState<'payer' | 'staff' | null>(null);
  const tab = picked ?? views.initial;
  const both = views.payer && views.staff !== null;
  const staff = views.staff;
  return (
    <>
      <PageHeader
        title="Pay"
        subtitle={
          tab === 'staff' && staff
            ? `Collection for ${staff.title}`
            : 'Requests, payments and receipts'
        }
        actions={
          both ? (
            <SegmentedControl
              label="Payments"
              value={tab}
              onChange={setPicked}
              options={[
                { value: 'payer', label: 'My payments' },
                { value: 'staff', label: 'Team collection' },
              ]}
            />
          ) : null
        }
      />
      {tab === 'staff' && staff ? (
        <StaffPayments
          key={`${staff.kind}:${staff.id}`}
          owner={staff.kind === 'team' ? { teamId: staff.id } : { clubId: staff.id }}
          canSend={staff.canSend}
          isAdmin={staff.isAdmin}
        />
      ) : (
        <PayView />
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <PayPage />
    </Suspense>
  );
}
