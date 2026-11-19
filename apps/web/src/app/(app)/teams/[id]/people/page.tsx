'use client';

import { Suspense } from 'react';

import { LoadingSkeleton } from '@/components/ui';
import { PeopleTab } from '@/components/team/people';

export default function TeamPeoplePage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <PeopleTab />
    </Suspense>
  );
}
