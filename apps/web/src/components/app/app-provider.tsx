'use client';

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

import { getClient } from '@/lib/supabase/browser';

const STORAGE_KEY = 'athleit.context';

interface AppState {
  status: 'loading' | 'ready' | 'error';
  userId: string | null;
  email: string | null;
  displayName: string | null;
  contexts: AppContext[];
  active: AppContext | null;
  addActions: AddRoleAction[];
  setActive: (key: string) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

const read = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
const write = (key: string) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* storage unavailable (private mode): the context just won't persist */
  }
};

interface Loaded {
  user: { id: string; email: string | null; name: string | null };
  contexts: AppContext[];
}

async function fetchAll(): Promise<Loaded | null> {
  const client = getClient();
  const { data } = await client.auth.getUser();
  if (!data.user) return null;
  const [source, profile] = await Promise.all([
    loadContextSource(client, data.user.id),
    client.from('profiles').select('display_name').eq('id', data.user.id).single(),
  ]);
  if (source.error) return null;
  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
      name: profile.data?.display_name ?? null,
    },
    contexts: buildContexts(source.data),
  };
}

/** Loads the signed-in user's contexts (family / team roles / club roles) once for the app. */
export function AppProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(() => read());

  const refresh = useCallback(async () => {
    const next = await fetchAll();
    setFailed(next === null);
    if (next) setLoaded(next);
  }, []);

  useEffect(() => {
    let live = true;
    fetchAll().then((next) => {
      if (!live) return;
      setFailed(next === null);
      if (next) setLoaded(next);
    });
    return () => {
      live = false;
    };
  }, []);

  const value = useMemo<AppState>(() => {
    const contexts = loaded?.contexts ?? [];
    return {
      status: failed ? 'error' : loaded ? 'ready' : 'loading',
      userId: loaded?.user.id ?? null,
      email: loaded?.user.email ?? null,
      displayName: loaded?.user.name ?? null,
      contexts,
      active: pickContext(contexts, activeKey),
      addActions: addRoleActions(contexts),
      setActive: (key) => {
        setActiveKey(key);
        write(key);
      },
      refresh,
    };
  }, [loaded, failed, activeKey, refresh]);

  return <Ctx value={value}>{children}</Ctx>;
}

export function useApp() {
  const v = use(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}
