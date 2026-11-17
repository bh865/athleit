import { notificationSummary, type InAppPayload } from '@athleit/core';
import { subscribeToInApp } from '@athleit/db/api';
import * as Notifications from 'expo-notifications';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useToast } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { configureNotificationHandler, refreshPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';

configureNotificationHandler();

/**
 * Mounted in the signed-in layout: glass toasts for new in-app notifications (not for the open
 * thread), push registration refresh, and deep links when a notification is tapped (also from a
 * cold start). Signed-out taps land on sign-in and resume afterwards through the pending link.
 */
export function LiveNotifications() {
  const { userId } = useApp();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  });

  useEffect(() => {
    if (!userId) return;
    void refreshPush().catch(() => undefined);
    return subscribeToInApp(supabase, userId, (n) => {
      const s = notificationSummary(n.category, n.payload as InAppPayload);
      if (path.current === s.href) return;
      toast(`${s.title}: ${s.detail}`, 'neutral');
    });
  }, [userId, toast]);

  useEffect(() => {
    const open = (url: unknown) => {
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
    };
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) open((r.notification.request.content.data as { url?: string }).url);
    });
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      open((r.notification.request.content.data as { url?: string }).url),
    );
    return () => sub.remove();
  }, [router]);
  return null;
}
