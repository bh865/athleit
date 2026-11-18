import { capabilitiesForPlace } from '@athleit/core';

import { AppScreen } from '@/components/app/app-screen';
import { PayScreen } from '@/components/payments/pay-screen';
import { StaffScreen } from '@/components/payments/staff-screen';
import { useApp } from '@/lib/app-provider';

/** Pay: guardians pay and see receipts; team/club staff see payouts, requests and collection. */
export default function PayRoute() {
  const { active, contexts } = useApp();
  if (active?.kind === 'team' || active?.kind === 'club') {
    const caps = capabilitiesForPlace(contexts, active.kind, active.id);
    return (
      <AppScreen>
        <StaffScreen
          owner={active.kind === 'team' ? { teamId: active.id } : { clubId: active.id }}
          canSend={caps.has('payments.manage')}
        />
      </AppScreen>
    );
  }
  return (
    <AppScreen>
      <PayScreen />
    </AppScreen>
  );
}
