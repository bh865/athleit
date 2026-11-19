import { AppScreen } from '@/components/app/app-screen';
import { PayScreen } from '@/components/payments/pay-screen';

/** Pay is "My payments" only. Collecting money lives in the team's Payments tab. */
export default function PayRoute() {
  return (
    <AppScreen>
      <PayScreen />
    </AppScreen>
  );
}
