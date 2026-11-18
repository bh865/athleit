import { payViewsFor } from '@athleit/core';
import { space } from '@athleit/tokens';
import { useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { PayScreen } from '@/components/payments/pay-screen';
import { StaffScreen } from '@/components/payments/staff-screen';
import { SegmentedControl } from '@/components/ui';
import { useApp } from '@/lib/app-provider';

/**
 * Pay. What you see comes from what you can DO, not from which place is active: guardians get
 * "My payments" (requests, pay, receipts); people with payments rights get "Team collection";
 * someone who is both gets both as segments.
 */
export default function PayRoute() {
  const { active, contexts } = useApp();
  const views = payViewsFor(contexts, active);
  const [picked, setPicked] = useState<'payer' | 'staff' | null>(null);
  const tab = picked ?? views.initial;
  const both = views.payer && views.staff !== null;

  return (
    <AppScreen>
      <View style={{ gap: space[4] }}>
        {both ? (
          <SegmentedControl
            label="Payments"
            value={tab}
            onChange={setPicked}
            options={[
              { value: 'payer', label: 'My payments' },
              { value: 'staff', label: 'Team collection' },
            ]}
          />
        ) : null}
        {tab === 'staff' && views.staff ? (
          <StaffScreen
            key={`${views.staff.kind}:${views.staff.id}`}
            owner={
              views.staff.kind === 'team' ? { teamId: views.staff.id } : { clubId: views.staff.id }
            }
            canSend={views.staff.canSend}
          />
        ) : (
          <PayScreen />
        )}
      </View>
    </AppScreen>
  );
}
