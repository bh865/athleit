'use client';

import { useTeam } from '@/components/app/team-context';
import { ComplianceTracker } from '@/components/registration/compliance-tracker';

export default function CompliancePage() {
  const { team, caps } = useTeam();
  return <ComplianceTracker teamId={team.id} canManage={caps.has('registration.manage')} />;
}
