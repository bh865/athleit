'use client';

import { notificationSummary, type InAppPayload } from '@athleit/core';
import { subscribeToInApp } from '@athleit/db/api';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { useApp } from '@/components/app/app-provider';
import { useToast } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { refreshWebPush } from '@/lib/web-push';

/**
 * Mounted once in the app shell: shows a glass toast for each new in-app notification (never for
 * the thread you are looking at) and keeps this browser's push registration fresh.
 */
export function LiveNotifications() {
  const { userId } = useApp();
  const toast = useToast();
  const pathname = usePathname();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  });

  useEffect(() => {
    if (!userId) return;
    const client = getClient();
    void refreshWebPush(client).catch(() => undefined);
    return subscribeToInApp(client, userId, (n) => {
      const s = notificationSummary(n.category, n.payload as InAppPayload);
      if (path.current === s.href) return;
      toast(`${s.title}: ${s.detail}`, 'neutral');
    });
  }, [userId, toast]);
  return null;
}
