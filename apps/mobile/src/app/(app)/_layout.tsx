import { Stack } from 'expo-router';
import { View } from 'react-native';

import { AppTabBar } from '@/components/app/app-tab-bar';
import { LiveNotifications } from '@/components/notifications/live-notifications';

export default function AppLayout() {
  return (
    <View style={{ flex: 1 }}>
      <LiveNotifications />
      <Stack screenOptions={{ headerShown: false }} />
      <AppTabBar />
    </View>
  );
}
