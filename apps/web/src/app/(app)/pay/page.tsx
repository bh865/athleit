'use client';

import { Suspense } from 'react';

import { PayView } from '@/components/payments/pay-view';
import { LoadingSkeleton, PageHeader } from '@/components/ui';

/** Pay is "My payments" only. Collecting money lives in the team's Payments tab (and the club's payments page). */
function PayPage() {
  return (
    <>
      <PageHeader title="Pay" subtitle="Requests, payments and receipts" />
      <PayView />
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
