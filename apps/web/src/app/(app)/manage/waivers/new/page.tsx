'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { WaiverEditor } from '@/components/registration/waiver-editor';

function Inner() {
  const q = useSearchParams();
  const owner = q.get('team')
    ? { teamId: q.get('team') as string }
    : { clubId: q.get('club') as string };
  return <WaiverEditor waiverId={null} owner={owner} />;
}
export default function NewWaiverPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
