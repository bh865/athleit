'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { FormBuilder } from '@/components/builders/form-builder';

function Inner() {
  const { formId } = useParams<{ formId: string }>();
  const q = useSearchParams();
  return <FormBuilder formId={formId} owner={{}} returnTo={q.get('returnTo')} />;
}
export default function EditFormPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
