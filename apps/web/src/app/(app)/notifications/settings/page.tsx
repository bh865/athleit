import { redirect } from 'next/navigation';

/** Notification settings now live in Account. */
export default function NotificationSettingsRedirect() {
  redirect('/account#notifications');
}
