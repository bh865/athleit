import { IntentHub } from '@/components/onboarding/intent-hub';
import { useScreenTitle } from '@/components/app/screen-title';
import { AppScreen } from '@/components/app/app-screen';

/** Reachable from More at any time, so nobody is stuck on a path they didn't want. */
export default function OnboardingHubScreen() {
  return (
    <AppScreen>
      <Hub />
    </AppScreen>
  );
}

function Hub() {
  useScreenTitle('Join or start');
  return <IntentHub />;
}
