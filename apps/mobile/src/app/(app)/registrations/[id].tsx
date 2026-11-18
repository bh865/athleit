import { useLocalSearchParams } from 'expo-router';

import { AppScreen } from '@/components/app/app-screen';
import { RegistrationDetailScreen } from '@/components/registration/my-registrations';

export default function RegistrationDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <AppScreen>
      <RegistrationDetailScreen id={id} />
    </AppScreen>
  );
}
