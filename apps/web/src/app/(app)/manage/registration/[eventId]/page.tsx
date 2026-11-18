'use client';

import { useParams } from 'next/navigation';

import { ManageEvent } from '@/components/registration/manage-event';

export default function ManageEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  return <ManageEvent eventId={eventId} />;
}
