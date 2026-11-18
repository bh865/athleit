'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { EventBuilder } from '@/components/registration/event-builder';

function Inner() {
  const q = useSearchParams();
  const owner = q.get('team')
    ? { teamId: q.get('team') as string }
    : { clubId: q.get('club') as string };
  return <EventBuilder eventId={null} owner={owner} />;
}
export default function NewRegistrationPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
