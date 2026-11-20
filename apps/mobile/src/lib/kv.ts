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
