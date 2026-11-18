'use client';

import { useTeam } from '@/components/app/team-context';
import { StaffRegistrations } from '@/components/registration/staff-events';

export default function TeamRegistrationsPage() {
  const { team, caps } = useTeam();
  return (
    <StaffRegistrations owner={{ teamId: team.id }} canManage={caps.has('registration.manage')} />
  );
}
