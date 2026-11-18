import { useLocalSearchParams } from 'expo-router';

import { AppScreen } from '@/components/app/app-screen';
import { ManageEventScreen } from '@/components/registration/staff';

export default function ManageEventRoute() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  return (
    <AppScreen>
      <ManageEventScreen eventId={eventId} />
    </AppScreen>
  );
}
