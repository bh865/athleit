/**
 * Local drafts, one per conversation, in localStorage. They never leave this browser and feed the
 * inbox "Draft:" prefix. Every access is guarded: storage can be missing or blocked.
 */
const key = (threadId: string) => `athleit.draft.${threadId}`;

export function readDraft(threadId: string): string | null {
  try {
    return window.localStorage.getItem(key(threadId));
  } catch {
    return null;
  }
}

export function writeDraft(threadId: string, text: string): void {
  try {
    if (text.trim()) window.localStorage.setItem(key(threadId), text);
    else window.localStorage.removeItem(key(threadId));
  } catch {
    /* storage unavailable: the draft just isn't kept */
  }
}
