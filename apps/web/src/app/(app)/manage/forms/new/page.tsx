'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { FormBuilder } from '@/components/registration/form-builder';

function Inner() {
  const q = useSearchParams();
  const owner = q.get('team')
    ? { teamId: q.get('team') as string }
    : { clubId: q.get('club') as string };
  return <FormBuilder formId={null} owner={owner} />;
}
export default function NewFormPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
