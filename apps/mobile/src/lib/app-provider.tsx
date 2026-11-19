import {
  addRoleActions,
  buildContexts,
  pickContext,
  type AddRoleAction,
  type AppContext,
} from '@athleit/core';
import { getAvatarUrl, loadContextSource } from '@athleit/db/api';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/lib/auth';
import { CONTEXT_KEY, kv } from '@/lib/kv';
import { supabase } from '@/lib/supabase';

interface AppState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  userId: string | null;
  email: string | null;
  displayName: string | null;
  /** An https URL or a path in the avatars bucket (null = initials). */
  avatarValue: string | null;
  /** Displayable photo URL (signed for uploaded photos), or null. */
  avatarUrl: string | null;
  /** profiles.created_at, for "Member since". */
  memberSince: string | null;
  contexts: AppContext[];
  active: AppContext | null;
  addActions: AddRoleAction[];
  setActive: (key: string) => void;
  refresh: () => Promise<void>;
  /** Apply a profile change at once (header avatar and chip update without a reload). */
  updateProfile: (patch: { displayName?: string; avatarValue?: string | null }) => void;
}

interface Loaded {
  userId: string;
  name: string | null;
  avatar: string | null;
  createdAt: string | null;
  contexts: AppContext[];
}

async function fetchAll(userId: string): Promise<Loaded | null> {
  const [source, profile] = await Promise.all([
    loadContextSource(supabase, userId),
    supabase
      .from('profiles')
      .select('display_name, avatar_url, created_at')
      .eq('id', userId)
      .single(),
  ]);
  if (source.error) return null;
  return {
    userId,
    name: profile.data?.display_name ?? null,
    avatar: profile.data?.avatar_url ?? null,
    createdAt: profile.data?.created_at ?? null,
    contexts: buildContexts(source.data),
  };
}

const Ctx = createContext<AppState | null>(null);

/** Loads the signed-in user's contexts (family / team roles / club roles) once for the app. */
export function AppProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    kv.get(CONTEXT_KEY).then(setActiveKey);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetchAll(userId).then((next) => {
      if (!live) return;
      setFailed(next === null);
      if (next) setLoaded(next);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const next = await fetchAll(userId);
    setFailed(next === null);
    if (next) setLoaded(next);
  }, [userId]);

  const updateProfile = useCallback<AppState['updateProfile']>((patch) => {
    setLoaded((l) =>
      l
        ? {
            ...l,
            ...(patch.displayName !== undefined ? { name: patch.displayName } : {}),
            ...(patch.avatarValue !== undefined ? { avatar: patch.avatarValue } : {}),
          }
        : l,
    );
  }, []);

  // Uploaded photos are private: show them through a short-lived signed URL, renewed before it expires.
  const avatarValue = loaded && loaded.userId === userId ? loaded.avatar : null;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      void getAvatarUrl(supabase, avatarValue).then((u) => live && setAvatarUrl(u));
    load();
    const t =
      avatarValue && !/^https:/.test(avatarValue) ? setInterval(load, 50 * 60 * 1000) : null;
    return () => {
      live = false;
      if (t) clearInterval(t);
    };
  }, [avatarValue]);

  const value = useMemo<AppState>(() => {
    const own = loaded && loaded.userId === userId ? loaded : null;
    const contexts = own?.contexts ?? [];
    return {
      status: !userId ? 'idle' : failed ? 'error' : own ? 'ready' : 'loading',
      userId,
      email: session?.user.email ?? null,
      displayName: own?.name ?? null,
      avatarValue,
      avatarUrl: avatarValue ? avatarUrl : null,
      memberSince: own?.createdAt ?? null,
      contexts,
      active: pickContext(contexts, activeKey),
      addActions: addRoleActions(contexts),
      setActive: (key) => {
        setActiveKey(key);
        void kv.set(CONTEXT_KEY, key);
      },
      refresh,
      updateProfile,
    };
  }, [loaded, failed, userId, activeKey, refresh, updateProfile, avatarValue, avatarUrl, session]);

  return <Ctx value={value}>{children}</Ctx>;
}

export function useApp() {
  const v = use(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}
