'use client';

import { IntentHub } from '@/components/onboarding/intent-hub';
import { PageHeader } from '@/components/ui';

/** Reachable from the account menu at any time, so nobody is stuck on a path they didn't want. */
export default function OnboardingHubPage() {
  return (
    <>
      <PageHeader
        title="What brings you here?"
        subtitle="Pick the closest one. You can add more later."
      />
      <IntentHub />
    </>
  );
}
