'use client';

import { useParams } from 'next/navigation';

import { RegistrationDetailView } from '@/components/registration/my-registrations';

export default function RegistrationDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <RegistrationDetailView id={id} />;
}
