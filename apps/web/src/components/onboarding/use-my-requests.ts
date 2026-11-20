'use client';

import { type MyJoinRequest } from '@athleit/core';
import { getMyJoinRequests, subscribeToInApp } from '@athleit/db/api';
import { useEffect, useMemo, useRef } from 'react';

import { useApp } from '@/components/app/app-provider';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

/**
 * The person's own join requests. Reloads when the tab regains focus and when an in-app notification
 * arrives (approvals send one). When a request turns out approved, the contexts are refreshed once so
 * the new place appears without a reload.
 */
export function useMyRequests() {
  const { userId, refresh } = useApp();
  const load = useLoad(() => getMyJoinRequests(getClient()), [userId]);
  const reload = load.reload;
  const refreshed = useRef(new Set<string>());

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  useEffect(() => {
    if (!userId) return;
    return subscribeToInApp(getClient(), userId, () => reload());
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
