'use client';

import { capabilitiesForPlace } from '@athleit/core';
import { useParams } from 'next/navigation';

import { useApp } from '@/components/app/app-provider';
import { StaffRegistrations } from '@/components/registration/staff-events';

export default function ClubRegistrationsPage() {
  const { id } = useParams<{ id: string }>();
  const { contexts } = useApp();
  const caps = capabilitiesForPlace(contexts, 'club', id);
  return <StaffRegistrations owner={{ clubId: id }} canManage={caps.has('registration.manage')} />;
}
