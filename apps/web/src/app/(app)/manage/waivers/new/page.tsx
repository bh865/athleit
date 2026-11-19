'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { WaiverBuilder } from '@/components/builders/waiver-builder';

function Inner() {
  const q = useSearchParams();
  const owner = q.get('team')
    ? { teamId: q.get('team') as string }
    : { clubId: q.get('club') as string };
  return <WaiverBuilder waiverId={null} owner={owner} returnTo={q.get('returnTo')} />;
}
export default function NewWaiverPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
