import { secureBackend } from '@/lib/secure-storage';

/** Small persisted values (last context, pending invite). Failures never block the app. */
export const kv = {
  get: async (key: string): Promise<string | null> => {
    try {
      return await secureBackend.get(key);
    } catch {
      return null;
    }
  },
  set: async (key: string, value: string): Promise<void> => {
    try {
      await secureBackend.set(key, value);
    } catch {
      /* storage unavailable: just don't persist */
    }
  },
  remove: async (key: string): Promise<void> => {
    try {
      await secureBackend.remove(key);
    } catch {
      /* ignore */
    }
  },
};

export const CONTEXT_KEY = 'athleit.context';
export const PENDING_INVITE_KEY = 'athleit.pendingInvite';
/** Set from Welcome ("I have an invite or a code") so the hub opens the code path after sign-in. */
export const POST_AUTH_INTENT_KEY = 'athleit.postAuthIntent';
/** Set when an onboarding path completes, so the hub shows its quieter "returning" version. */
export const HUB_DONE_KEY = 'athleit.hubDone';
/** Set when the person chose "Skip for now" on the hub. */
export const HUB_SKIPPED_KEY = 'athleit.hubSkipped';
/** Set once the notifications soft-ask was answered ("Turn on" or "Not now"). */
export const NOTIF_ASKED_KEY = 'athleit.notifAsked';
