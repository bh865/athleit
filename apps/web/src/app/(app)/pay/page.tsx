'use client';

import { Suspense } from 'react';

import { PayView } from '@/components/payments/pay-view';
import { LoadingSkeleton } from '@/components/ui';

export default function PayPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <PayView />
    </Suspense>
  );
}
