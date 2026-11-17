import {
  addRoleActions,
  buildContexts,
  pickContext,
  type AddRoleAction,
  type AppContext,
} from '@athleit/core';
import { loadContextSource } from '@athleit/db/api';
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
  displayName: string | null;
  contexts: AppContext[];
  active: AppContext | null;
  addActions: AddRoleAction[];
  setActive: (key: string) => void;
  refresh: () => Promise<void>;
}

interface Loaded {
  userId: string;
  name: string | null;
  contexts: AppContext[];
}

async function fetchAll(userId: string): Promise<Loaded | null> {
  const [source, profile] = await Promise.all([
    loadContextSource(supabase, userId),
    supabase.from('profiles').select('display_name').eq('id', userId).single(),
  ]);
  if (source.error) return null;
  return { userId, name: profile.data?.display_name ?? null, contexts: buildContexts(source.data) };
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

  const value = useMemo<AppState>(() => {
    const own = loaded && loaded.userId === userId ? loaded : null;
    const contexts = own?.contexts ?? [];
    return {
      status: !userId ? 'idle' : failed ? 'error' : own ? 'ready' : 'loading',
      userId,
      displayName: own?.name ?? null,
      contexts,
      active: pickContext(contexts, activeKey),
      addActions: addRoleActions(contexts),
      setActive: (key) => {
        setActiveKey(key);
        void kv.set(CONTEXT_KEY, key);
      },
      refresh,
    };
  }, [loaded, failed, userId, activeKey, refresh]);

  return <Ctx value={value}>{children}</Ctx>;
}

export function useApp() {
  const v = use(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}
