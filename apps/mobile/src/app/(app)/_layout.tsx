import { Stack } from 'expo-router';

import { LiveNotifications } from '@/components/notifications/live-notifications';

export default function AppLayout() {
  return (
    <>
      <LiveNotifications />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
