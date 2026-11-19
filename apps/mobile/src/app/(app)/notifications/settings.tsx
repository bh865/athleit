import { Redirect } from 'expo-router';

/** Notification settings now live in Account. */
export default function NotificationSettingsRedirect() {
  return <Redirect href={'/account/notifications' as never} />;
}
