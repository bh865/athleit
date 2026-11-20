/** Small local flags for the first-run flow. Never required: when storage is blocked the flow still works. */
export const HUB_DONE_KEY = 'athleit.hubDone';
export const HUB_SKIPPED_KEY = 'athleit.hubSkipped';

export function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function setFlag(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
    window.dispatchEvent(new Event('athleit-flags'));
  } catch {
    /* storage unavailable: just don't persist */
  }
}

/** For useSyncExternalStore: re-reads when a flag is set here or in another tab. */
export function subscribeFlags(onChange: () => void): () => void {
  window.addEventListener('athleit-flags', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener('athleit-flags', onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** "done|skipped" as "10", "01", ... (a string so the snapshot is stable). */
export function flagsSnapshot(): string {
  return `${readFlag(HUB_DONE_KEY) ? 1 : 0}${readFlag(HUB_SKIPPED_KEY) ? 1 : 0}`;
}
