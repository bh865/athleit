'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { WaiverBuilder } from '@/components/builders/waiver-builder';

function Inner() {
  const { waiverId } = useParams<{ waiverId: string }>();
  const q = useSearchParams();
  return <WaiverBuilder waiverId={waiverId} owner={{}} returnTo={q.get('returnTo')} />;
}
export default function EditWaiverPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
