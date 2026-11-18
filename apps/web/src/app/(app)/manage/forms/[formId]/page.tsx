'use client';

import { useParams } from 'next/navigation';

import { FormBuilder } from '@/components/registration/form-builder';

export default function EditFormPage() {
  const { formId } = useParams<{ formId: string }>();
  return <FormBuilder formId={formId} owner={{}} />;
}
