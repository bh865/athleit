import { getUnreadTotal, subscribeToNotifications } from '@athleit/db/api';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** Live unread-message total across the user's teams (tab-bar badge). */
export function useUnread(userId: string | null, enabled: boolean) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!userId || !enabled) return;
    const refresh = () =>
      void getUnreadTotal(supabase).then((r) => r.data !== null && setUnread(r.data));
    refresh();
    return subscribeToNotifications(supabase, userId, refresh);
  }, [userId, enabled]);
  return unread;
}
