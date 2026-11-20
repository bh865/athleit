import { useCallback, useEffect, useState } from 'react';

import { kv } from '@/lib/kv';

/**
 * Local drafts, one per conversation. They live only on this device (never on the server) and
 * feed the inbox "Draft:" prefix. SecureStore values are small, so a draft is capped.
 */
const key = (threadId: string) => `athleit.draft.${threadId}`;
const MAX_STORED = 1800;

export const loadDraft = (threadId: string) => kv.get(key(threadId));

export async function saveDraft(threadId: string, text: string): Promise<void> {
  if (text.trim()) await kv.set(key(threadId), text.slice(0, MAX_STORED));
  else await kv.remove(key(threadId));
}

/** Threads whose offline outbox still holds an unsent message (shows "Failed to send" in the inbox). */
async function hasFailedSend(threadId: string): Promise<boolean> {
  try {
    const q = JSON.parse((await kv.get(`outbox.${threadId}`)) ?? '[]') as unknown[];
    return Array.isArray(q) && q.length > 0;
  } catch {
    return false;
  }
}

/** Drafts for the given threads, reloaded with `refresh()` (the inbox calls it on focus). */
export function useDrafts(threadIds: readonly string[]) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const joined = threadIds.join(',');
  const load = useCallback(async () => {
    const ids = joined ? joined.split(',') : [];
    const entries = await Promise.all(ids.map(async (id) => [id, await loadDraft(id)] as const));
    const bad = await Promise.all(ids.map(async (id) => ((await hasFailedSend(id)) ? id : null)));
    return {
      drafts: Object.fromEntries(entries.filter((e): e is [string, string] => Boolean(e[1]))),
      failed: new Set(bad.filter((id): id is string => id !== null)),
    };
  }, [joined]);
  const refresh = useCallback(
    () =>
      load().then((r) => {
        setDrafts(r.drafts);
        setFailed(r.failed);
      }),
    [load],
  );
  useEffect(() => {
    let live = true;
    void load().then((r) => {
      if (!live) return;
      setDrafts(r.drafts);
      setFailed(r.failed);
    });
    return () => {
      live = false;
    };
  }, [load]);
  return { drafts, failed, refresh };
}
