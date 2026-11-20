import { type MyJoinRequest } from '@athleit/core';
import { getMyJoinRequests, subscribeToInApp } from '@athleit/db/api';
import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

/**
 * The person's own join requests. Reloads when the app returns to the foreground and when an
 * in-app notification arrives (approvals send one). When a request turns out approved, the
 * contexts are refreshed once so the new place appears without a restart.
 */
export function useMyRequests() {
  const { userId, refresh } = useApp();
  const load = useLoad(() => getMyJoinRequests(supabase), [userId]);
  const reload = load.reload;
  const refreshed = useRef(new Set<string>());

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') reload();
    });
    return () => sub.remove();
  }, [reload]);

  useEffect(() => {
    if (!userId) return;
    return subscribeToInApp(supabase, userId, () => reload());
  }, [userId, reload]);

  const requests = useMemo(() => (load.data ?? []) as MyJoinRequest[], [load.data]);
  useEffect(() => {
    const fresh = requests.filter(
      (r) => r.status === 'approved' && !refreshed.current.has(r.request_id),
    );
    if (fresh.length === 0) return;
    for (const r of fresh) refreshed.current.add(r.request_id);
    void refresh();
  }, [requests, refresh]);

  return { ...load, requests };
}
