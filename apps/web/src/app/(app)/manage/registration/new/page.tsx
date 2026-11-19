'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { RegistrationBuilder } from '@/components/builders/registration-builder';

function Inner() {
  const q = useSearchParams();
  const owner = q.get('team')
    ? { teamId: q.get('team') as string }
    : { clubId: q.get('club') as string };
  return <RegistrationBuilder eventId={null} owner={owner} />;
}
export default function NewRegistrationPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
