import { AppScreen } from '@/components/app/app-screen';
import { useScreenTitle } from '@/components/app/screen-title';
import { NotificationSettings } from '@/components/account/notification-settings';

export default function AccountNotificationsScreen() {
  useScreenTitle('Notifications');
  return (
    <AppScreen>
      <NotificationSettings />
    </AppScreen>
  );
}
